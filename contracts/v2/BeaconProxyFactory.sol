// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.22;

import {BeaconProxy} from "oz5/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "oz5/proxy/beacon/UpgradeableBeacon.sol";
import {Create2} from "oz5/utils/Create2.sol";

import {IBeaconProxyFactory} from "../interfaces/IBeaconProxyFactory.sol";
import {MultiOwnableSmartAccount} from "./MultiOwnableSmartAccount.sol";

contract BeaconProxyFactory is UpgradeableBeacon, IBeaconProxyFactory {
    address public smartAccountRegistry;

    constructor(address _implementation, address _owner, address _smartAccountRegistry)
        UpgradeableBeacon(_implementation, _owner)
    {
        smartAccountRegistry = _smartAccountRegistry;
    }

    /// @inheritdoc IBeaconProxyFactory
    function getNextProxyAddress(bytes32[] memory initialOwners, bytes32 salt, address sender)
        external
        view
        returns (address proxy)
    {
        salt = keccak256(abi.encode(salt, sender));

        address beacon = address(this);
        bytes memory initialize =
            abi.encodeWithSelector(MultiOwnableSmartAccount.initialize.selector, beacon, initialOwners);
        bytes memory bytecode = abi.encodePacked(type(BeaconProxy).creationCode, abi.encode(beacon, initialize));
        return Create2.computeAddress(salt, keccak256(bytecode), address(this));
    }

    /// @inheritdoc IBeaconProxyFactory
    function createProxy(bytes32[] memory initialOwners, bytes32 salt) external returns (address proxy) {
        address beacon = address(this);

        bytes memory initialize =
            abi.encodeWithSelector(MultiOwnableSmartAccount.initialize.selector, beacon, initialOwners);
        bytes memory bytecode = abi.encodePacked(type(BeaconProxy).creationCode, abi.encode(beacon, initialize));

        salt = keccak256(abi.encode(salt, msg.sender));
        proxy = Create2.deploy(0, salt, bytecode);

        emit ProxyCreated(proxy, initialOwners);
    }
}
