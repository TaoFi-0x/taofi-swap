// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUniswapV3Router} from "./interfaces/IUniswapV3Router.sol";
import {IStakingManager} from "./interfaces/IStakingManager.sol";
import {IStakingV2} from "./interfaces/IStakingV2.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {IWTAO} from "./interfaces/IWTAO.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SwapAndStake
 * @author kitanovicd (TaoFi)
 * @notice This contract allows users to perform a sequence of actions: swapping an ERC20 token (like USDC) for WTAO,
 * unwrapping it to native TAO, and staking it. It also provides functionality for the reverse process: unstaking,
 * swapping TAO back to an ERC20, and bridging the asset to another chain.
 */
contract SwapAndStake is Ownable {
    /// @notice Parameters for staking TAO.
    struct StakeParams {
        bytes32 hotkey;
        uint256 netuid;
        uint256 minAlphaToReceive;
    }

    /// @notice Parameters for unstaking TAO.
    struct UnstakeParams {
        bytes32 hotkey;
        uint256 netuid;
        uint256 amount;
    }

    /// @notice Parameters for bridging assets to another chain.
    struct BridgeParams {
        uint256 bridgeFee;
        uint32 destinationChainId;
        bytes32 receiver;
    }

    /// @notice Parameters for UI fees.
    struct UiFeeParams {
        address receiver;
        uint256 feePercentage;
    }

    /**
     * @notice Emitted when a user successfully stakes TAO.
     * @param user The address of the user who initiated the staking.
     * @param hotkey The hotkey the TAO was staked to.
     * @param netuid The network UID of the subnet.
     * @param amount The amount of TAO that was staked.
     */
    event Stake(
        address indexed user,
        bytes32 indexed hotkey,
        uint256 netuid,
        uint256 amount,
        address feeReceiver,
        uint256 feeAmount
    );
    event Unstake(
        address indexed user,
        bytes32 indexed hotkey,
        uint256 netuid,
        uint256 amount,
        address feeReceiver,
        uint256 feeAmount
    );
    event Refund(
        address indexed user,
        address indexed receiver,
        uint256 amount,
        uint256 bridgeFee
    );

    error INVALID_SWAP_TOKENOUT();
    error INVALID_SWAP_TOKENIN();
    error INVALID_SWAP_AMOUNT();

    /**
     * @dev Allows the contract to receive the native asset (e.g., ETH or TAO).
     */
    receive() external payable {}

    uint256 public constant PERCENTAGE_FACTOR = 100_00;

    /// @notice The address of the USDC token contract.
    address public immutable usdc;
    /// @notice The address of the Wrapped TAO (WTAO) token contract.
    address public immutable wtao;
    /// @notice The address of the Uniswap V3 Router contract.
    address public immutable uniswapRouter;
    /// @notice The address of the StakingV2 precompile contract.
    address public immutable stakingPrecompile;
    /// @notice The address of the cross-chain bridge contract.
    address public immutable bridge;
    /// @notice The address of the Staking Manager contract.
    address public immutable stakingManager;

    /**
     * @notice Initializes the contract with the necessary external contract addresses.
     * @param _usdc The address of the USDC token.
     * @param _wtao The address of the WTAO token.
     * @param _uniswapRouter The address of the Uniswap V3 Router.
     * @param _stakingPrecompile The address of the StakingV2 precompile.
     * @param _bridge The address of the bridge contract.
     * @param _stakingManager The address of the Staking Manager contract.
     */
    constructor(
        address _usdc,
        address _wtao,
        address _uniswapRouter,
        address _stakingPrecompile,
        address _bridge,
        address _stakingManager
    ) {
        usdc = _usdc;
        wtao = _wtao;
        uniswapRouter = _uniswapRouter;
        stakingPrecompile = _stakingPrecompile;
        bridge = _bridge;
        stakingManager = _stakingManager;
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

        IStakingManager(stakingManager).stake{value: amountOut}(
            stakeParams.hotkey, stakeParams.netuid, msg.sender, stakeParams.minAlphaToReceive
        );

        emit Stake(msg.sender, stakeParams.hotkey, stakeParams.netuid, amountOut, uiFeeParams.receiver, feeAmount);
    }

    /**
     * @notice Unstakes TAO, swaps it for an ERC20 token (e.g., USDC), and bridges the token to another chain.
     * @dev The user must have approved this contract to spend their alpha (staking) tokens. This function is payable
     * to allow the user to send native assets to cover any bridge fees.
     * @param unstakeParams The parameters for unstaking from the subnet.
     * @param swapParams The parameters for the Uniswap V3 swap (WTAO to USDC).
     * @param bridgeParams The parameters for the cross-chain bridge transfer.
     * @param uiFeeParams Parameters for calculating and forwarding the UI fee.
     */
    function unstakeSwapAndBridge(
        UnstakeParams calldata unstakeParams,
        IUniswapV3Router.ExactInputSingleParams memory swapParams,
        BridgeParams calldata bridgeParams,
        UiFeeParams calldata uiFeeParams
    ) external {
        if (swapParams.tokenIn != wtao) revert INVALID_SWAP_TOKENIN();
        if (swapParams.tokenOut != usdc) revert INVALID_SWAP_TOKENOUT();

        // Unstake TAO
        address alphaToken = IStakingManager(stakingManager).alphaTokens(unstakeParams.netuid, unstakeParams.hotkey);

        IERC20(alphaToken).transferFrom(msg.sender, address(this), unstakeParams.amount);

        uint256 taoBalanceBefore = address(this).balance;

        // Since the minimum output check (amountOutMinimum) is already enforced externally via swapParams,
        // we can safely pass minAmountTaoReceived = 0 here to allow unstaking without redundant validation.
        IStakingManager(stakingManager).unstake(
            unstakeParams.hotkey, unstakeParams.netuid, unstakeParams.amount, address(this), 0
        );

        uint256 taoBalanceAfter = address(this).balance;
        uint256 taoReceived = taoBalanceAfter - taoBalanceBefore;

        // Wrap TAO to WTAO
        IWTAO(wtao).deposit{value: taoReceived - bridgeParams.bridgeFee}();

        uint256 feeAmount = taoReceived * uiFeeParams.feePercentage / PERCENTAGE_FACTOR;
        taoReceived -= feeAmount;
        taoReceived -= bridgeParams.bridgeFee;

        IERC20(wtao).transfer(uiFeeParams.receiver, feeAmount);

        // Approve and swap
        IERC20(wtao).approve(uniswapRouter, taoReceived);

        swapParams.amountIn = taoReceived;

        // Swap WTAO to USDC
        uint256 amountOut = IUniswapV3Router(uniswapRouter).exactInputSingle(swapParams);

        IERC20(usdc).approve(bridge, amountOut);

        IBridge(bridge).transferRemote{value: bridgeParams.bridgeFee}(
            bridgeParams.destinationChainId, bridgeParams.receiver, amountOut
        );

        emit Unstake(
            msg.sender,
            unstakeParams.hotkey,
            unstakeParams.netuid,
            unstakeParams.amount,
            uiFeeParams.receiver,
            feeAmount
        );
    }

    /**
     * @notice Allows refunding users sending native USDC to a receiver on a remote chain.
     * @dev Requires prior approval of USDC by the user. The bridge fee is enforced to match the output amount from Uniswap.
     * @param swapParams Uniswap V3 exact output parameters to swap USDC to WTAO (covering the bridge fee).
     * @param bridgeParams Parameters for cross-chain transfer, including receiver, destination chain ID, and bridge fee.
     * @param amount Total USDC amount being refunded by the caller (portion goes to swap, rest is bridged).
     */
    function refund(
        IUniswapV3Router.ExactOutputSingleParams calldata swapParams,
        BridgeParams calldata bridgeParams,
        uint256 amount
    ) external {
        if (swapParams.tokenIn != usdc) revert INVALID_SWAP_TOKENIN();
        if (swapParams.tokenOut != wtao) revert INVALID_SWAP_TOKENOUT();
        if (bridgeParams.bridgeFee != swapParams.amountOut) revert INVALID_SWAP_AMOUNT();

        IERC20(usdc).transferFrom(msg.sender, address(this), amount);

        // Approve and swap
        IERC20(usdc).approve(uniswapRouter, swapParams.amountInMaximum);
        // Swap USDC to WTAO
        uint256 amountIn = IUniswapV3Router(uniswapRouter).exactOutputSingle(swapParams);

        // Unwrap WTAO to TAO
        IWTAO(wtao).withdraw(bridgeParams.bridgeFee);

        IBridge(bridge).transferRemote{value: bridgeParams.bridgeFee}(
            bridgeParams.destinationChainId, bridgeParams.receiver, amount - amountIn
        );

        emit Refund(
            msg.sender,
            address(uint160(uint256(bridgeParams.receiver))),
            amount,
            bridgeParams.bridgeFee
        );
    }
}
