// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

interface IBTAO {
    /// @notice Emits when the network fee is set
    /// @param _networkFee The network fee
    event NetworkFeeSet(uint256 _networkFee);

    /// @notice Emits when the bridge fee is set
    /// @param _bridgeFee The bridge fee
    event BridgeFeeSet(uint256 _bridgeFee);

    /// @notice Emits when the bridge is set
    /// @param _bridge The bridge address
    event BridgeSet(address _bridge);

    /// @notice The subtensor network fee
    /// @param _networkFee The network fee
    function networkFee() external view returns (uint256 _networkFee);

    /// @notice The bridge fee
    /// @param _bridgeFee The bridge fee
    function bridgeFee() external view returns (uint256 _bridgeFee);

    /// @notice The bridge address
    /// @param _bridge The bridge address
    function bridge() external view returns (address _bridge);

    /// @notice The sTAO address
    /// @param _sTAO The sTAO address
    function sTAO() external view returns (address _sTAO);

    /// @notice Sets the network fee
    /// @param _networkFee The network fee
    /// @dev Only the owner can call this function
    function setNetworkFee(uint256 _networkFee) external;

    /// @notice Sets the bridge fee
    /// @param _bridgeFee The bridge fee
    /// @dev Only the owner can call this function
    function setBridgeFee(uint256 _bridgeFee) external;

    /// @notice Sets the bridge address
    /// @param _bridge The bridge address
    /// @dev Only the owner can call this function
    function setBridge(address _bridge) external;

    /// @notice Stakes TAO
    /// @param _amount The amount of TAO to stake
    /// @param minSTAO The minimum amount of sTAO to receive
    /// @dev Only the owner can call this function
    function stake(uint256 _amount, uint256 minSTAO) external payable;

    /// @notice Unstakes TAO
    /// @param _amount The amount of TAO to unstake
    /// @param minTAO The minimum amount of TAO to receive
    /// @dev Only the owner can call this function
    function unstake(uint256 _amount, uint256 minTAO) external;

    /// @notice Transfers TAO to the bridge, follows the Hyperlane interface
    /// @param _destination The destination chain
    /// @param _recipient The recipient address
    /// @param _amount The amount of TAO to transfer
    /// @param _minSTAO The minimum amount of sTAO to receive
    /// @return messageId The message ID of the transfer
    function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount, uint256 _minSTAO)
        external
        payable
        returns (bytes32 messageId);
}
