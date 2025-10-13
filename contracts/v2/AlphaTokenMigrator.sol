// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.22;

import {IERC20} from "oz5/token/ERC20/IERC20.sol";
import {SafeERC20} from "oz5/token/ERC20/utils/SafeERC20.sol";

import {IBeaconProxyFactory} from "../interfaces/IBeaconProxyFactory.sol";

contract AlphaTokenMigrator {
    IBeaconProxyFactory public beaconProxyFactory;

    constructor(address _beaconProxyFactory) {
        beaconProxyFactory = IBeaconProxyFactory(_beaconProxyFactory);
    }

    function createAccountAndMigrate(bytes32 initialOwner, address[] memory alphaTokens) external {
        address account = beaconProxyFactory.createProxy(initialOwner);

        for (uint256 i = 0; i < alphaTokens.length; i++) {
            address token = alphaTokens[i];
            uint256 amount = IERC20(token).balanceOf(msg.sender);

            SafeERC20.safeTransferFrom(IERC20(token), msg.sender, account, amount);
        }
    }
}
