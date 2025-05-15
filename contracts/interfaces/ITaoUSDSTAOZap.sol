// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

interface ITaoUSDSTAOZap {
    function swapExactTAOForTAOUSD(uint256 minTaoUSDAmount) external payable returns (uint256 taoUSDAmount);
}