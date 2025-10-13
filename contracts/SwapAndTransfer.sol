// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUniswapV3Router} from "./interfaces/IUniswapV3Router.sol";
import {IStakingManager} from "./interfaces/IStakingManager.sol";
import {IStakingV2} from "./interfaces/IStakingV2.sol";
import {IBalanceTransfer} from "./interfaces/IBalanceTransfer.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {IWTAO} from "./interfaces/IWTAO.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SwapAndTransfer
 * @author Jason (TaoFi)
 * @notice This contract allows users to perform a sequence of actions: swapping an ERC20 token (like USDC) for WTAO,
 * unwrapping it to native TAO, and staking it. It also provides functionality for the reverse process: unstaking,
 * swapping TAO back to an ERC20, and bridging the asset to another chain.
 */
contract SwapAndTransfer is Ownable {
    /// @notice Parameters for native staking TAO.
    struct StakeParams {
        bytes32 hotkey;
        uint256 netuid;
        uint256 minAlphaToReceive;
        bytes32 receiver;
    }

    /// @notice Parameters for UI fees.
    struct UiFeeParams {
        address receiver;
        uint256 feePercentage;
    }

    event Stake(
        bytes32 indexed user,
        bytes32 indexed hotkey,
        uint256 netuid,
        uint256 amount,
        address feeReceiver,
        uint256 feeAmount
    );
    event FeesClaimed(address indexed receiver, uint256 amount);
    event FeesSet(uint256 stakingFee);
    event MinTxSizeSet(uint256 minTxSize);
 
    error INVALID_SWAP_TOKENOUT();
    error INVALID_SWAP_TOKENIN();
    error INVALID_SWAP_AMOUNT();
    error INVALID_FEE();
    error TX_TOO_SMALL();
    error ADD_STAKE_FAILED();
    error TRANSFER_STAKE_FAILED();
    error TRANSFER_FAILED();

    /**
     * @dev Allows the contract to receive the native asset (e.g., ETH or TAO).
     */
    receive() external payable {}

    uint256 public constant PERCENTAGE_FACTOR = 100_00;
    uint256 public constant MAX_FEE = 100_00; // 100%
    
    /// @notice The conversion ratio from TAO (in wei) to AlphaToken representation. 1 TAO = 10^9 Alpha.
    uint256 public constant RATIO_TAO_TO_ALPHA = 1e9;

    /// @notice The address of the USDC token contract.
    address public immutable usdc;
    /// @notice The address of the Wrapped TAO (WTAO) token contract.
    address public immutable wtao;
    /// @notice The address of the Uniswap V3 Router contract.
    address public immutable uniswapRouter;
    /// @notice The address of the StakingV2 precompile contract.
    address public immutable stakingPrecompile;
    /// @notice The address of the BalanceTransfer precompile contract.
    address public immutable transferPrecompile;
    /// @notice The minimum transaction size for staking.
    uint256 public minTxSize;
    /// @notice The fee for staking.
    uint256 public stakingFee;

    /**
     * @notice Initializes the contract with the necessary external contract addresses.
     * @param _usdc The address of the USDC token.
     * @param _wtao The address of the WTAO token.
     * @param _uniswapRouter The address of the Uniswap V3 Router.
     * @param _stakingPrecompile The address of the StakingV2 precompile.
     * @param _transferPrecompile The address of the BalanceTransfer precompile.
     */
    constructor(
        address _usdc,
        address _wtao,
        address _uniswapRouter,
        address _stakingPrecompile,
        address _transferPrecompile
    ) {
        usdc = _usdc;
        wtao = _wtao;
        uniswapRouter = _uniswapRouter;
        stakingPrecompile = _stakingPrecompile;
        transferPrecompile = _transferPrecompile;
    }

    /**
     * @notice Claims accrued fees from the staking manager.
     * @dev Only callable by the contract owner. Emits a {FeesClaimed} event.
     * @param receiver The address to send the fees to.
     */
    function claimAccruedFees(address receiver) external onlyOwner {
        uint256 amount = address(this).balance;
        payable(receiver).transfer(amount);
        emit FeesClaimed(receiver, amount);
    }

    /**
     * @notice Sets the fees for staking and unstaking.
     * @dev Only callable by the contract owner. Emits a {FeesSet} event.
     * @param _stakingFee The new staking fee.
     */
    function setFees(uint256 _stakingFee) external onlyOwner {
        if (stakingFee > MAX_FEE) revert INVALID_FEE();

        stakingFee = _stakingFee;

        emit FeesSet(_stakingFee);
    }

    /**
     * @notice Sets the minimum transaction size for staking.
     * @dev Only callable by the contract owner. Emits an {MinTxSizeSet} event.
     * @param _minTxSize The new minimum transaction size.
     */
    function setMinTxSize(uint256 _minTxSize) external onlyOwner {
        minTxSize = _minTxSize;
        emit MinTxSizeSet(_minTxSize);
    }

    /**
     * @notice Swaps a specified amount of an input token for TAO and stakes it.
     * @dev The caller must have approved this contract to spend their input tokens.
     *      Note: This function will override swapParams.amountIn to use the user's entire
     *      balance of the input token and swapParams.recipient to ensure tokens are received
     *      by this contract for staking.
     * @param swapParams The parameters for the Uniswap V3 swap.
     * @param stakeParams The parameters for staking, including hotkey and netuid.
     * @param uiFeeParams The parameters for the UI fee.
     */
    function swapAndStake(
        IUniswapV3Router.ExactInputSingleParams memory swapParams,
        StakeParams calldata stakeParams,
        UiFeeParams calldata uiFeeParams
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

        if (stakeParams.hotkey != bytes32(0)) {
            // Staking
            uint256 stakingFeeAmount = Math.mulDiv(amountOut, stakingFee, MAX_FEE);
            amountOut -= stakingFeeAmount;

            if (amountOut < minTxSize) revert TX_TOO_SMALL();

            bool success;
            (success,) = stakingPrecompile.call(
                abi.encodeWithSelector(IStakingV2.addStake.selector, stakeParams.hotkey, amountOut / RATIO_TAO_TO_ALPHA, stakeParams.netuid)
            );
            if (!success) {
                revert ADD_STAKE_FAILED();
            }

            (success,) = stakingPrecompile.call(
                abi.encodeWithSelector(
                    IStakingV2.transferStake.selector, 
                    stakeParams.receiver, 
                    stakeParams.hotkey, 
                    stakeParams.netuid, 
                    stakeParams.netuid, 
                    amountOut / RATIO_TAO_TO_ALPHA
                )
            );
            if (!success) {
                revert TRANSFER_STAKE_FAILED();
            }
        } else {
            // Transfer TAO
            (bool success,) = transferPrecompile.call{ value: amountOut }(
                abi.encodeWithSelector(IBalanceTransfer.transfer.selector, stakeParams.receiver)
            );
            if (!success) {
                revert TRANSFER_FAILED();
            }
        }

        emit Stake(stakeParams.receiver, stakeParams.hotkey, stakeParams.netuid, amountOut, uiFeeParams.receiver, feeAmount);
    }
}
