// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

address constant IBALANCETRANSFER_ADDRESS = 0x0000000000000000000000000000000000000800;

interface IBalanceTransfer {
    function transfer(bytes32 data) external payable;
}
