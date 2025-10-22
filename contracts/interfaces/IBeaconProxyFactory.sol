// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IBeaconProxyFactory {
    /// @notice Emitted when a new contract is deployed from factory
    /// @param proxy The address of newly deployed contract
    /// @param initialOwners The address of the initial owners
    event ProxyCreated(address indexed proxy, bytes32[] indexed initialOwners);

    /// @notice Computes the address of a BeaconProxy before deployment
    /// @param salt The salt for the BeaconProxy
    /// @param sender The address of the sender
    /// @return proxy The predicted address of the BeaconProxy
    function getNextProxyAddress(bytes32 salt, address sender) external view returns (address proxy);

    /// @notice Returns the address of the smart account registry
    /// @return smartAccountRegistry The address of the smart account registry
    function smartAccountRegistry() external view returns (address smartAccountRegistry);

    /// @notice Deploys a BeaconProxy
    /// @param initialOwners The address of the initial owners
    /// @param salt The salt for the BeaconProxy
    /// @return proxy The address of the deployed BeaconProxy
    function createProxy(bytes32[] memory initialOwners, bytes32 salt) external returns (address proxy);
}
