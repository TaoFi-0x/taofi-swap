// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

contract TempStakingPrecompile {
    function getTotalColdkeyStake(bytes32) external pure returns (uint256) {
        return 0;
    }
}
