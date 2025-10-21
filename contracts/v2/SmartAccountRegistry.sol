// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.22;

import {EnumerableSet} from "oz5/utils/structs/EnumerableSet.sol";

import {ISmartAccountRegistry} from "../interfaces/ISmartAccountRegistry.sol";
import {IMultiOwnableSmartAccount} from "../interfaces/IMultiOwnableSmartAccount.sol";

contract SmartAccountRegistry is ISmartAccountRegistry {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(bytes32 owner => EnumerableSet.AddressSet) smartAccounts;

    /// @inheritdoc ISmartAccountRegistry
    function getSmartAccounts(bytes32 owner) external view returns (address[] memory) {
        return smartAccounts[owner].values();
    }

    /// @inheritdoc ISmartAccountRegistry
    function registerSmartAccount(bytes32 owner) external {
        require(IMultiOwnableSmartAccount(msg.sender).isOwner(owner), "SAR: NOT_OWNER");

        smartAccounts[owner].add(msg.sender);

        emit SmartAccountRegistered(owner, msg.sender);
    }

    /// @inheritdoc ISmartAccountRegistry
    function unregisterSmartAccount(bytes32 owner) external {
        require(IMultiOwnableSmartAccount(msg.sender).isOwner(owner), "SAR: NOT_OWNER");

        smartAccounts[owner].remove(msg.sender);

        emit SmartAccountUnregistered(owner, msg.sender);
    }
}
