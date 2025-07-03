// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

interface IAlphaTokenFactory {
    function deployNewAlphaToken(string memory name, string memory symbol, uint256 netuid) external returns (address);
}
