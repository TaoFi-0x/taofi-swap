// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.22;

/// @notice Interface for the MultiOwnableSmartAccount smart contract (bytes32 owners).
interface IMultiOwnableSmartAccount {
    /// @notice Event emitted when an owner is added.
    /// @param ownerId The bytes32 owner identifier that was added.
    event OwnerAdded(bytes32 indexed ownerId);

    /// @notice Event emitted when an owner is removed.
    /// @param ownerId The bytes32 owner identifier that was removed.
    event OwnerRemoved(bytes32 indexed ownerId);

    /// @notice Returns the address of the factory.
    /// @return factory The address of the factory.
    function getFactory() external view returns (address factory);

    /// @notice The set of owners (as bytes32 identifiers).
    /// @return owners The set of owners.
    function getOwners() external view returns (bytes32[] memory owners);

    /// @notice Checks if the given ownerId is an owner.
    /// @param ownerId The bytes32 owner identifier to check.
    /// @return isOwner True if the ownerId is an owner, false otherwise.
    function isOwner(bytes32 ownerId) external view returns (bool isOwner);

    /// @notice The nonce for the given ownerId.
    /// @param ownerId The bytes32 owner identifier.
    /// @return nonce The nonce for the given ownerId.
    function getNonce(bytes32 ownerId) external view returns (uint256 nonce);

    /// @notice The domain separator for the smart account.
    /// @return domainSeparator The domain separator for EIP-712.
    function domainSeparatorV4() external view returns (bytes32 domainSeparator);

    /// @notice Sets the initial owners of the smart account.
    /// @param initialOwnerIds The bytes32 owner identifiers to set as initial owners.
    function setInitialOwners(bytes32[] memory initialOwnerIds) external;

    /// @notice Adds an owner to the smart account.
    /// @param ownerId The bytes32 owner identifier to add.
    function addOwner(bytes32 ownerId) external;

    /// @notice Removes an owner from the smart account.
    /// @param ownerId The bytes32 owner identifier to remove.
    function removeOwner(bytes32 ownerId) external;

    /// @notice Executes a single call.
    /// @param target The address of the target contract.
    /// @param value The ETH value to send with the call.
    /// @param data The calldata to send with the call.
    function executeCall(address target, uint256 value, bytes memory data) external payable;

    /// @notice Executes multiple calls.
    /// @param targets The addresses of the target contracts.
    /// @param values The ETH values to send with the calls.
    /// @param data The calldatas to send with the calls.
    function executeCalls(address[] memory targets, uint256[] memory values, bytes[] memory data) external payable;

    /// @notice Executes a single call with a signature.
    /// @param namespace Namespace of the manager (e.g., 1 = EVM/secp256k1).
    /// @param managerId The bytes32 manager/owner identifier authorizing this call.
    /// @param target The address of the target contract.
    /// @param value The ETH value to send.
    /// @param data The calldata to send.
    /// @param nonce The expected nonce for this managerId.
    /// @param deadline The expiration timestamp for the signature.
    /// @param signature The EIP-712 signature authorizing the call.
    function executeWithSig(
        uint8 namespace,
        bytes32 managerId,
        address target,
        uint256 value,
        bytes calldata data,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external payable;

    /// @notice Executes multiple calls with a single signature.
    /// @param namespace Namespace of the manager (e.g., 1 = EVM/secp256k1).
    /// @param managerId The bytes32 manager/owner identifier authorizing these calls.
    /// @param targets Target addresses for each call.
    /// @param values ETH values for each call.
    /// @param payloads Calldatas for each call.
    /// @param nonce The expected nonce for this managerId.
    /// @param deadline The expiration timestamp for the signature.
    /// @param signature The EIP-712 signature authorizing the batch.
    function batchExecuteWithSig(
        uint8 namespace,
        bytes32 managerId,
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external payable;
}
