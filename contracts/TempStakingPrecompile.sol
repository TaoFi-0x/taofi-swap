// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./interfaces/IStaking.sol";
import "hardhat/console.sol";

contract TempStakingPrecompile {
    function getTotalColdkeyStake(
        bytes32 coldkey
    ) external view returns (uint256) {
        return 0;
    }
}
