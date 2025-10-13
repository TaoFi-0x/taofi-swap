// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IBeaconProxyFactory {
    /// @notice Emitted when a new contract is deployed from factory
    /// @param proxy The address of newly deployed contract
    /// @param initialOwner The address of the initial owner
    event ProxyCreated(address indexed proxy, bytes32 indexed initialOwner);

    /// @notice Returns the number of BeaconProxys deployed by the factory
    /// @return count The number of BeaconProxys deployed by the factory
    function count() external view returns (uint256 count);

    /// @notice Computes the address of a BeaconProxy before deployment
    /// @param initialOwner The address of the initial owner
    /// @return proxy The predicted address of the BeaconProxy
    function getNextProxyAddress(bytes32 initialOwner) external view returns (address proxy);

    /// @notice Deploys a BeaconProxy
    /// @param initialOwner The address of the initial owner
    /// @return proxy The address of the deployed BeaconProxy
    function createProxy(bytes32 initialOwner) external returns (address proxy);
}
