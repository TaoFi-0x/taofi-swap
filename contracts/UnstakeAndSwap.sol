// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IUniswapV3Router} from "./interfaces/IUniswapV3Router.sol";
import {IStakingManager} from "./interfaces/IStakingManager.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {IWTAO} from "./interfaces/IWTAO.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title UnstakeAndSwap
 * @author Jason (TaoFi)
 * @notice This contract allows users to perform a unstaking, swapping TAO back to an ERC20, and 
 * bridging the asset to another chain.
 */
contract UnstakeAndSwap is Ownable {
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

    event Unstake(
        address indexed user,
        bytes32 indexed hotkey,
        uint256 netuid,
        uint256 amount,
        address feeReceiver,
        uint256 feeAmount
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
    /// @notice The address of the cross-chain bridge contract.
    address public immutable bridge;
    /// @notice The address of the Staking Manager contract.
    address public immutable stakingManager;
    /// @notice The user's available swap and bridge amount tracking.
    mapping(address => uint256) public userSwapAmount;

    /**
     * @notice Initializes the contract with the necessary external contract addresses.
     * @param _usdc The address of the USDC token.
     * @param _wtao The address of the WTAO token.
     * @param _uniswapRouter The address of the Uniswap V3 Router.
     * @param _bridge The address of the bridge contract.
     * @param _stakingManager The address of the Staking Manager contract.
     */
    constructor(
        address _usdc,
        address _wtao,
        address _uniswapRouter,
        address _bridge,
        address _stakingManager
    ) {
        usdc = _usdc;
        wtao = _wtao;
        uniswapRouter = _uniswapRouter;
        bridge = _bridge;
        stakingManager = _stakingManager;
    }

    /**
     * @notice Unstakes TAO, process fee.
     * @dev The user must have approved this contract to spend their alpha (staking) tokens.
     * @param unstakeParams The parameters for unstaking from the subnet.
     * @param uiFeeParams Parameters for calculating and forwarding the UI fee.
     */
    function unstake(
        UnstakeParams calldata unstakeParams,
        UiFeeParams calldata uiFeeParams
    ) external {
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
        uint256 feeAmount = taoReceived * uiFeeParams.feePercentage / PERCENTAGE_FACTOR;
        
        // Wrap TAO to WTAO
        IWTAO(wtao).deposit{value: feeAmount}();

        taoReceived -= feeAmount;
        userSwapAmount[msg.sender] += taoReceived;

        IERC20(wtao).transfer(uiFeeParams.receiver, feeAmount);

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
     * @notice swaps the TAO for an ERC20 token (e.g., USDC), and bridges the token to another chain.
     * @dev This contract has TAO unstaked and wrapped as WTAO.
     * @param swapParams The parameters for the Uniswap V3 swap (WTAO to USDC).
     * @param bridgeParams The parameters for the cross-chain bridge transfer.
     */
    function swapAndBridge(
        IUniswapV3Router.ExactInputSingleParams memory swapParams,
        BridgeParams calldata bridgeParams
    ) external {
        uint256 taoReceived = userSwapAmount[msg.sender];

        if (swapParams.tokenIn != wtao) revert INVALID_SWAP_TOKENIN();
        if (swapParams.tokenOut != usdc) revert INVALID_SWAP_TOKENOUT();
        if (taoReceived == 0) revert INVALID_SWAP_AMOUNT();

        // Wrap TAO to WTAO
        IWTAO(wtao).deposit{value: taoReceived - bridgeParams.bridgeFee}();
        taoReceived -= bridgeParams.bridgeFee;
        userSwapAmount[msg.sender] = 0;

        // Approve and swap
        IERC20(wtao).approve(uniswapRouter, taoReceived);

        swapParams.amountIn = taoReceived;

        // Swap WTAO to USDC
        uint256 amountOut = IUniswapV3Router(uniswapRouter).exactInputSingle(swapParams);

        IERC20(usdc).approve(bridge, amountOut);

        IBridge(bridge).transferRemote{value: bridgeParams.bridgeFee}(
            bridgeParams.destinationChainId, bridgeParams.receiver, amountOut
        );
    }
}
