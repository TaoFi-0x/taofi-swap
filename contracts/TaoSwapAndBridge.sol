// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {IInterchainAccountRouter, Call} from "./interfaces/IInterchainAccountRouter.sol";
import {ISTAO} from "./interfaces/ISTAO.sol";

/// @title TaoSwapAndBridge
/// @author Jason (Sturdy) https://github.com/iris112
/// @notice swap asset to tao and bridge
contract TaoSwapAndBridge is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant PERCENTAGE_FACTOR = 100_00;
    uint32 private constant DESTINATION_CHAIN_ID = 964;

    uint256 public fee;

    address public taoToken;

    address public interchainAccountRouter;

    address public destChainRemoteCall;

    // token -> amount
    mapping(address => uint256) public feeAmount;

    event FeeUpdated(uint256 newFee);
    event TaoTokenUpdated(address newTaoToken);
    event InterchainAccountRouterUpdated(address newInterchainAccountRouter);
    event SwapExecuted(address indexed target, bytes data, bool success);
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
    error TAO_NOT_EXIST();
    error BRIDGE_FAILED();
    error WITHDRAW_FEE_FAILED();

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
     * @dev Set the tao token contract address which is bridge contract.
     * @param _taoToken - The address of the subtensor bridge contract (tao token contract)
     */
    function setTaoToken(address _taoToken) external payable onlyOwner {
        taoToken = _taoToken;

        emit TaoTokenUpdated(_taoToken);
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
     * @param _token The withdrawal fee token address
     * @param _amount The withdrawal fee amount
     * @param _treasury The treasury address
     */
    function withdrawFee(
        address _token,
        uint256 _amount,
        address _treasury
    ) external payable onlyOwner {
        if (_token == address(0)) {
            (bool success, ) = _treasury.call{value: _amount}("");
            if (!success) revert WITHDRAW_FEE_FAILED();
        } else {
            feeAmount[_token] -= _amount;
            IERC20(_token).safeTransfer(_treasury, _amount);
        }
    }

    /**
     * @dev Executes a token swap via LiFi, bridge to dest chain and run staking
     * @param _fromToken The address of the swap from token
     * @param _fromAmount The amount of the swap from token
     * @param _minStakedAmount The min amount of the staked token in the destination chain (sTAO)
     * @param _toToken The address of the swap to token
     * @param _approvalAddress The address of the approval address of lifi swap.
     * @param _target The address of the lifi related contract.
     * @param _data The call data to be sent to the target contract.
     */
    function lifiSwapBridgeAndStaking(
        address _fromToken,
        uint256 _fromAmount,
        uint256 _minStakedAmount,
        address _toToken,
        address _approvalAddress,
        address _target,
        bytes calldata _data
    ) external payable nonReentrant {
        if (_fromAmount == 0) revert INVALID_VALUE();
        if (_toToken == address(0)) revert INVALID_ADDRESS();
        if (_approvalAddress == address(0)) revert INVALID_ADDRESS();
        if (_target == address(0)) revert INVALID_ADDRESS();
        if (!Address.isContract(_target)) revert NOT_CONTRACT();

        bool success;

        // fee processing
        uint256 swapAmount = (_fromAmount * (PERCENTAGE_FACTOR - fee)) /
            PERCENTAGE_FACTOR;

        if (_fromToken == address(0)) {
            if (msg.value < _fromAmount) revert SWAP_FAILED();

            (success, ) = _target.call{value: swapAmount}(_data);
        } else {
            feeAmount[_fromToken] += _fromAmount - swapAmount;

            // transfer
            IERC20(_fromToken).safeTransferFrom(
                msg.sender,
                address(this),
                _fromAmount
            );

            // Approve
            IERC20(_fromToken).safeApprove(_approvalAddress, 0);
            IERC20(_fromToken).safeApprove(_approvalAddress, swapAmount);

            (success, ) = _target.call(_data);
        }

        if (!success) revert SWAP_FAILED();

        uint256 toAmount = IERC20(_toToken).balanceOf(address(this)) -
            feeAmount[_toToken];
        if (toAmount == 0) revert SWAP_FAILED();

        if (_toToken == taoToken) {
            if (msg.value <= 1 wei) revert BRIDGE_FAILED();

            // Approve
            IERC20(_toToken).safeApprove(_toToken, 0);
            IERC20(_toToken).safeApprove(_toToken, toAmount);

            // Get the interchain account address for the contract on the destination chain
            IInterchainAccountRouter ica = IInterchainAccountRouter(
                interchainAccountRouter
            );
            address self = ica.getRemoteInterchainAccount(
                DESTINATION_CHAIN_ID,
                address(this)
            );

            // Bridge
            IBridge(_toToken).transferRemote{value: 1 wei}(
                DESTINATION_CHAIN_ID,
                bytes32(uint256(uint160(self))),
                toAmount
            );

            // Execute the specified interchain calls using the remaining gas funds
            Call[] memory calls = new Call[](1);
            calls[0] = Call({
                to: bytes32(uint256(uint160(destChainRemoteCall))),
                data: abi.encodeCall(
                    ISTAO.deposit,
                    (msg.sender, _minStakedAmount)
                ),
                value: toAmount // transfered token amount
            });
            ica.callRemote{value: msg.value - 1 wei}(
                DESTINATION_CHAIN_ID,
                calls
            );

            emit SwapAndBridgeExecuted(_target, _data, success);
        } else {
            IERC20(_toToken).safeTransfer(msg.sender, toAmount);

            emit SwapExecuted(_target, _data, success);
        }
    }

    /**
     * @dev Executes a dest chain function to process exception case
     * @param _calls The call data of the dest chain function
     */
    function remoteCall(Call[] memory _calls) external payable nonReentrant {
        IInterchainAccountRouter(interchainAccountRouter).callRemote{
            value: msg.value
        }(DESTINATION_CHAIN_ID, _calls);
    }
}
