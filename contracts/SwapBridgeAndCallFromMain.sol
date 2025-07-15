// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {
    IInterchainAccountRouter,
    IInterchainAccountRouterWithOverrides,
    Call
} from "./interfaces/IInterchainAccountRouter.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title SwapBridgeAndCallFromMain
/// @author Jason (Sturdy) https://github.com/iris112
/// @notice ERC20/ETH -> BridgeToken(Ethereum) -> BridgeToken(Bittensor EVM) -> Remote Call(Bittensor EVM)
contract SwapBridgeAndCallFromMain is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    struct SwapParams {
        address fromToken;
        uint256 fromAmount;
        address approvalAddress;
        address target;
        bytes data;
    }

    struct RemoteCallsParams {
        bytes32 router;
        bytes32 ism;
        Call[] calls;
        bytes hookMetadata;
    }

    struct ExternalCall {
        address target;
        uint256 value;
        bytes data;
    }

    uint256 private constant PERCENTAGE_FACTOR = 100_00;
    uint32 private constant DESTINATION_CHAIN_ID = 964;

    address public bridgeToken;
    address public bridge;
    address public interchainAccountRouter;
    address public treasury;

    mapping(address => bool) public isTargetAddressBlacklisted;

    // to => selector => allowed
    mapping(bytes32 => mapping(bytes4 => bool)) public allowedRemoteCalls;

    event BridgeTokenUpdated(address newBridgeToken);
    event BridgeUpdated(address newBridge);
    event InterchainAccountRouterUpdated(address newInterchainAccountRouter);
    event SwapAndBridgeExecuted(address indexed target, bytes data);
    event TargetAddressBlacklisted(address indexed target);
    event AllowedRemoteCallUpdated(bytes32 indexed target, bytes4 indexed selector, bool allowed);

    error INVALID_ADDRESS();
    error INVALID_VALUE();
    error NOT_CONTRACT();
    error SWAP_FAILED();
    error BRIDGE_FAILED();
    error EXTERNAL_CALL_FAILED();
    error INVALID_TARGET();
    error UNAUTHORIZED_CALL_TYPE();

    function initialize() external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        _disableInitializers();
    }

    /**
     * @dev Set the bridge token contract address.
     * @param _bridgeToken - The address of the bridge token contract.
     */
    function setBridgeToken(address _bridgeToken) external payable onlyOwner {
        require(_bridgeToken.code.length > 0, "Invalid bridge token address");
        bridgeToken = _bridgeToken;

        emit BridgeTokenUpdated(_bridgeToken);
    }

    /**
     * @dev Set the bridge contract address.
     * @param _bridge - The address of the bridge contract.
     */
    function setBridge(address _bridge) external payable onlyOwner {
        require(_bridge.code.length > 0, "Invalid bridge address");
        bridge = _bridge;

        emit BridgeUpdated(_bridge);
    }

    /**
     * @dev Set the interchainAccountRouter contract address which is for remote call.
     * @param _interchainAccountRouter - The address of the interchainAccountRouter contract
     */
    function setInterchainAccountRouter(address _interchainAccountRouter) external payable onlyOwner {
        require(_interchainAccountRouter.code.length > 0, "Invalid interchain account router address");
        interchainAccountRouter = _interchainAccountRouter;

        emit InterchainAccountRouterUpdated(_interchainAccountRouter);
    }

    /**
     * @dev Set the target address to be blacklisted.
     * @param _target - The address of the target.
     * @param _isBlacklisted - The boolean value to determine if the target is blacklisted.
     */
    function setTargetAddressBlacklisted(address _target, bool _isBlacklisted) external payable onlyOwner {
        isTargetAddressBlacklisted[_target] = _isBlacklisted;

        emit TargetAddressBlacklisted(_target);
    }

    /**
     * @dev Adds or removes an allowed remote function selector for a given target.
     * @param _target The target address (as bytes32) to control permissions for.
     * @param _selector The 4-byte function selector to allow or disallow.
     * @param _allowed A boolean indicating whether the call is permitted.
     */
    function setAllowedRemoteCall(bytes32 _target, bytes4 _selector, bool _allowed) external payable onlyOwner {
        allowedRemoteCalls[_target][_selector] = _allowed;

        emit AllowedRemoteCallUpdated(_target, _selector, _allowed);
    }

    /**
     * @dev Executes a token swap via LiFi, bridge to Bittensor EVM and call remote function of Bittensor EVM contract.
     *      ex: ERC20/ETH(Ethereum) -> USDC(Ethereum) -> USDC(Bittensor EVM) -> Remote Call(Bittensor EVM)
     * @param _swapParams The parameters for the swap. Including the from token, from amount, approval address, target and data.
     * @param _params The parameters for the remote call.
     * @param _bridgeCost The cost of the bridge.
     * @param _feeReferral The referral fee.
     */
    function lifiSwapBridgeAndCall(
        SwapParams calldata _swapParams,
        RemoteCallsParams calldata _params,
        uint256 _bridgeCost,
        bytes calldata _feeReferral
    ) external payable nonReentrant {
        address _fromToken = _swapParams.fromToken;
        uint256 _fromAmount = _swapParams.fromAmount;
        address _approvalAddress = _swapParams.approvalAddress;
        address _target = _swapParams.target;
        bytes calldata _data = _swapParams.data;

        if (_fromAmount == 0) revert INVALID_VALUE();

        uint256 valueSpent = _fromToken == address(0) ? _fromAmount : 0;
        address _toToken = bridgeToken;

        if (_fromToken == _toToken) {
            // No need LiFi Swap and just transfer
            IERC20(_fromToken).safeTransferFrom(msg.sender, address(this), _fromAmount);
        } else {
            if (_approvalAddress == address(0)) revert INVALID_ADDRESS();
            if (_target == address(0)) revert INVALID_ADDRESS();
            if (!Address.isContract(_target)) revert NOT_CONTRACT();

            if (_fromToken == address(0)) {
                // fromToken is ETH
                if (msg.value < _fromAmount + _bridgeCost) revert SWAP_FAILED();

                // LiFi Swap
                _executeExternalCall(_target, _fromAmount, _data);
            } else {
                // transfer
                IERC20(_fromToken).safeTransferFrom(msg.sender, address(this), _fromAmount);

                // Approve
                IERC20(_fromToken).forceApprove(_approvalAddress, _fromAmount);

                // LiFi Swap
                _executeExternalCall(_target, 0, _data);

                uint256 remainingBalance = IERC20(_fromToken).balanceOf(address(this));
                if (remainingBalance > 0) revert SWAP_FAILED();
            }

            emit SwapAndBridgeExecuted(_target, _data);
        }

        _bridgeAndCall(_params, valueSpent, _bridgeCost, _feeReferral);
    }

    /**
     * @dev Executes a dest chain function to process exception case
     * @param _params The call data array for the remote call of the dest chain.
     */
    function remoteCall(RemoteCallsParams calldata _params) external payable nonReentrant {
        uint256 callCnt = _params.calls.length;
        for (uint256 i; i < callCnt; ++i) {
            if (!isAllowedRemoteCall(_params.calls[i])) revert UNAUTHORIZED_CALL_TYPE();
        }

        bytes32 userSpecificSalt = bytes32(uint256(uint160(msg.sender)));
        IInterchainAccountRouterWithOverrides(interchainAccountRouter).callRemoteWithOverrides{value: msg.value}(
            DESTINATION_CHAIN_ID,
            _params.router, // Or your bytes32 router override
            _params.ism, // Or your bytes32 ISM override
            _params.calls,
            _params.hookMetadata,
            userSpecificSalt
        );
    }

    /**
     * @dev Allows the contract owner to recover ERC20 tokens that were mistakenly sent to this contract.
     *      Can be used in emergency cases to transfer out stuck tokens.
     * @param token The address of the ERC20 token to recover.
     * @param to The address that will receive the recovered tokens.
     * @param amount The amount of tokens to transfer.
     */
    function emergencyTokenRecovery(address token, address to, uint256 amount) external payable onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @dev Allows the contract owner to recover native ETH that was mistakenly sent to this contract.
     *      Can be used in emergency cases to transfer out stuck ETH.
     * @param to The address that will receive the recovered ETH.
     * @param amount The amount of ETH to transfer.
     */
    function emergencyETHRecovery(address to, uint256 amount) external payable onlyOwner {
        (bool success,) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @dev Checks whether a given remote call is allowed.
     *      Validates both the target and the function selector against the whitelist.
     * @param _call The call struct containing the target, value, and calldata.
     * @return True if the call is authorized, false otherwise.
     */
    function isAllowedRemoteCall(Call calldata _call) public view returns (bool) {
        if (_call.data.length < 4) return false; // Invalid call data

        return allowedRemoteCalls[_call.to][bytes4(_call.data)];
    }

    function _bridgeAndCall(
        RemoteCallsParams calldata _params,
        uint256 valueSpent,
        uint256 _bridgeCost,
        bytes calldata feeReferral
    ) internal {
        address _toToken = bridgeToken;
        address _bridge = bridge;
        uint256 toAmount = IERC20(_toToken).balanceOf(address(this));
        if (toAmount == 0) revert SWAP_FAILED();

        // fee processing
        uint256 swapAmount = toAmount;

        IERC20(_toToken).forceApprove(_bridge, swapAmount);

        // Get the interchain account address for the contract on the destination chain
        IInterchainAccountRouterWithOverrides ica = IInterchainAccountRouterWithOverrides(interchainAccountRouter);
        bytes32 userSpecificSalt = bytes32(uint256(uint160(msg.sender)));

        // Avoid stack too deep
        {
            address routerAddress = address(uint160(uint256(_params.router)));
            address ismAddress = address(uint160(uint256(_params.ism)));
            address userIcaOnDestination =
                ica.getRemoteInterchainAccount(address(this), routerAddress, ismAddress, userSpecificSalt);

            // Bridge
            IBridge(_bridge).transferRemote{value: _bridgeCost}(
                DESTINATION_CHAIN_ID, bytes32(uint256(uint160(userIcaOnDestination))), swapAmount
            );
        }

        // Execute the specified interchain calls using the remaining gas funds
        IInterchainAccountRouterWithOverrides(interchainAccountRouter).callRemoteWithOverrides{
            value: msg.value - valueSpent - _bridgeCost
        }(
            DESTINATION_CHAIN_ID,
            _params.router, // Or your bytes32 router override
            _params.ism, // Or your bytes32 ISM override
            _params.calls,
            _params.hookMetadata,
            userSpecificSalt
        );
    }

    function _executeExternalCall(address target, uint256 value, bytes calldata data) internal {
        if (isTargetAddressBlacklisted[target]) {
            revert INVALID_TARGET();
        }

        bool success;

        if (value == 0) {
            (success,) = target.call(data);
        } else {
            (success,) = target.call{value: value}(data);
        }

        if (!success) revert EXTERNAL_CALL_FAILED();
    }
}
