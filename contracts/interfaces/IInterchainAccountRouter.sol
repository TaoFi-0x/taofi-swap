// SPDX-License-Identifier: AGPL-v3.0
pragma solidity 0.8.21;

struct Call {
    bytes32 to; // supporting non EVM targets
    uint256 value;
    bytes data;
}

interface IInterchainAccountRouter {
    function getRemoteInterchainAccount(
        uint32 _destination,
        address _owner
    ) external view returns (address);

    function callRemote(
        uint32 _destinationDomain,
        Call[] calldata calls
    ) external payable returns (bytes32);
}