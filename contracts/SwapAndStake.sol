import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IUniswapV3Router} from "./interfaces/IUniswapV3Router.sol";
import {IWTAO} from "./interfaces/IWTAO.sol";
import {IStakingV2} from "./interfaces/IStakingV2.sol";
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
    bytes32 public pubkey;

    constructor(address _usdc, address _wtao, address _uniswapRouter, address _stakingPrecompile, address _bridge) {
        usdc = _usdc;
        wtao = _wtao;
        uniswapRouter = _uniswapRouter;
        stakingPrecompile = _stakingPrecompile;
        bridge = _bridge;
    }

    function swapAndStake(IUniswapV3Router.ExactInputSingleParams calldata swapParams, StakeParams calldata stakeParams)
        external
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
        uint256 formatAmountOut = amountOut / 10 ** 9;

        (bool success,) = payable(stakingPrecompile).call{value: formatAmountOut}(
            abi.encodeWithSelector(
                IStakingV2.addStake.selector, stakeParams.hotkey, formatAmountOut, stakeParams.netuid
            )
        );
        if (!success) {
            revert("Failed to add stake");
        }

        emit Stake(msg.sender, stakeParams.hotkey, stakeParams.netuid, amountOut);
    }

    function swapAndStakeWithTransfer(
        IUniswapV3Router.ExactInputSingleParams memory swapParams,
        StakeParams calldata stakeParams,
        bytes32 receiverColdKey
    ) external {
        // Sender stakes full holdings
        swapParams.amountIn = IERC20(swapParams.tokenIn).balanceOf(address(msg.sender));

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
        uint256 formatAmountOut = amountOut / 10 ** 9;

        (bool success,) = payable(stakingPrecompile).call{value: formatAmountOut}(
            abi.encodeWithSelector(
                IStakingV2.addStake.selector, stakeParams.hotkey, formatAmountOut, stakeParams.netuid
            )
        );
        if (!success) {
            revert("Failed to add stake");
        }

        bytes32 senderColdKey = bytes32(uint256(uint160(msg.sender)));
        if (receiverColdKey == bytes32(0)) {
            receiverColdKey = senderColdKey; // If no receiver is specified, use the sender's coldkey
        }
        uint256 alphaStakeBalance =
            IStakingV2(stakingPrecompile).getStake(stakeParams.hotkey, pubkey, stakeParams.netuid);

        (bool successTransfer,) = (stakingPrecompile).call(
            abi.encodeWithSelector(
                IStakingV2.transferStake.selector,
                receiverColdKey,
                stakeParams.hotkey,
                stakeParams.netuid,
                stakeParams.netuid,
                alphaStakeBalance
            )
        );
        if (!successTransfer) {
            revert("Failed to transfer stake");
        }

        emit Stake(msg.sender, stakeParams.hotkey, stakeParams.netuid, amountOut);
    }

    function getStake(bytes32 hotkey, bytes32 coldkey, uint256 netuid) public view returns (uint256) {
        uint256 alphaBalance = IStakingV2(stakingPrecompile).getStake(hotkey, coldkey, netuid);
        return alphaBalance;
    }

    function transferStake(
        bytes32 destinationColdkey,
        bytes32 hotkey,
        uint256 originNetuid,
        uint256 destinationNetuid,
        uint256 amount
    ) external {
        // Get the amount of stake to transfer
        // We treat msg.sender (address) in the mock as a bytes32 coldkey key for simplicity.
        (bool success,) = (stakingPrecompile).call(
            abi.encodeWithSelector(
                IStakingV2.transferStake.selector, destinationColdkey, hotkey, originNetuid, destinationNetuid, amount
            )
        );
        if (!success) {
            revert("Failed to transfer stake");
        }
    }

    function unstakeSwapAndBridge(
        UnstakeParams memory unstakeParams,
        IUniswapV3Router.ExactInputSingleParams calldata swapParams,
        BridgeParams calldata bridgeParams
    ) external payable {
        // Unstake TAO

        uint256 taoBalanceBefore = address(this).balance;

        (bool success,) = (stakingPrecompile).call(
            abi.encodeWithSelector(
                IStakingV2.removeStake.selector, unstakeParams.hotkey, unstakeParams.amount, unstakeParams.netuid
            )
        );
        if (!success) {
            revert("Failed to remove stake");
        }

        uint256 taoBalanceAfter = address(this).balance;
        uint256 taoReceived = taoBalanceAfter - taoBalanceBefore;

        // Wrap TAO to WTAO
        IWTAO(wtao).deposit{value: taoReceived}();

        // Approve and swap
        IERC20(wtao).approve(uniswapRouter, taoReceived);

        swapParams.amountIn = taoReceived;

        // Swap WTAO to USDC
        uint256 amountOut = IUniswapV3Router(uniswapRouter).exactInputSingle(swapParams);

        IBridge(bridge).transferRemote{value: msg.value}(
            bridgeParams.destinationChainId, bridgeParams.receiver, amountOut
        );
    }

    function setPubKey(bytes32 _pubkey) external {
        pubkey = _pubkey;
    }

    function getEth() external {
        // Send eth to caller
        payable(msg.sender).transfer(address(this).balance);
    }
}
