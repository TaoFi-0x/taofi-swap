
// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract StakingManagerProxy is TransparentUpgradeableProxy {
    constructor(address _logic, address admin_, bytes memory _data) TransparentUpgradeableProxy(_logic, admin_, _data) {}
}