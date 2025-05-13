// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

interface ITAOStaker {
    /// @notice Error emitted when a hotkey is already added
    /// @param hotkey The hotkey that was already added
    error HotKeyAlreadyAdded(bytes32 hotkey);

    /// @notice Error emitted when a hotkey is not added
    /// @param hotkey The hotkey that was not added
    error HotKeyNotAdded(bytes32 hotkey);

    /// @notice Event emitted when the pubkey is set
    /// @param pubKey The pubkey that was set
    event PubKeySet(bytes32 pubKey);

    /// @notice Event emitted when the staking precompile is set
    /// @param stakingPrecompile The staking precompile that was set
    event StakingPrecompileSet(address stakingPrecompile);

    /// @notice Event emitted when hotkeys are added
    /// @param hotkeys The hotkeys that were added
    event HotkeysAdded(bytes32[] hotkeys);

    /// @notice Event emitted when hotkeys are removed
    /// @param hotkey The hotkey that is removed
    event HotkeyRemoved(bytes32 hotkey);

    /// @notice Event emitted when the hotkey priority is set
    /// @param hotkeyIndex The index of the hotkey that is set as the priority hotkey
    event HotKeyPrioritySet(uint256 hotkeyIndex);

    /// @notice Event emitted when a stake is added
    /// @param hotkey The hotkey that the stake is added to
    /// @param amount The amount of TAO that is added
    event StakeAdded(bytes32 hotkey, uint256 amount);

    /// @notice Event emitted when a stake is removed
    /// @param hotkey The hotkey that the stake is removed from
    /// @param amount The amount of TAO that is removed
    event StakeRemoved(bytes32 hotkey, uint256 amount);

    /// @notice Returns the pubkey of the contract
    /// @return pubKey The pubkey of the contract
    function getPubKey() external view returns (bytes32 pubKey);

    /// @notice Returns the staking precompile address
    /// @return stakingPrecompile The staking precompile address
    function getStakingPrecompile() external view returns (address stakingPrecompile);

    /// @notice Returns the hotkeys of the contract
    /// @return hotkeys The hotkeys of the contract
    function getHotkeys() external view returns (bytes32[] memory hotkeys);

    /// @notice Returns the hotkey at a given index
    /// @param index The index of the hotkey to return
    /// @return hotkey The hotkey at the given index
    function getHotKey(uint256 index) external view returns (bytes32 hotkey);

    /// @notice Returns the amount of TAO staked on a given hotkey
    /// @param hotkey The hotkey to get the stake for
    /// @return stake The amount of TAO staked on the given hotkey
    function getHotKeyStakedAmount(bytes32 hotkey) external view returns (uint256 stake);

    /// @notice Returns whether a hotkey is added to the contract
    /// @param hotkey The hotkey to check
    /// @return isAdded Whether the hotkey is added to the contract
    function isHotKeyAdded(bytes32 hotkey) external view returns (bool isAdded);

    /// @notice Returns the total amount of TAO staked in the contract
    /// @return totalStaked The total amount of TAO staked in the contract
    function totalStakedTAO() external view returns (uint256 totalStaked);

    /// @notice Sets the pubkey of the contract
    /// @param pubKey The pubkey to set
    function setPubKey(bytes32 pubKey) external;

    /// @notice Sets the staking precompile address
    /// @param stakingPrecompile The staking precompile address to set
    function setStakingPrecompile(address stakingPrecompile) external;

    /// @notice Sets the hotkey at a given index as the priority hotkey
    /// @param hotkeyIndex The index of the hotkey to set as the priority hotkey
    function setHotKeyAsPriority(uint256 hotkeyIndex) external;

    /// @notice Rebalances the stakes of the contract
    /// @param amounts The amounts to rebalance to
    function rebalance(uint256[] calldata amounts) external;

    /// @notice Adds hotkeys to the contract
    /// @param hotkeys The hotkeys to add
    function addHotKeys(bytes32[] calldata hotkeys) external;

    /// @notice Removes hotkeys from the contract
    /// @param hotKeysIndexes The indexes of the hotkeys to remove
    function removeHotKeys(uint256[] calldata hotKeysIndexes) external;
}
