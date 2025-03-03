// SPDX-License-Identifier: MIT
//
// used for staking functionality on bittensor
pragma solidity ^0.8.3;

address constant ISUBTENSOR_STAKING_ADDRESS = 0x0000000000000000000000000000000000000801;

interface IStaking {
    function addStake(bytes32 hotkey, uint256 netuid) external payable;
    function removeStake(
        bytes32 hotkey,
        uint256 amount,
        uint256 netuid
    ) external;
    function getTotalColdkeyStake(
        bytes32 coldkey
    ) external view returns (uint256);
    function getStake(
        bytes32 hotkey,
        bytes32 coldkey,
        uint256 netuid
    ) external view returns (uint256);
}
