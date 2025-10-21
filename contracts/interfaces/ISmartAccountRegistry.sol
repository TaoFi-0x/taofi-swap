// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.22;

interface ISmartAccountRegistry {
    /// @notice Event emitted when a smart account is registered
    /// @param owner The owner of the smart account
    /// @param smartAccount The smart account that was registered
    event SmartAccountRegistered(bytes32 owner, address smartAccount);

    /// @notice Event emitted when a smart account is unregistered
    /// @param owner The owner of the smart account
    /// @param smartAccount The smart account that was unregistered
    event SmartAccountUnregistered(bytes32 owner, address smartAccount);

    /// @notice Returns the smart accounts for the given owner
    /// @param owner The owner of the smart account
    /// @return smartAccounts The smart accounts for the given owner
    function getSmartAccounts(bytes32 owner) external view returns (address[] memory);

    /// @notice Registers a smart account
    /// @param owner The owner of the smart account
    function registerSmartAccount(bytes32 owner) external;

    /// @notice Unregisters a smart account
    /// @param owner The owner of the smart account
    function unregisterSmartAccount(bytes32 owner) external;
}
