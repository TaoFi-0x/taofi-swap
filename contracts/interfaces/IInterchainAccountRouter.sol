// SPDX-License-Identifier: AGPL-v3.0
pragma solidity ^0.8.21;

struct Call {
    bytes32 to; // supporting non EVM targets
    uint256 value;
    bytes data;
}

interface IInterchainAccountRouter {
    function getRemoteInterchainAccount(uint32 _destination, address _owner) external view returns (address);

    // For creating namespaced/user-specific ICAs
    function getRemoteInterchainAccount(uint32 _destination, address _owner, bytes32 _userSalt)
        external
        view
        returns (address);

    function callRemote(uint32 _destinationDomain, Call[] calldata calls) external payable returns (bytes32);
}

interface IInterchainAccountRouterWithOverrides {
    function callRemoteWithOverrides(
        uint32 _destination,
        bytes32 _router,
        bytes32 _ism,
        Call[] calldata _calls,
        bytes memory _hookMetadata
    ) external payable returns (bytes32);

    function callRemoteWithOverrides(
        uint32 _destination,
        bytes32 _router,
        bytes32 _ism,
        Call[] calldata _calls,
        bytes memory _hookMetadata,
        bytes32 _userSalt // For namespaced ICAs
    ) external payable returns (bytes32);

    // Get ICA address when using overrides for derivation
    function getRemoteInterchainAccount(
        address _owner,
        address _router, // address type for getRemoteInterchainAccount
        address _ism, // address type for getRemoteInterchainAccount
        bytes32 _userSalt
    ) external view returns (address);
}
