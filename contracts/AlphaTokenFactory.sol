// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.21;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {AlphaToken} from "./AlphaToken.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AlphaTokenFactory is UpgradeableBeacon {
    constructor(address _implementation) UpgradeableBeacon(_implementation) {}

    function deployNewAlphaToken(string memory name, string memory symbol, uint256 netuid, bytes32 hotkey)
        external
        returns (address)
    {
        bytes32 salt = keccak256(abi.encode(msg.sender, netuid, hotkey));

        bytes memory initializer = abi.encodeWithSelector(AlphaToken.initialize.selector, name, symbol);
        bytes memory bytecode = abi.encodePacked(type(BeaconProxy).creationCode, abi.encode(address(this), initializer));

        address proxy = Create2.deploy(0, salt, bytecode);
        Ownable(proxy).transferOwnership(msg.sender);

        return proxy;
    }
}
