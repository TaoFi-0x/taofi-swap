// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUniswapV3Router} from "./interfaces/IUniswapV3Router.sol";
import {IStakingManager} from "./interfaces/IStakingManager.sol";
import {IStakingV2} from "./interfaces/IStakingV2.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {IWTAO} from "./interfaces/IWTAO.sol";

/**
 * @title SwapAndStake
 * @author kitanovicd (TaoFi)
 * @notice This contract allows users to perform a sequence of actions: swapping an ERC20 token (like USDC) for WTAO,
 * unwrapping it to native TAO, and staking it. It also provides functionality for the reverse process: unstaking,
 * swapping TAO back to an ERC20, and bridging the asset to another chain.
 */
contract SwapAndStake is Ownable {
    /// @notice Parameters for swapping USDC to TAO.
    struct SwapParams {
        uint256 usdcAmount;
        uint256 minTaoToReceive; //unused
    }

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
        uint256 minTaoToReceive; //unused
    }

    /// @notice Parameters for bridging assets to another chain.
    struct BridgeParams {
        uint32 destinationChainId;
        bytes32 receiver;
    }

    /**
     * @notice Emitted when a user successfully stakes TAO.
     * @param user The address of the user who initiated the staking.
     * @param hotkey The hotkey the TAO was staked to.
     * @param netuid The network UID of the subnet.
     * @param amount The amount of TAO that was staked.
     */
    event Stake(address indexed user, bytes32 indexed hotkey, uint256 netuid, uint256 amount);
    event Unstake(address indexed user, bytes32 indexed hotkey, uint256 netuid, uint256 amount);
    event PubKeySet(bytes32 pubkey);

    /**
     * @dev Allows the contract to receive the native asset (e.g., ETH or TAO).
     */
    receive() external payable {}

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
    /// @notice A public key that can be set by the contract owner.
    bytes32 public pubkey;

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
     * @param swapParams The parameters for the Uniswap V3 swap.
     * @param stakeParams The parameters for staking, including hotkey and netuid.
     */
    function swapAndStake(IUniswapV3Router.ExactInputSingleParams calldata swapParams, StakeParams calldata stakeParams)
        external
    {
        require(swapParams.tokenIn == usdc, "Invalid tokenIn: must be USDC");
        require(
            swapParams.tokenOut == wtao || swapParams.tokenOut == address(0), "Invalid tokenOut: must be WTAO or TAO"
        );

        // Take USDC
        SafeERC20.safeTransferFrom(IERC20(swapParams.tokenIn), msg.sender, address(this), swapParams.amountIn);

        // Swap USDC to TAO
        IERC20(swapParams.tokenIn).approve(uniswapRouter, swapParams.amountIn);
        uint256 amountOut = IUniswapV3Router(uniswapRouter).exactInputSingle(swapParams);

        // If asset out is WETH, unwrap it
        if (swapParams.tokenOut == wtao) {
            IWTAO(wtao).withdraw(amountOut);
        }

        IStakingManager(stakingManager).stake{value: amountOut}(
            stakeParams.hotkey, stakeParams.netuid, msg.sender, stakeParams.minAlphaToReceive
        );

        emit Stake(msg.sender, stakeParams.hotkey, stakeParams.netuid, amountOut);
    }

    /**
     * @notice Retrieves the stake balance (alpha tokens) for a given hotkey and coldkey pair in a subnet.
     * @param hotkey The hotkey associated with the stake.
     * @param coldkey The coldkey (owner) associated with the stake.
     * @param netuid The network UID of the subnet.
     * @return uint256 The balance of alpha tokens representing the stake.
     */
    function getStake(bytes32 hotkey, bytes32 coldkey, uint256 netuid) public view returns (uint256) {
        uint256 alphaBalance = IStakingV2(stakingPrecompile).getStake(hotkey, coldkey, netuid);
        return alphaBalance;
    }

    /**
     * @notice Unstakes TAO, swaps it for an ERC20 token (e.g., USDC), and bridges the token to another chain.
     * @dev The user must have approved this contract to spend their alpha (staking) tokens. This function is payable
     * to allow the user to send native assets to cover any bridge fees.
     * @param unstakeParams The parameters for unstaking from the subnet.
     * @param swapParams The parameters for the Uniswap V3 swap (WTAO to USDC).
     * @param bridgeParams The parameters for the cross-chain bridge transfer.
     */
    function unstakeSwapAndBridge(
        UnstakeParams calldata unstakeParams,
        IUniswapV3Router.ExactInputSingleParams memory swapParams,
        BridgeParams calldata bridgeParams
    ) external payable {
        // Unstake TAO
        address alphaToken = IStakingManager(stakingManager).alphaTokens(unstakeParams.netuid);

        IERC20(alphaToken).transferFrom(msg.sender, address(this), unstakeParams.amount);

        uint256 taoBalanceBefore = address(this).balance;

        IStakingManager(stakingManager).unstake(
            unstakeParams.hotkey, unstakeParams.netuid, unstakeParams.amount, address(this)
        );

        uint256 taoBalanceAfter = address(this).balance;
        uint256 taoReceived = taoBalanceAfter - taoBalanceBefore;

        // Wrap TAO to WTAO
        IWTAO(wtao).deposit{value: taoReceived}();

        // Approve and swap
        IERC20(wtao).approve(uniswapRouter, taoReceived);

        swapParams.amountIn = taoReceived;

        // Swap WTAO to USDC
        uint256 amountOut = IUniswapV3Router(uniswapRouter).exactInputSingle(swapParams);

        IERC20(usdc).approve(bridge, amountOut);

        IBridge(bridge).transferRemote{value: msg.value}(
            bridgeParams.destinationChainId, bridgeParams.receiver, amountOut
        );

        emit Unstake(msg.sender, unstakeParams.hotkey, unstakeParams.netuid, unstakeParams.amount);
    }

    /**
     * @notice Sets the public key.
     * @dev Only the contract owner can call this function.
     * @param _pubkey The new public key to set.
     */
    function setPubKey(bytes32 _pubkey) external onlyOwner {
        pubkey = _pubkey;
        emit PubKeySet(_pubkey);
    }
}
