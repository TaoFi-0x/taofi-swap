// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.21;

import {IStakingV2} from "./interfaces/IStakingV2.sol";
import {IStakingManager} from "./interfaces/IStakingManager.sol";
import {IAlphaToken} from "./interfaces/IAlphaToken.sol";
import {IAlphaTokenFactory} from "./interfaces/IAlphaTokenFactory.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title StakingManager
 * @author kitanovicd (TaoFi)
 * @notice This contract manages staking operations by acting as a proxy to a staking precompile.
 * It allows users to stake TAO tokens and receive corresponding AlphaTokens, which represent their
 * staked position in a specific subnet (netuid).
 * @dev This contract is owned and managed by a single owner who can set administrative addresses.
 * It relies on external interfaces for the staking precompile, alpha token, and its factory.
 */
contract StakingManager is IStakingManager, OwnableUpgradeable, ReentrancyGuard {
    uint256 public constant MAX_FEE = 100_00; // 100%

    /// @notice The conversion ratio from TAO (in wei) to AlphaToken representation. 1 TAO = 10^9 Alpha.
    uint256 public constant RATIO_TAO_TO_ALPHA = 1e9;

    /// @notice The address of the Subtensor staking precompile contract. This is immutable.
    address public stakingPrecompile;

    /// @notice The address of the factory contract used to deploy new AlphaToken contracts.
    address public alphaTokenFactory;

    /// @notice The public key associated with this staking manager's coldkey on the Subtensor network.
    bytes32 public pubKey;

    /// @notice The fee for staking.
    uint256 public stakingFee;

    /// @notice The fee for unstaking.
    uint256 public unstakingFee;

    /// @notice The minimum transaction size for staking.
    uint256 public minTxSize;

    /// @notice Maps a network UID (netuid) and hotkey to its corresponding AlphaToken contract address.
    mapping(uint256 netuid => mapping(bytes32 hotkey => address alphaToken)) public alphaTokens;

    // --- Errors ---
    error AddStakeFailed();
    error RemoveStakeFailed();
    error TransferStakeFailed();
    error InsufficientAmountOut();
    error EtherTransferFailed();
    error InvalidAmount();
    error InsufficientTaoReceived(uint256 received, uint256 minExpected);
    error InvalidFee();
    error TxTooSmall();

    // --- Events ---
    event StakeAdded(uint256 indexed netuid, bytes32 indexed hotkey, uint256 alphaReceived, uint256 sharesToMint);
    event StakeRemoved(uint256 indexed netuid, bytes32 indexed hotkey, uint256 alphaToUnstake, uint256 amount);
    event Staked(
        address indexed user,
        uint256 indexed netuid,
        bytes32 hotkey,
        uint256 taoAmount,
        uint256 feeAmount,
        uint256 alphaAmount
    );
    event Unstaked(
        address indexed user,
        uint256 indexed netuid,
        bytes32 hotkey,
        uint256 alphaAmount,
        uint256 taoAmount,
        uint256 feeAmount
    );
    event PubKeySet(bytes32 newPubKey);
    event FeesSet(uint256 stakingFee, uint256 unstakingFee);
    event StakingPrecompileSet(address indexed newStakingPrecompile);
    event AlphaTokenFactorySet(address indexed newFactory);
    event AlphaTokenDeployed(uint256 indexed netuid, address indexed tokenAddress);
    event FeesClaimed(address indexed receiver, uint256 amount);
    event MinTxSizeSet(uint256 minTxSize);

    /**
     * @dev Allows the contract to receive Ether, primarily from the unstaking process.
     */
    receive() external payable {}

    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Sets up the StakingManager contract.
     * @param _stakingPrecompile The address of the staking precompile.
     * @param _alphaTokenFactory The initial address of the AlphaToken factory.
     */
    function initialize(address _stakingPrecompile, address _alphaTokenFactory) public initializer {
        require(_stakingPrecompile != address(0), "Staking precompile cannot be zero address");
        require(_alphaTokenFactory != address(0), "Factory cannot be zero address");

        __Ownable_init();
        stakingPrecompile = _stakingPrecompile;
        alphaTokenFactory = _alphaTokenFactory;
    }

    /**
     * @notice Claims accrued fees from the staking manager.
     * @dev Only callable by the contract owner. Emits a {FeesClaimed} event.
     * @param receiver The address to send the fees to.
     */
    function claimAccruedFees(address receiver) external onlyOwner {
        uint256 amount = address(this).balance;
        payable(receiver).transfer(amount);
        emit FeesClaimed(receiver, amount);
    }

    /**
     * @notice Sets the public key for staking operations.
     * @dev Only callable by the contract owner. Emits a {PubKeySet} event.
     * @param _pubKey The new public key to use.
     */
    function setPubKey(bytes32 _pubKey) external onlyOwner {
        pubKey = _pubKey;
        emit PubKeySet(_pubKey);
    }

    /**
     * @notice Sets the fees for staking and unstaking.
     * @dev Only callable by the contract owner. Emits a {FeesSet} event.
     * @param _stakingFee The new staking fee.
     * @param _unstakingFee The new unstaking fee.
     */
    function setFees(uint256 _stakingFee, uint256 _unstakingFee) external onlyOwner {
        if (stakingFee > MAX_FEE) revert InvalidFee();
        if (unstakingFee > MAX_FEE) revert InvalidFee();

        stakingFee = _stakingFee;
        unstakingFee = _unstakingFee;

        emit FeesSet(_stakingFee, _unstakingFee);
    }

    /**
     * @notice Updates the address of the AlphaToken factory.
     * @dev Only callable by the contract owner. Emits an {AlphaTokenFactorySet} event.
     * @param _alphaTokenFactory The new factory address.
     */
    function setAlphaTokenFactory(address _alphaTokenFactory) external onlyOwner {
        require(_alphaTokenFactory != address(0), "Factory cannot be zero address");
        alphaTokenFactory = _alphaTokenFactory;
        emit AlphaTokenFactorySet(_alphaTokenFactory);
    }

    /**
     * @notice Sets the address of the staking precompile.
     * @dev Only callable by the contract owner. Emits an {StakingPrecompileSet} event.
     * @param _stakingPrecompile The new staking precompile address.
     */
    function setStakingPrecompile(address _stakingPrecompile) external onlyOwner {
        require(_stakingPrecompile != address(0), "Staking precompile cannot be zero address");
        stakingPrecompile = _stakingPrecompile;
        emit StakingPrecompileSet(_stakingPrecompile);
    }

    /**
     * @notice Sets the minimum transaction size for staking.
     * @dev Only callable by the contract owner. Emits an {MinTxSizeSet} event.
     * @param _minTxSize The new minimum transaction size.
     */
    function setMinTxSize(uint256 _minTxSize) external onlyOwner {
        minTxSize = _minTxSize;
        emit MinTxSizeSet(_minTxSize);
    }

    /**
     * @notice Stakes TAO for a user and mints AlphaTokens in return.
     * @dev The amount of TAO to stake is determined by `msg.value`. The function will revert
     * if the amount sent is not a multiple of the ratio denominator.
     * @param hotkey The hotkey of the validator/miner to stake to.
     * @param netuid The network UID of the subnet.
     * @param receiver The address that will receive the minted AlphaTokens.
     * @param minAlphaToReceive The minimum amount of AlphaTokens the caller is willing to accept.
     */
    function stake(bytes32 hotkey, uint256 netuid, address receiver, uint256 minAlphaToReceive) external payable {
        uint256 feeAmount = Math.mulDiv(msg.value, stakingFee, MAX_FEE);
        uint256 taoAmount = msg.value - feeAmount;

        if (taoAmount < minTxSize) revert TxTooSmall();

        if (alphaTokens[netuid][hotkey] == address(0)) {
            _deployNewAlphaToken(netuid, hotkey);
        }

        uint256 alphaReceived = _addStake(hotkey, netuid, taoAmount);

        if (alphaReceived < minAlphaToReceive) {
            revert InsufficientAmountOut();
        }

        IAlphaToken(alphaTokens[netuid][hotkey]).mint(receiver, alphaReceived);
        emit Staked(msg.sender, netuid, hotkey, taoAmount, feeAmount, alphaReceived);
    }

    /**
     * @notice Burns a user's AlphaTokens and sends the corresponding TAO back to them.
     * @dev This function is protected against reentrancy attacks and includes a slippage guard.
     * @param hotkey The hotkey of the validator/miner to unstake from.
     * @param netuid The network UID of the subnet.
     * @param amount The amount of AlphaTokens to burn.
     * @param receiver The address that will receive the unstaked TAO.
     * @param minAmountTaoReceived The minimum amount of TAO expected by the user.
     */
    function unstake(bytes32 hotkey, uint256 netuid, uint256 amount, address receiver, uint256 minAmountTaoReceived)
        external
        nonReentrant
    {
        if (amount == 0) revert InvalidAmount();

        // Interaction: Call the precompile to remove stake
        uint256 taoReceived = _removeStake(hotkey, netuid, amount);
        uint256 feeAmount = Math.mulDiv(taoReceived, unstakingFee, MAX_FEE);
        taoReceived -= feeAmount;

        if (taoReceived < minTxSize) revert TxTooSmall();

        // Slippage protection
        if (taoReceived < minAmountTaoReceived) revert InsufficientTaoReceived(taoReceived, minAmountTaoReceived);

        // Effect: Burn the tokens first to prevent reentrancy abuse
        IAlphaToken(alphaTokens[netuid][hotkey]).burn(msg.sender, amount);

        // Interaction: Send TAO safely to the receiver
        (bool success,) = receiver.call{value: taoReceived}("");
        if (!success) revert EtherTransferFailed();

        emit Unstaked(msg.sender, netuid, hotkey, amount, taoReceived, feeAmount);
    }

    /**
     * @dev Deploys a new AlphaToken contract for a given subnet.
     * @param netuid The network UID to deploy a token for.
     * @return The address of the newly deployed token contract.
     */
    function _deployNewAlphaToken(uint256 netuid, bytes32 hotkey) internal returns (address) {
        string memory name = string(abi.encodePacked("SN-", Strings.toString(netuid)));
        address alphaToken = IAlphaTokenFactory(alphaTokenFactory).deployNewAlphaToken(name, name, netuid, hotkey);
        alphaTokens[netuid][hotkey] = alphaToken;

        emit AlphaTokenDeployed(netuid, alphaToken);
        return alphaToken;
    }

    /**
     * @dev Internal function to add stake to the precompile.
     * @return alphaAmount The amount of stake added, in AlphaToken denomination.
     */
    function _addStake(bytes32 hotkey, uint256 netuid, uint256 taoAmount) internal returns (uint256 alphaAmount) {
        IERC20 alphaToken = IERC20(alphaTokens[netuid][hotkey]);
        uint256 alphaBalanceBefore = _getStake(netuid, hotkey);
        uint256 totalSharesBefore = alphaToken.totalSupply();

        // The amount is sent via msg.value to this contract, then forwarded here.
        (bool success,) = stakingPrecompile.call(
            abi.encodeWithSelector(IStakingV2.addStake.selector, hotkey, taoAmount / RATIO_TAO_TO_ALPHA, netuid)
        );

        if (!success) {
            revert AddStakeFailed();
        }

        uint256 alphaBalanceAfter = _getStake(netuid, hotkey);
        uint256 alphaReceived = alphaBalanceAfter - alphaBalanceBefore;

        uint256 sharesToMint = Math.mulDiv(alphaReceived, totalSharesBefore + 1, alphaBalanceBefore + 1);

        emit StakeAdded(netuid, hotkey, alphaReceived, sharesToMint);
        return sharesToMint;
    }

    /**
     * @dev Internal function to remove stake from the precompile.
     * @return taoAmount The amount of TAO received from unstaking.
     */
    function _removeStake(bytes32 hotkey, uint256 netuid, uint256 amount) internal returns (uint256 taoAmount) {
        uint256 taoBalanceBefore = address(this).balance;
        IERC20 alphaToken = IERC20(alphaTokens[netuid][hotkey]);

        uint256 totalShares = alphaToken.totalSupply();
        uint256 totalAssets = _getStake(netuid, hotkey);

        uint256 alphaToUnstake = Math.mulDiv(amount, totalAssets + 1, totalShares + 1);

        (bool success,) = stakingPrecompile.call(
            abi.encodeWithSelector(IStakingV2.removeStake.selector, hotkey, alphaToUnstake, netuid)
        );

        if (!success) {
            revert RemoveStakeFailed();
        }

        uint256 taoBalanceAfter = address(this).balance;

        emit StakeRemoved(netuid, hotkey, alphaToUnstake, amount);
        return taoBalanceAfter - taoBalanceBefore;
    }

    /**
     * @dev Internal function to get the stake of a hotkey.
     * @param netuid The network UID of the subnet.
     * @param hotkey The hotkey of the validator/miner to get the stake of.
     * @return amount The amount of stake in TAO.
     */
    function _getStake(uint256 netuid, bytes32 hotkey) internal view returns (uint256 amount) {
        return IStakingV2(stakingPrecompile).getStake(hotkey, pubKey, netuid);
    }
}
