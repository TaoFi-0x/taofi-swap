// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.22;

import {Initializable} from "oz5/proxy/utils/Initializable.sol";
import {EnumerableSet} from "oz5/utils/structs/EnumerableSet.sol";
import {ECDSA} from "oz5/utils/cryptography/ECDSA.sol";

import {IMultiOwnableSmartAccount} from "../interfaces/IMultiOwnableSmartAccount.sol";
import {IBeaconProxyFactory} from "../interfaces/IBeaconProxyFactory.sol";
import {ISmartAccountRegistry} from "../interfaces/ISmartAccountRegistry.sol";

contract MultiOwnableSmartAccount is IMultiOwnableSmartAccount, Initializable {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using ECDSA for bytes32;

    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 public constant NAME_HASH = keccak256("MultiOwnableSmartAccount");

    bytes32 public constant VERSION_HASH = keccak256("1");

    bytes32 public constant TYPEHASH_EXECUTE = keccak256(
        "ExecuteWithSig(uint8 namespace,bytes32 managerId,address target,uint256 value,bytes32 dataHash,uint256 nonce,uint256 deadline)"
    );

    bytes32 public constant TYPEHASH_BATCH_EXECUTE = keccak256(
        "BatchExecuteWithSig(uint8 namespace,bytes32 managerId,bytes32 targetsHash,bytes32 valuesHash,bytes32 payloadsHash,uint256 nonce,uint256 deadline)"
    );

    struct MultiOwnableSmartAccountStorage {
        /// @notice The address of the factory.
        address factory;
        /// @notice The set of owners.
        EnumerableSet.Bytes32Set owners;
        /// @notice The nonce for each owner.
        mapping(bytes32 => uint256) nonces;
    }

    function _getMultiOwnableSmartAccountStorage() internal pure returns (MultiOwnableSmartAccountStorage storage $) {
        bytes32 slot = keccak256(abi.encode(uint256(keccak256("taofi.contracts.storage.MultiOwnableSmartAccount")) - 1))
            & ~bytes32(uint256(0xff));

        assembly {
            $.slot := slot
        }
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "MOSA:NOT_SELF");

        _;
    }

    modifier onlyOwner() {
        require(isOwner(_toOwnerId(msg.sender)), "MOSA:NOT_OWNER");

        _;
    }

    receive() external payable {}

    function initialize(address factory, bytes32[] memory initialOwnerIds) external initializer {
        MultiOwnableSmartAccountStorage storage $ = _getMultiOwnableSmartAccountStorage();
        $.factory = factory;

        for (uint256 i = 0; i < initialOwnerIds.length; i++) {
            $.owners.add(initialOwnerIds[i]);
            emit OwnerAdded(initialOwnerIds[i]);
        }
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function getFactory() public view returns (address) {
        return _getMultiOwnableSmartAccountStorage().factory;
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function getOwners() public view returns (bytes32[] memory) {
        return _getMultiOwnableSmartAccountStorage().owners.values();
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function isOwner(bytes32 ownerId) public view returns (bool) {
        return _getMultiOwnableSmartAccountStorage().owners.contains(ownerId);
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function getNonce(bytes32 ownerId) public view returns (uint256) {
        return _getMultiOwnableSmartAccountStorage().nonces[ownerId];
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function domainSeparatorV4() public view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function addOwner(bytes32 ownerId) external onlySelf {
        require(!isOwner(ownerId), "MOSA:ALREADY_OWNER");

        _getMultiOwnableSmartAccountStorage().owners.add(ownerId);

        address smartAccountRegistry = IBeaconProxyFactory(getFactory()).smartAccountRegistry();
        ISmartAccountRegistry(smartAccountRegistry).registerSmartAccount(ownerId);

        emit OwnerAdded(ownerId);
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function removeOwner(bytes32 ownerId) external onlySelf {
        require(isOwner(ownerId), "MOSA:NOT_OWNER");

        address smartAccountRegistry = IBeaconProxyFactory(getFactory()).smartAccountRegistry();
        ISmartAccountRegistry(smartAccountRegistry).unregisterSmartAccount(ownerId);

        _getMultiOwnableSmartAccountStorage().owners.remove(ownerId);

        emit OwnerRemoved(ownerId);
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function executeCall(address target, uint256 value, bytes memory data) external payable onlyOwner {
        _execute(target, value, data);
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function executeCalls(address[] memory targets, uint256[] memory values, bytes[] memory data)
        external
        payable
        onlyOwner
    {
        for (uint256 i = 0; i < targets.length; i++) {
            _execute(targets[i], values[i], data[i]);
        }
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function executeWithSig(
        uint8 namespace,
        bytes32 managerId,
        address target,
        uint256 value,
        bytes calldata data,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external payable {
        address expectedSigner = address(uint160(uint256(managerId)));

        require(namespace == 1, "MOSA:NS_UNSUPPORTED");
        require(block.timestamp <= deadline, "MOSA:EXPIRED");
        require(isOwner(managerId), "MOSA:NOT_OWNER");

        MultiOwnableSmartAccountStorage storage $ = _getMultiOwnableSmartAccountStorage();
        require(nonce == $.nonces[managerId], "MOSA:BAD_NONCE");

        bytes32 structHash = keccak256(
            abi.encode(TYPEHASH_EXECUTE, namespace, managerId, target, value, keccak256(data), nonce, deadline)
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparatorV4(), structHash));
        address signer = ECDSA.recover(digest, signature);
        require(signer == expectedSigner, "MOSA:BAD_SIG");

        $.nonces[managerId]++;

        _execute(target, value, data);
    }

    /// @inheritdoc IMultiOwnableSmartAccount
    function batchExecuteWithSig(
        uint8 namespace,
        bytes32 managerId,
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external payable {
        address expectedSigner = address(uint160(uint256(managerId)));

        require(namespace == 1, "MOSA:NS_UNSUPPORTED");
        require(targets.length == values.length && targets.length == payloads.length, "MOSA:LENGTH_MISMATCH");
        require(block.timestamp <= deadline, "MOSA:EXPIRED");
        require(isOwner(managerId), "MOSA:NOT_OWNER");
        require(nonce == getNonce(managerId), "MOSA:BAD_NONCE");

        {
            bytes32 structHash = keccak256(
                abi.encode(
                    TYPEHASH_BATCH_EXECUTE,
                    namespace,
                    managerId,
                    keccak256(abi.encodePacked(targets)),
                    keccak256(abi.encodePacked(values)),
                    _hashBytesArray(payloads),
                    nonce,
                    deadline
                )
            );

            bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparatorV4(), structHash));
            address signer = ECDSA.recover(digest, signature);
            require(signer == expectedSigner, "MOSA:BAD_SIG");
        }

        _getMultiOwnableSmartAccountStorage().nonces[managerId]++;

        for (uint256 i = 0; i < targets.length; i++) {
            _execute(targets[i], values[i], payloads[i]);
        }
    }

    /// @dev Executes a single call.
    /// @param target The address of the target contract.
    /// @param value The value to send with the call.
    /// @param data The data to send with the call.
    function _execute(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory ret) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(ret, 0x20), mload(ret)) // bubble inner reason
            }
        }
    }

    /// @dev Hashes an array of bytes.
    /// @param payloads The array of bytes to hash.
    /// @return The hash of the array of bytes.
    function _hashBytesArray(bytes[] calldata payloads) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](payloads.length);
        for (uint256 i = 0; i < payloads.length; i++) {
            hashes[i] = keccak256(payloads[i]);
        }
        return keccak256(abi.encodePacked(hashes));
    }

    /// @dev Converts an EVM address to the canonical bytes32 ownerId (left-padded).
    function _toOwnerId(address account) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(account)));
    }
}
