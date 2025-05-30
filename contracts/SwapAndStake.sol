// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IWTAO} from "./interfaces/IWTAO.sol";
import {IStakingV2} from "./interfaces/IStakingV2.sol";
import {IUniswapV3Router} from "./interfaces/IUniswapV3Router.sol";
import {IBridge} from "./interfaces/IBridge.sol";

contract SwapAndStake {
    struct SwapParams {
        uint256 usdcAmount;
        uint256 minTaoToReceive;
    }

    struct StakeParams {
        bytes32 hotkey;
        uint256 netuid;
        uint256 limitPrice;
    }

    struct UnstakeParams {
        bytes32 hotkey;
        uint256 netuid;
        uint256 amount;
        uint256 limitPrice;
    }

    struct BridgeParams {
        uint32 destinationChainId;
        bytes32 receiver;
    }

    event Stake(address indexed user, bytes32 indexed hotkey, uint256 netuid, uint256 amount);

    receive() external payable {}

    address public immutable usdc;
    address public immutable wtao;
    address public immutable uniswapRouter;
    address public immutable stakingPrecompile;
    address public immutable bridge;

    constructor(address _usdc, address _wtao, address _uniswapRouter, address _stakingPrecompile, address _bridge) {
        usdc = _usdc;
        wtao = _wtao;
        uniswapRouter = _uniswapRouter;
        stakingPrecompile = _stakingPrecompile;
        bridge = _bridge;
    }

    function swapAndStake(IUniswapV3Router.ExactInputSingleParams calldata swapParams, StakeParams calldata stakeParams)
        external
        payable
    {
        // Take USDC
        SafeERC20.safeTransferFrom(IERC20(swapParams.tokenIn), msg.sender, address(this), swapParams.amountIn);

        // Swap USDC to TAO
        IERC20(swapParams.tokenIn).approve(uniswapRouter, swapParams.amountIn);
        uint256 amountOut = IUniswapV3Router(uniswapRouter).exactInputSingle(swapParams);

        // If asset out is WETH, unwrap it
        if (swapParams.tokenOut == wtao) {
            IWTAO(wtao).withdraw(amountOut);
        }

        // Stake TAO
        IStakingV2(stakingPrecompile).addStakeLimit{value: amountOut}(
            stakeParams.hotkey, amountOut, stakeParams.limitPrice, false, stakeParams.netuid
        );

        // Return excess TAO
        bytes32 senderColdKey = bytes32(uint256(uint160(msg.sender)));
        IStakingV2(stakingPrecompile).transferStake(
            senderColdKey, stakeParams.hotkey, stakeParams.netuid, stakeParams.netuid, amountOut
        );

        emit Stake(msg.sender, stakeParams.hotkey, stakeParams.netuid, amountOut);
    }

    function unstakeSwapAndBridge(
        UnstakeParams calldata unstakeParams,
        IUniswapV3Router.ExactInputSingleParams calldata swapParams,
        BridgeParams calldata bridgeParams
    ) external {
        // Unstake TAO
        IStakingV2(stakingPrecompile).removeStakeLimit(
            unstakeParams.hotkey, unstakeParams.amount, unstakeParams.limitPrice, false, unstakeParams.netuid
        );

        // Wrap TAO to WTAO
        IWTAO(wtao).deposit{value: unstakeParams.amount}();

        // Approve and swap
        IERC20(wtao).approve(uniswapRouter, unstakeParams.amount);

        // Swap WTAO to USDC
        uint256 amountOut = IUniswapV3Router(uniswapRouter).exactInputSingle(swapParams);

        // Bridge USDC to remote
        IERC20(swapParams.tokenOut).approve(bridge, amountOut);

        IBridge(bridge).transferRemote{value: 1 wei}(bridgeParams.destinationChainId, bridgeParams.receiver, amountOut);
    }
}
