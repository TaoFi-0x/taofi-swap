// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITaoUSDSTAOZap} from "./interfaces/ITaoUSDSTAOZap.sol";
import {IStaking, ISUBTENSOR_STAKING_ADDRESS} from "./interfaces/IStaking.sol";

/// @title TaoSwapAndBridgeToMain
/// @author Jason (Sturdy) https://github.com/iris112
/// @notice alpha(Bittensor EVM) -> TAO(Bittensor EVM) -> sTAO(Bittensor EVM) -> taoUSD(Bittensor EVM) -> USDC(Ethereum)
contract TaoSwapAndBridgeToMain is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant PERCENTAGE_FACTOR = 100_00;
    uint32 private constant DESTINATION_CHAIN_ID = 1;   //Ethereum

    IERC20 public immutable taoUSD;
    address public immutable taoUSDBridge;
    ITaoUSDSTAOZap public immutable taoUSDsTAOZap;

    uint256 public fee;
    uint256 public feeAmount;

    event FeeUpdated(uint256 newFee);
    event SwapAndBridgeExecuted(uint256 fromAmount, uint256 usdcAmount);

    error INVALID_FEE_VALUE();
    error BRIDGE_FAILED();
    error SWAP_FAILED();
    error WITHDRAW_FEE_FAILED();

    constructor(address _taoUSD, address _taoUSDBridge, address _taoUSDsTAOZap) {
        taoUSD = IERC20(_taoUSD);
        taoUSDBridge = _taoUSDBridge;
        taoUSDsTAOZap = ITaoUSDSTAOZap(_taoUSDsTAOZap);
    }

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
     * @dev withdraw fee from the contract
     * @param _amount The withdrawal fee amount
     * @param _treasury The treasury address
     */
    function withdrawFee(
        uint256 _amount,
        address _treasury
    ) external payable onlyOwner {
        feeAmount -= _amount;
        taoUSD.safeTransfer(_treasury, _amount);
    }

    /**
     * @dev Executes a alpha -> TAO -> sTAO -> taoUSD -> USDC(Ethereum)
     * @param _hotkey The hotkey public key.
     * @param _netuid The subnet to stake to.
     * @param _alphaAmount The alpha token amount
     * @param _minTaoUSDAmount The taoUSD min amount after unstake and swap
     */
    function unStakeSwapAndBridging(
        bytes32 _hotkey,
        uint256 _netuid,
        uint256 _alphaAmount,
        uint256 _minTaoUSDAmount
    ) external payable nonReentrant {
        // alpha -> TAO
        IStaking(ISUBTENSOR_STAKING_ADDRESS).removeStakeLimit(_hotkey, _alphaAmount, 0, false, _netuid);
        uint256 taoAmount = address(this).balance - msg.value;
        if (taoAmount == 0) revert SWAP_FAILED();

        // TAO -> sTAO -> taoUSD
        uint256 taoUSDAmount = taoUSDsTAOZap.swapExactTAOForTAOUSD{value: taoAmount}(_minTaoUSDAmount);

        // fee processing
        uint256 bridgeAmount = (taoUSDAmount * (PERCENTAGE_FACTOR - fee)) /
            PERCENTAGE_FACTOR;
        feeAmount += taoUSDAmount - bridgeAmount;

        // bridge (taoUSD -> USDC)
        if (msg.value <= 1 wei) revert BRIDGE_FAILED();

        taoUSD.safeApprove(taoUSDBridge, 0);
        taoUSD.safeApprove(taoUSDBridge, bridgeAmount);

        IBridge(taoUSDBridge).transferRemote{value: 1 wei}(
            DESTINATION_CHAIN_ID,
            bytes32(uint256(uint160(msg.sender))),
            bridgeAmount
        );

        emit SwapAndBridgeExecuted(_alphaAmount, bridgeAmount);
    }
}
