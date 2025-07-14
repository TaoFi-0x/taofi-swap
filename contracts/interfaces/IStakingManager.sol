// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

interface IStakingManager {
    function alphaTokens(uint256 netuid, bytes32 hotkey) external view returns (address);

    function stake(bytes32 hotkey, uint256 netuid, address receiver, uint256 minAlphaToReceive) external payable;

    function unstake(bytes32 hotkey, uint256 netuid, uint256 amount, address receiver, uint256 minAmountTaoReceived) external;
}
