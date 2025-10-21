// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3Router} from "./interfaces/IUniswapV3Router.sol";
import {IBalanceTransfer} from "./interfaces/IBalanceTransfer.sol";
import {IWTAO} from "./interfaces/IWTAO.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SwapAndTransfer
 * @author Jason (TaoFi)
 * @notice This contract allows users to perform a sequence of actions: swapping an ERC20 token (like USDC) for WTAO,
 * unwrapping it to native TAO, and transfer it to bittensor wallet. It also provides functionality for swapping TAO 
 * back to an ERC20, and bridging the asset to another chain.
 */
contract SwapAndTransfer {
    /// @notice Parameters for UI fees.
    struct UiFeeParams {
        address receiver;
        uint256 feePercentage;
    }

    event TaoTransfer(
        bytes32 indexed user,
        uint256 amount
    );
 
    error INVALID_FEE();
    error TRANSFER_FAILED();

    /**
     * @dev Allows the contract to receive the native asset (e.g., ETH or TAO).
     */
    receive() external payable {}

    uint256 public constant PERCENTAGE_FACTOR = 100_00;

    /// @notice The address of the Wrapped TAO (WTAO) token contract.
    address public immutable wtao;
    /// @notice The address of the Uniswap V3 Router contract.
    address public immutable uniswapRouter;
    /// @notice The address of the BalanceTransfer precompile contract.
    address public immutable transferPrecompile;

    /**
     * @notice Initializes the contract with the necessary external contract addresses.
     * @param _wtao The address of the WTAO token.
     * @param _uniswapRouter The address of the Uniswap V3 Router.
     * @param _transferPrecompile The address of the BalanceTransfer precompile.
     */
    constructor(
        address _wtao,
        address _uniswapRouter,
        address _transferPrecompile
    ) {
        wtao = _wtao;
        uniswapRouter = _uniswapRouter;
        transferPrecompile = _transferPrecompile;
    }

    /**
     * @notice Swaps a specified amount of an input token for TAO and transfer it to bittensor wallet.
     * @dev The caller must have approved this contract to spend their input tokens.
     *      Note: This function will override swapParams.amountIn to use the user's entire
     *      balance of the input token and swapParams.recipient to ensure tokens are received
     *      by this contract for staking.
     * @param swapParams The parameters for the Uniswap V3 swap.
     * @param uiFeeParams The parameters for the UI fee.
     * @param receiver The parameters for TAO receiver of bittensor wallet.
     */
    function swapAndTransfer(
        IUniswapV3Router.ExactInputSingleParams memory swapParams,
        UiFeeParams calldata uiFeeParams,
        bytes32 receiver
    ) external {
        swapParams.amountIn = Math.min(swapParams.amountIn, IERC20(swapParams.tokenIn).balanceOf(address(msg.sender)));
        swapParams.recipient = address(this);

        // Take USDC
        SafeERC20.safeTransferFrom(IERC20(swapParams.tokenIn), msg.sender, address(this), swapParams.amountIn);

        // Swap USDC to TAO
        IERC20(swapParams.tokenIn).approve(uniswapRouter, swapParams.amountIn);
        uint256 amountOut = IUniswapV3Router(uniswapRouter).exactInputSingle(swapParams);

        uint256 feeAmount = amountOut * uiFeeParams.feePercentage / PERCENTAGE_FACTOR;
        amountOut -= feeAmount;

        IERC20(wtao).transfer(uiFeeParams.receiver, feeAmount);

        // If asset out is WTAO, unwrap it
        if (swapParams.tokenOut == wtao) {
            IWTAO(wtao).withdraw(amountOut);
        }
        
        // Transfer TAO
        (bool success,) = transferPrecompile.call{ value: amountOut }(
            abi.encodeWithSelector(IBalanceTransfer.transfer.selector, receiver)
        );
        if (!success) {
            revert TRANSFER_FAILED();
        }

        emit TaoTransfer(receiver, amountOut);
    }
}
