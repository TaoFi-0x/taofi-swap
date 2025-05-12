// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./interfaces/IStaking.sol";
import "hardhat/console.sol";

contract MockStakingPrecompile is IStaking {
    // Mapping to track stakes: hotkey => coldkey => netuid => amount
    mapping(bytes32 => mapping(bytes32 => mapping(uint256 => uint256))) public stakes;

    // Track total stakes per coldkey
    mapping(bytes32 => uint256) public totalStakes;

    // Arrays to track active keys
    bytes32[] public activeColdkeys;
    bytes32[] public activeHotkeys;

    // Mappings to track if keys are active
    mapping(bytes32 => bool) public isColdkeyActive;
    mapping(bytes32 => bool) public isHotkeyActive;

    // Allows receiving TAO
    receive() external payable {}

    function addStake(bytes32 hotkey, uint256 netuid) external payable override {
        require(hotkey != bytes32(0), "Invalid hotkey");
        require(msg.value > 0, "Must stake non-zero amount");

        // Extract the coldkey from the msg.sender
        bytes32 coldkey = bytes32(uint256(uint160(msg.sender)));
        console.log("coldkey:");
        console.logBytes32(coldkey);
        console.log("hotkey:");
        console.logBytes32(hotkey);
        console.log("msg.value:");
        console.log(msg.value);

        // Add coldkey to active list if not already active
        if (!isColdkeyActive[coldkey]) {
            activeColdkeys.push(coldkey);
            isColdkeyActive[coldkey] = true;
        }

        // Add hotkey to active list if not already active
        if (!isHotkeyActive[hotkey]) {
            activeHotkeys.push(hotkey);
            isHotkeyActive[hotkey] = true;
        }

        stakes[hotkey][coldkey][netuid] += msg.value;
        console.log("stakes[hotkey][coldkey][netuid]:");
        console.log(stakes[hotkey][coldkey][netuid]);
        totalStakes[coldkey] += msg.value;
        console.log("totalStakes[coldkey]:");
        console.log(totalStakes[coldkey]);
    }

    // function to simulate adding staking rewards to a specific hotkey at netuid
    function accrueStakingRewards(bytes32 hotkey, uint256 netuid, uint256 amount) external {
        require(isHotkeyActive[hotkey], "Hotkey not active");

        // Calculate total stake for this hotkey across all coldkeys
        uint256 totalHotkeyStake = 0;
        for (uint256 i = 0; i < activeColdkeys.length; i++) {
            bytes32 coldkey = activeColdkeys[i];
            totalHotkeyStake += stakes[hotkey][coldkey][netuid];
        }

        require(totalHotkeyStake > 0, "No stake for hotkey");

        // Distribute rewards proportionally
        for (uint256 i = 0; i < activeColdkeys.length; i++) {
            bytes32 coldkey = activeColdkeys[i];
            uint256 coldkeyStake = stakes[hotkey][coldkey][netuid];

            if (coldkeyStake > 0) {
                uint256 reward = (amount * coldkeyStake) / totalHotkeyStake;
                stakes[hotkey][coldkey][netuid] += reward;
                totalStakes[coldkey] += reward;
            }
        }
    }

    function removeStake(bytes32 hotkey, uint256 amount, uint256 netuid) external override {
        bytes32 coldkey = bytes32(uint256(uint160(msg.sender)));
        console.log("coldkey:");
        console.logBytes32(coldkey);
        console.log("hotkey:");
        console.logBytes32(hotkey);

        require(stakes[hotkey][coldkey][netuid] >= amount, "Insufficient stake");

        stakes[hotkey][coldkey][netuid] -= amount;
        totalStakes[coldkey] -= amount;

        // Check if coldkey has no more total stake
        if (totalStakes[coldkey] == 0) {
            removeColdkey(coldkey);
        }

        // Check if hotkey has no more stake across all coldkeys
        bool hasStake = false;
        for (uint256 i = 0; i < activeColdkeys.length; i++) {
            if (stakes[hotkey][activeColdkeys[i]][netuid] > 0) {
                hasStake = true;
                break;
            }
        }
        if (!hasStake) {
            removeHotkey(hotkey);
        }

        // Transfer the unstaked amount back
        payable(msg.sender).transfer(amount);
    }

    function getTotalColdkeyStake(bytes32 coldkey) external view override returns (uint256) {
        return totalStakes[coldkey];
    }

    function getStake(bytes32 hotkey, bytes32 coldkey, uint256 netuid) external view override returns (uint256) {
        return stakes[hotkey][coldkey][netuid];
    }

    // Helper function to remove coldkey from active list
    function removeColdkey(bytes32 coldkey) internal {
        for (uint256 i = 0; i < activeColdkeys.length; i++) {
            if (activeColdkeys[i] == coldkey) {
                activeColdkeys[i] = activeColdkeys[activeColdkeys.length - 1];
                activeColdkeys.pop();
                isColdkeyActive[coldkey] = false;
                break;
            }
        }
    }

    // Helper function to remove hotkey from active list
    function removeHotkey(bytes32 hotkey) internal {
        for (uint256 i = 0; i < activeHotkeys.length; i++) {
            if (activeHotkeys[i] == hotkey) {
                activeHotkeys[i] = activeHotkeys[activeHotkeys.length - 1];
                activeHotkeys.pop();
                isHotkeyActive[hotkey] = false;
                break;
            }
        }
    }
}
