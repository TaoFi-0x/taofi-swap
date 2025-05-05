// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

/// @notice Interface for STAO smart contract
interface ISTAO {
    /// @notice Event emitted when a deposit is made
    event Deposit(address indexed sender, address indexed receiver, uint256 amount, uint256 shares);

    /// @notice Event emitted when a withdrawal is made
    event Withdrawal(address indexed sender, address indexed receiver, uint256 amount, uint256 shares);

    /// @notice Event emitted when the network fee is set
    event NetworkFeeSet(uint256 networkFee);

    /// @notice Event emitted when a pub key is set
    event PubKeySet(bytes32 indexed pubKey);

    /// Event emitted when the staking precompile is set
    event StakingPrecompileSet(address indexed stakingPrecompile);

    /// @notice Event emitted when a stake is increased
    event StakeIncreased(bytes32 indexed hotkey, uint256 amount);

    /// @notice Event emitted when a stake is decreased
    event StakeDecreased(bytes32 indexed hotkey, uint256 amount);

    /// @notice Event emitted when the stakes are rebalanced
    event Rebalanced(bytes32[] hotkeys, uint256[] amounts);

    /// @notice Returns the network fee
    /// @return networkFee The network fee
    function networkFee() external view returns (uint256 networkFee);

    /// @notice Returns how much TAO is staked in the contract
    /// @return totalStaked The total amount of TAO staked in the contract
    /// @dev Calculation is done by summarizing the balance of the contract and the total stake on the staking precompile
    function totalStakedTAO() external view returns (uint256 totalStaked);

    /// @notice Returns corresponding shares for the given amount of TAO, rounded down
    /// @param assets The amount of TAO to convert to shares
    /// @param totalStakeToDecrease The total stake to decrease
    /// @return shares The corresponding shares for the given amount of TAO
    /// @dev totalStakeToDecrease should be msg.value in case of deposit. For external use it should be 0
    /// @dev Calculation is done based on OZ implementation of ERC4626 standard in order to avoid inflation attack
    function convertToShares(uint256 assets, uint256 totalStakeToDecrease) external view returns (uint256 shares);

    /// @notice Returns corresponding TAO for the given amount of shares, rounded down
    /// @param shares The amount of shares to convert to TAO
    /// @return assets The corresponding TAO for the given amount of shares
    /// @dev Calculation is done based on OZ implementation of ERC4626 standard in order to avoid inflation attack
    function convertToAssets(uint256 shares) external view returns (uint256 assets);

    /// @notice Sets the network fee
    /// @param networkFee The new network fee to set
    /// @dev This function is callable only by the owner
    function setNetworkFee(uint256 networkFee) external;

    /// @notice Sets the public key of the contract
    /// @param pubKey The new public key to set
    /// @dev This function is callable only by the owner
    function setPubKey(bytes32 pubKey) external;

    /// @notice Sets the staking precompile address
    /// @param stakingPrecompile The new staking precompile address to set
    /// @dev This function is callable only by the owner
    function setStakingPrecompile(address stakingPrecompile) external;

    /// @notice Rebalances the stakes of the contract
    /// @param hotkeys The hotkeys to rebalance
    /// @param amounts The amounts to rebalance to
    /// @dev This function is callable only by the owner
    function rebalance(bytes32[] calldata hotkeys, uint256[] calldata amounts) external;

    /// @notice Increases the stake of the contract
    /// @param hotkey The hotkey to increase the stake for
    /// @param amount The amount to increase the stake by
    /// @dev This function is payable and callable only by the owner
    function increaseStake(bytes32 hotkey, uint256 amount) external payable;

    /// @notice Decreases the stake of the contract
    /// @param hotkey The hotkey to decrease the stake for
    /// @param amount The amount to decrease the stake by
    /// @dev This function is callable only by the owner
    function decreaseStake(bytes32 hotkey, uint256 amount) external;

    /// @notice Deposits TAO into the contract, minting sTAO to receiver
    /// @param receiver The address to receives shares
    /// @param minSTAO The minimum amount of sTAO to mint
    /// @dev If the amount of TAO is less than minSTAO, the transaction will revert due to big slippage
    function deposit(address receiver, uint256 minSTAO) external payable;

    /// @notice Withdraws TAO from the contract, burning sTAO from sender and sending TAO to receiver
    /// @param amount The amount of sTAO to burn
    /// @param receiver The address to receive TAO
    /// @param minTAO The minimum amount of TAO to receive
    /// @dev If the amount of TAO is less than minTAO, the transaction will revert due to big slippage
    function withdraw(uint256 amount, address receiver, uint256 minTAO) external;
}
