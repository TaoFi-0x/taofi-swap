// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

address constant ISTAKING_ADDRESS = 0x0000000000000000000000000000000000000805;

interface IStakingV2 {
    function addStake(bytes32 hotkey, uint256 amount, uint256 netuid) external payable;

    function removeStake(bytes32 hotkey, uint256 amount, uint256 netuid) external;

    function moveStake(
        bytes32 origin_hotkey,
        bytes32 destination_hotkey,
        uint256 origin_netuid,
        uint256 destination_netuid,
        uint256 amount
    ) external;

    function transferStake(
        bytes32 destination_coldkey,
        bytes32 hotkey,
        uint256 origin_netuid,
        uint256 destination_netuid,
        uint256 amount
    ) external;

    function getTotalColdkeyStake(bytes32 coldkey) external view returns (uint256);

    function getTotalHotkeyStake(bytes32 hotkey) external view returns (uint256);

    function getStake(bytes32 hotkey, bytes32 coldkey, uint256 netuid) external view returns (uint256);

    function addProxy(bytes32 delegate) external;

    function removeProxy(bytes32 delegate) external;

    function getAlphaStakedValidators(bytes32 hotkey, uint256 netuid) external view returns (uint256[] memory);

    function getTotalAlphaStaked(bytes32 hotkey, uint256 netuid) external view returns (uint256);

    function addStakeLimit(bytes32 hotkey, uint256 amount, uint256 limit_price, bool allow_partial, uint256 netuid)
        external;

    function removeStakeLimit(bytes32 hotkey, uint256 amount, uint256 limit_price, bool allow_partial, uint256 netuid)
        external;
}
