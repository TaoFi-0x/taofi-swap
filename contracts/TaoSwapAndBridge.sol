// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

interface IBridge {
    function transferRemote(
        uint32 _destination,
        bytes32 _recipient,
        uint256 _amount
    ) external payable;
}

/// @title TaoSwapAndBridge
/// @author Jason (Sturdy) https://github.com/shr1fyy
/// @notice swap asset to tao and bridge
contract TaoSwapAndBridge is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant PERCENTAGE_FACTOR = 100_00;
    uint32 private constant DESTINATION_CHAIN_ID = 964;

    uint256 public fee;

    address public taoToken;

    event FeeUpdated(uint256 newFee);
    event TaoTokenUpdated(address newTaoToken);
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
     * @dev Executes a low-level call to the target contract with provided call data.
     * @param _fromToken The address of the swap from token
     * @param _fromAmount The amount of the swap from token
     * @param _toToken The address of the swap to token
     * @param _approvalAddress The address of the approval address of lifi swap.
     * @param _target The address of the lifi related contract.
     * @param _data The call data to be sent to the target contract.
     */
    function lifiSwapAndBridge(
        address _fromToken,
        uint256 _fromAmount,
        address _toToken,
        address _approvalAddress,
        address _target,
        bytes calldata _data
    ) external payable nonReentrant {
        if (_fromToken == address(0)) revert INVALID_ADDRESS();
        if (_fromAmount == 0) revert INVALID_VALUE();
        if (_toToken == address(0)) revert INVALID_ADDRESS();
        if (_approvalAddress == address(0)) revert INVALID_ADDRESS();
        if (_target == address(0)) revert INVALID_ADDRESS();
        if (!Address.isContract(_target)) revert NOT_CONTRACT();

        // transfer
        IERC20(_fromToken).safeTransferFrom(
            msg.sender,
            address(this),
            _fromAmount
        );

        // fee processing
        uint256 swapAmount = (_fromAmount * (PERCENTAGE_FACTOR - fee)) /
            PERCENTAGE_FACTOR;

        // Approve
        IERC20(_fromToken).safeApprove(_approvalAddress, 0);
        IERC20(_fromToken).safeApprove(_approvalAddress, swapAmount);

        (bool success, ) = _target.call(_data);
        if (!success) revert SWAP_FAILED();

        uint256 toAmount = IERC20(_toToken).balanceOf(address(this));
        if (toAmount == 0) revert SWAP_FAILED();

        if (_toToken == taoToken) {
            if (msg.value != 1 wei) revert BRIDGE_FAILED();

            // Approve
            IERC20(_toToken).safeApprove(_toToken, 0);
            IERC20(_toToken).safeApprove(_toToken, toAmount);

            // Bridge
            IBridge(_toToken).transferRemote{value: 1 wei}(
                DESTINATION_CHAIN_ID,
                bytes32(uint256(uint160(msg.sender))),
                toAmount
            );

            emit SwapAndBridgeExecuted(_target, _data, success);
        } else {
            if (msg.value > 0) revert SWAP_FAILED();

            IERC20(_toToken).safeTransfer(msg.sender, toAmount);

            emit SwapExecuted(_target, _data, success);
        }
    }
}
