// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {IInterchainAccountRouter, Call} from "./interfaces/IInterchainAccountRouter.sol";

/// @title SwapBridgeAndCallFromMain
/// @author Jason (Sturdy) https://github.com/iris112
/// @notice ERC20/ETH -> BridgeToken(Ethereum) -> BridgeToken(Bittensor EVM) -> Remote Call(Bittensor EVM)
contract SwapBridgeAndCallFromMain is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

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
    event SwapAndBridgeExecuted(
        address indexed target,
        bytes data,
        bool success
    );

    error INVALID_FEE_VALUE();
    error INVALID_ADDRESS();
    error INVALID_VALUE();
    error NOT_CONTRACT();
    error SWAP_FAILED();
    error BRIDGE_FAILED();

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
    function setInterchainAccountRouter(
        address _interchainAccountRouter
    ) external payable onlyOwner {
        interchainAccountRouter = _interchainAccountRouter;

        emit InterchainAccountRouterUpdated(_interchainAccountRouter);
    }

    /**
     * @dev withdraw fee from the contract
     * @param _amount The withdrawal fee amount
     * @param _treasury The treasury address
     */
    function withdrawFee(
        uint256 _amount,
        address _treasury
    ) external payable onlyOwner {
        feeAmount -= _amount;
        IERC20(bridgeToken).safeTransfer(_treasury, _amount);
    }

    /**
     * @dev Executes a token swap via LiFi, bridge to dest chain and call remote function
     * @param _fromToken The address of the swap from token
     * @param _fromAmount The amount of the swap from token
     * @param _approvalAddress The address of the approval address of lifi swap.
     * @param _target The address of the lifi related contract.
     * @param _data The call data to be sent to the target contract.
     * @param _calls The call data array for the remote call of the dest chain.
     */
    function lifiSwapBridgeAndCall(
        address _fromToken,
        uint256 _fromAmount,
        address _approvalAddress,
        address _target,
        bytes calldata _data,
        Call[] calldata _calls
    ) external payable nonReentrant {
        if (_fromAmount == 0) revert INVALID_VALUE();
        if (_approvalAddress == address(0)) revert INVALID_ADDRESS();
        if (_target == address(0)) revert INVALID_ADDRESS();
        if (!Address.isContract(_target)) revert NOT_CONTRACT();

        bool success;

        if (_fromToken == address(0)) {
            // fromToken is ETH
            if (msg.value < _fromAmount) revert SWAP_FAILED();

            // LiFi Swap
            (success, ) = _target.call{value: _fromAmount}(_data);
        } else {
            // transfer
            IERC20(_fromToken).safeTransferFrom(
                msg.sender,
                address(this),
                _fromAmount
            );

            // Approve
            IERC20(_fromToken).safeApprove(_approvalAddress, 0);
            IERC20(_fromToken).safeApprove(_approvalAddress, _fromAmount);

            // LiFi Swap
            (success, ) = _target.call(_data);
        }

        if (!success) revert SWAP_FAILED();

        emit SwapAndBridgeExecuted(_target, _data, success);

        _bridgeAndCall(_calls);
    }

    /**
     * @dev Executes a dest chain function to process exception case
     * @param _calls The call data of the dest chain function
     */
    function remoteCall(Call[] calldata _calls) external payable nonReentrant {
        IInterchainAccountRouter(interchainAccountRouter).callRemote{
            value: msg.value
        }(DESTINATION_CHAIN_ID, _calls);
    }

    function _bridgeAndCall(Call[] calldata _calls) internal {
        address _toToken = bridgeToken;
        address _bridge = bridge;
        uint256 toAmount = IERC20(_toToken).balanceOf(address(this)) - feeAmount;
        if (toAmount == 0) revert SWAP_FAILED();

        // fee processing
        uint256 swapAmount = (toAmount * (PERCENTAGE_FACTOR - fee)) /
            PERCENTAGE_FACTOR;
        feeAmount += toAmount - swapAmount;

        // Bridge + Call via Hyperlane
        if (msg.value <= 1 wei) revert BRIDGE_FAILED();

        IERC20(_toToken).safeApprove(_bridge, 0);
        IERC20(_toToken).safeApprove(_bridge, swapAmount);

        // Get the interchain account address for the contract on the destination chain
        IInterchainAccountRouter ica = IInterchainAccountRouter(
            interchainAccountRouter
        );
        address self = ica.getRemoteInterchainAccount(
            DESTINATION_CHAIN_ID,
            address(this)
        );

        // Bridge
        IBridge(_bridge).transferRemote{value: 1 wei}(
            DESTINATION_CHAIN_ID,
            bytes32(uint256(uint160(self))),
            swapAmount
        );

        // Execute the specified interchain calls using the remaining gas funds
        ica.callRemote{value: msg.value - 1 wei}(
            DESTINATION_CHAIN_ID,
            _calls
        );
    }
}
