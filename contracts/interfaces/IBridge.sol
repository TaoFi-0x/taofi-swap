// SPDX-License-Identifier: AGPL-v3.0
pragma solidity 0.8.21;

interface IBridge {
    function transferRemote(
        uint32 _destination,
        bytes32 _recipient,
        uint256 _amount
    ) external payable;
}