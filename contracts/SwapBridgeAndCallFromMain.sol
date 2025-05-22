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

/// @title SwapBridgeAndCallFromMain
/// @author Jason (Sturdy) https://github.com/iris112
/// @notice ERC20/ETH -> BridgeToken(Ethereum) -> BridgeToken(Bittensor EVM) -> Remote Call(Bittensor EVM)
contract SwapBridgeAndCallFromMain is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct RemoteCallsParams {
        bytes32 router;
        bytes32 ism;
        Call[] calls;
        bytes hookMetadata;
        bytes32 userSalt;
    }

    struct ExternalCall {
        address target;
        uint256 value;
        bytes data;
    }

    uint256 private constant PERCENTAGE_FACTOR = 100_00;
    uint32 private constant DESTINATION_CHAIN_ID = 964;

    uint256 public fee;
    uint256 public feeAmount;

    address public bridgeToken;
    address public bridge;
    address public interchainAccountRouter;

    event FeeUpdated(uint256 newFee);
    event BridgeTokenUpdated(address newBridgeToken);
    event BridgeUpdated(address newBridge);
    event InterchainAccountRouterUpdated(address newInterchainAccountRouter);
    event SwapAndBridgeExecuted(address indexed target, bytes data);

    error INVALID_FEE_VALUE();
    error INVALID_ADDRESS();
    error INVALID_VALUE();
    error NOT_CONTRACT();
    error SWAP_FAILED();
    error BRIDGE_FAILED();
    error EXTERNAL_CALL_FAILED();
    error INVALID_TARGET();

    /**
     * @dev Set the fee of the swap and bridge.
     * @param _fee - The fee percentage value. 1% = 100
     */
    function setFee(uint256 _fee) external payable onlyOwner {
        if (_fee > PERCENTAGE_FACTOR) revert INVALID_FEE_VALUE();

        fee = _fee;

        emit FeeUpdated(_fee);
    }

    /**
     * @dev Set the bridge token contract address.
     * @param _bridgeToken - The address of the bridge token contract.
     */
    function setBridgeToken(address _bridgeToken) external payable onlyOwner {
        bridgeToken = _bridgeToken;

        emit BridgeTokenUpdated(_bridgeToken);
    }

    /**
     * @dev Set the bridge contract address.
     * @param _bridge - The address of the bridge contract.
     */
    function setBridge(address _bridge) external payable onlyOwner {
        bridge = _bridge;

        emit BridgeUpdated(_bridge);
    }

    /**
     * @dev Set the interchainAccountRouter contract address which is for remote call.
     * @param _interchainAccountRouter - The address of the interchainAccountRouter contract
     */
    function setInterchainAccountRouter(address _interchainAccountRouter) external payable onlyOwner {
        interchainAccountRouter = _interchainAccountRouter;

        emit InterchainAccountRouterUpdated(_interchainAccountRouter);
    }

    /**
     * @dev withdraw fee from the contract
     * @param _amount The withdrawal fee amount
     * @param _treasury The treasury address
     */
    function withdrawFee(uint256 _amount, address _treasury) external payable onlyOwner {
        feeAmount -= _amount;
        IERC20(bridgeToken).safeTransfer(_treasury, _amount);
    }

    /**
     * @dev Executes a token swap via LiFi, bridge to Bittensor EVM and call remote function of Bittensor EVM contract.
     *      ex: ERC20/ETH(Ethereum) -> USDC(Ethereum) -> USDC(Bittensor EVM) -> Remote Call(Bittensor EVM)
     * @param _fromToken The address of the swap from token
     * @param _fromAmount The amount of the swap from token
     * @param _approvalAddress The address of the approval address of lifi swap.
     * @param _target The address of the lifi related contract.
     * @param _data The call data to be sent to the target contract.
     * @param _params The call data array for the remote call of the dest chain.
     */
    function lifiSwapBridgeAndCall(
        address _fromToken,
        uint256 _fromAmount,
        address _approvalAddress,
        address _target,
        bytes calldata _data,
        RemoteCallsParams calldata _params
    ) external payable nonReentrant {
        if (_fromAmount == 0) revert INVALID_VALUE();
        if (_approvalAddress == address(0)) revert INVALID_ADDRESS();
        if (_target == address(0)) revert INVALID_ADDRESS();
        if (!Address.isContract(_target)) revert NOT_CONTRACT();

        if (_fromToken == address(0)) {
            // fromToken is ETH
            if (msg.value < _fromAmount) revert SWAP_FAILED();

            // LiFi Swap
            _executeExternalCall(_target, _fromAmount, _data);
        } else {
            // transfer
            IERC20(_fromToken).safeTransferFrom(msg.sender, address(this), _fromAmount);

            // Approve
            IERC20(_fromToken).safeApprove(_approvalAddress, 0);
            IERC20(_fromToken).safeApprove(_approvalAddress, _fromAmount);

            // LiFi Swap
            _executeExternalCall(_target, 0, _data);
        }

        emit SwapAndBridgeExecuted(_target, _data);

        _bridgeAndCall(_params);
    }

    /**
     * @dev Executes a dest chain function to process exception case
     * @param _params The call data array for the remote call of the dest chain.
     */
    function remoteCall(RemoteCallsParams calldata _params) public payable nonReentrant {
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
     * @dev Executes external calls, remote calls and external calls again.
     * @param preRemoteCalls The external calls to be executed before the remote call.
     * @param remoteCalls The remote call to be executed.
     * @param postRemoteCalls The external calls to be executed after the remote call.
     */
    function remoteCallWithExternalCalls(
        ExternalCall[] calldata preRemoteCalls,
        RemoteCallsParams calldata remoteCalls,
        ExternalCall[] calldata postRemoteCalls
    ) external nonReentrant {
        for (uint256 i = 0; i < preRemoteCalls.length; i++) {
            _executeExternalCall(preRemoteCalls[i].target, preRemoteCalls[i].value, preRemoteCalls[i].data);
        }

        remoteCall(remoteCalls);

        for (uint256 i = 0; i < postRemoteCalls.length; i++) {
            _executeExternalCall(postRemoteCalls[i].target, postRemoteCalls[i].value, postRemoteCalls[i].data);
        }
    }

    function _bridgeAndCall(RemoteCallsParams calldata _params) internal {
        address _toToken = bridgeToken;
        address _bridge = bridge;
        uint256 toAmount = IERC20(_toToken).balanceOf(address(this)) - feeAmount;
        if (toAmount == 0) revert SWAP_FAILED();

        // fee processing
        uint256 swapAmount = (toAmount * (PERCENTAGE_FACTOR - fee)) / PERCENTAGE_FACTOR;
        feeAmount += toAmount - swapAmount;

        // Bridge + Call via Hyperlane
        if (msg.value <= 1 wei) revert BRIDGE_FAILED();

        IERC20(_toToken).safeApprove(_bridge, 0);
        IERC20(_toToken).safeApprove(_bridge, swapAmount);

        // Get the interchain account address for the contract on the destination chain
        IInterchainAccountRouter ica = IInterchainAccountRouter(interchainAccountRouter);
        bytes32 userSpecificSalt = bytes32(uint256(uint160(msg.sender)));

        address userIcaOnDestination =
            ica.getRemoteInterchainAccount(DESTINATION_CHAIN_ID, address(this), userSpecificSalt);

        // Bridge
        IBridge(_bridge).transferRemote{value: 1 wei}(
            DESTINATION_CHAIN_ID, bytes32(uint256(uint160(userIcaOnDestination))), swapAmount
        );

        // Execute the specified interchain calls using the remaining gas funds
        IInterchainAccountRouterWithOverrides(interchainAccountRouter).callRemoteWithOverrides{value: msg.value - 1 wei}(
            DESTINATION_CHAIN_ID,
            _params.router, // Or your bytes32 router override
            _params.ism, // Or your bytes32 ISM override
            _params.calls,
            _params.hookMetadata,
            userSpecificSalt
        );
    }

    function _executeExternalCall(address target, uint256 value, bytes calldata data) internal {
        if (target == interchainAccountRouter) {
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
