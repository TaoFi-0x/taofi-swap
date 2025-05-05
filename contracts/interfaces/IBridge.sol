// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

interface IBridge {
    /// @notice Bridges tokens between chains
    /// @param _destination The destination chain
    /// @param _recipient The recipient address
    /// @param _amount The amount of tokens to transfer
    /// @return messageId The message ID of the transfer
    function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount)
        external
        payable
        returns (bytes32 messageId);
}
