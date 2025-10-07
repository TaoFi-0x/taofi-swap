// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.22;

import {BeaconProxy} from "oz5/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "oz5/proxy/beacon/UpgradeableBeacon.sol";
import {Create2} from "oz5/utils/Create2.sol";

import {IBeaconProxyFactory} from "../interfaces/IBeaconProxyFactory.sol";
import {MultiOwnableSmartAccount} from "./MultiOwnableSmartAccount.sol";

contract BeaconProxyFactory is UpgradeableBeacon, IBeaconProxyFactory {
    uint256 public count;

    constructor(address _implementation, address _owner) UpgradeableBeacon(_implementation, _owner) {}

    function getNextProxyAddress(bytes32 initialOwner) external view returns (address proxy) {
        address beacon = address(this);
        bytes32 salt = keccak256(abi.encode(initialOwner, count));
        bytes memory initialize = abi.encodeWithSelector(MultiOwnableSmartAccount.initialize.selector, initialOwner);
        bytes memory bytecode = abi.encodePacked(type(BeaconProxy).creationCode, abi.encode(beacon, initialize));
        return Create2.computeAddress(salt, keccak256(bytecode), address(this));
    }

    function createProxy(bytes32 initialOwner) external returns (address proxy) {
        address beacon = address(this);
        bytes32 salt = keccak256(abi.encode(initialOwner, count));
        bytes memory initialize = abi.encodeWithSelector(MultiOwnableSmartAccount.initialize.selector, initialOwner);
        bytes memory bytecode = abi.encodePacked(type(BeaconProxy).creationCode, abi.encode(beacon, initialize));

        proxy = Create2.deploy(0, salt, bytecode);
        count++;

        emit ProxyCreated(proxy, initialOwner);
    }
}
