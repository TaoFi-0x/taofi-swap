// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

interface IWTAO {
    function deposit() external payable;

    function withdraw(uint256 amount) external;
}
