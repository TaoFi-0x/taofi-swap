// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import "hardhat/console.sol";

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IStaking} from "./interfaces/IStaking.sol";
import {ITAOStaker} from "./interfaces/ITAOStaker.sol";

contract TAOStaker is OwnableUpgradeable, ITAOStaker {
    struct TAOSTakerStorage {
        /// @notice Pubkey of this contract
        bytes32 pubKey;
        /// @notice Staking precompile address
        address stakingPrecompile;
        /// @notice Array of hotkeys to delegate to
        bytes32[] hotkeys;
        /// @notice Mapping of hotkeys to check if they exist in the hotkeys array
        mapping(bytes32 => bool) isHotKeyAdded;
    }

    function _getTAOStakerStorage() internal pure returns (TAOSTakerStorage storage s) {
        bytes32 slot =
            keccak256(abi.encode(uint256(keccak256("taofi.contracts.storage.TAOStaker")) - 1)) & ~bytes32(uint256(0xff));

        assembly {
            s.slot := slot
        }
    }

    receive() external payable {}

    function __TAOStaker_init(bytes32 pubKey, address stakingPrecompile) internal {
        TAOSTakerStorage storage $ = _getTAOStakerStorage();
        $.pubKey = pubKey;
        $.stakingPrecompile = stakingPrecompile;

        emit PubKeySet(pubKey);
        emit StakingPrecompileSet(stakingPrecompile);
    }

    /// @inheritdoc ITAOStaker
    function getPubKey() public view returns (bytes32) {
        return _getTAOStakerStorage().pubKey;
    }

    /// @inheritdoc ITAOStaker
    function getStakingPrecompile() public view returns (address) {
        return _getTAOStakerStorage().stakingPrecompile;
    }

    /// @inheritdoc ITAOStaker
    function getHotkeys() public view returns (bytes32[] memory) {
        return _getTAOStakerStorage().hotkeys;
    }

    /// @inheritdoc ITAOStaker
    function getHotKey(uint256 index) public view returns (bytes32) {
        return _getTAOStakerStorage().hotkeys[index];
    }

    /// @inheritdoc ITAOStaker
    function getHotKeyStakedAmount(bytes32 hotkey) public view returns (uint256) {
        return IStaking(getStakingPrecompile()).getStake(hotkey, getPubKey(), 0);
    }

    /// @inheritdoc ITAOStaker
    function isHotKeyAdded(bytes32 hotkey) public view returns (bool) {
        return _getTAOStakerStorage().isHotKeyAdded[hotkey];
    }

    /// @inheritdoc ITAOStaker
    function totalStakedTAO() public view returns (uint256 totalStaked) {
        bytes32[] memory hotkeys = _getTAOStakerStorage().hotkeys;
        for (uint256 i = 0; i < hotkeys.length; i++) {
            totalStaked += getHotKeyStakedAmount(hotkeys[i]);
        }

        return totalStaked + address(this).balance;
    }

    /// @inheritdoc ITAOStaker
    function setPubKey(bytes32 pubKey) public onlyOwner {
        _getTAOStakerStorage().pubKey = pubKey;
        emit PubKeySet(pubKey);
    }

    /// @inheritdoc ITAOStaker
    function setStakingPrecompile(address stakingPrecompile) public onlyOwner {
        _getTAOStakerStorage().stakingPrecompile = stakingPrecompile;
        emit StakingPrecompileSet(stakingPrecompile);
    }

    /// @inheritdoc ITAOStaker
    function setHotKeyAsPriority(uint256 hotkeyIndex) public onlyOwner {
        bytes32 newPriorityHotKey = getHotKey(hotkeyIndex);

        TAOSTakerStorage storage $ = _getTAOStakerStorage();
        $.hotkeys[hotkeyIndex] = $.hotkeys[0];
        $.hotkeys[0] = newPriorityHotKey;

        emit HotKeyPrioritySet(hotkeyIndex);
    }

    /// @inheritdoc ITAOStaker
    function rebalance(uint256[] calldata amounts) public onlyOwner {
        // increase/decrease the stakes according to the hotkeys and amounts
        // make it so that the final stake in the hotkeys is the amount specified
        bytes32[] memory hotkeys = getHotkeys();

        for (uint256 i = 0; i < hotkeys.length; i++) {
            uint256 currentStake = getHotKeyStakedAmount(hotkeys[i]);
            if (currentStake < amounts[i]) {
                _addStake(hotkeys[i], amounts[i] - currentStake);
            } else if (currentStake > amounts[i]) {
                _removeStake(hotkeys[i], currentStake - amounts[i]);
            }
        }
    }

    /// @inheritdoc ITAOStaker
    function addHotKeys(bytes32[] calldata hotkeys) public onlyOwner {
        for (uint256 i = 0; i < hotkeys.length; i++) {
            bytes32 hotkey = hotkeys[i];

            if (isHotKeyAdded(hotkey)) {
                revert HotKeyAlreadyAdded(hotkey);
            }

            _getTAOStakerStorage().hotkeys.push(hotkey);
            _getTAOStakerStorage().isHotKeyAdded[hotkey] = true;
        }

        emit HotkeysAdded(hotkeys);
    }

    /// @inheritdoc ITAOStaker
    function removeHotKeys(uint256[] calldata hotKeysIndexes) public onlyOwner {
        for (uint256 i = 0; i < hotKeysIndexes.length; i++) {
            uint256 index = hotKeysIndexes[i];

            // If hotkey is not added, this function call will revert so there is not need for special case handling
            // but we can check just in case
            bytes32 hotkey = getHotKey(index);
            if (!isHotKeyAdded(hotkey)) {
                revert HotKeyNotAdded(hotkey);
            }

            _removeStake(hotkey, getHotKeyStakedAmount(hotkey));

            // Remove the hotkey from the array
            TAOSTakerStorage storage $ = _getTAOStakerStorage();
            uint256 lastIndex = $.hotkeys.length - 1;

            // If the element to remove is not the last one, move the last element to the position being removed
            if (index < lastIndex) {
                $.hotkeys[index] = $.hotkeys[lastIndex];
            }

            // Remove the last element
            $.hotkeys.pop();

            // Update the mapping
            $.isHotKeyAdded[hotkey] = false;

            emit HotkeyRemoved(hotkey);
        }
    }

    /// @notice Removes from all hotkeys until the given amount is unstaken
    /// @param amount The amount to unstake
    /// @dev This function is used in order to make TAO liquid
    function _unstake(uint256 amount) internal {
        bytes32[] memory hotkeys = _getTAOStakerStorage().hotkeys;

        // Go through each hotkeys and unstake until full amount is unstaken
        // If there is not enough staked TAO this function will revert because of the overflow
        uint256 i = 0;
        while (amount > 0) {
            uint256 availableOnHotKey = getHotKeyStakedAmount(hotkeys[i]);
            uint256 amountToUnstake = Math.min(amount, availableOnHotKey);

            _removeStake(hotkeys[i], amountToUnstake);
            amount -= amountToUnstake;
            i++;
        }
    }

    /// @notice Stakes on the first hotkey
    /// @param amount The amount to stake
    /// @dev This function is used in order to always automatically stake TAO on the first hotkey
    function _stakeOnFirstHotKey(uint256 amount) internal {
        bytes32 hotkey = _getTAOStakerStorage().hotkeys[0];
        _addStake(hotkey, amount);
    }

    /// @notice Adds a stake to a hotkey
    /// @param hotkey The hotkey to add the stake to
    /// @param amount The amount to add
    function _addStake(bytes32 hotkey, uint256 amount) internal {
        IStaking(getStakingPrecompile()).addStake{value: amount}(hotkey, 0);
        emit StakeAdded(hotkey, amount);
    }

    /// @notice Removes a stake from a hotkey
    /// @param hotkey The hotkey to remove the stake from
    /// @param amount The amount to remove
    function _removeStake(bytes32 hotkey, uint256 amount) internal {
        IStaking(getStakingPrecompile()).removeStake(hotkey, amount, 0);
        emit StakeRemoved(hotkey, amount);
    }
}
