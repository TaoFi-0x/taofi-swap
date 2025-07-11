// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {IStakingV2} from "./interfaces/IStakingV2.sol";
import {IStakingManager} from "./interfaces/IStakingManager.sol";
import {IAlphaToken} from "./interfaces/IAlphaToken.sol";
import {IAlphaTokenFactory} from "./interfaces/IAlphaTokenFactory.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

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
    /// @notice The conversion ratio from TAO (in wei) to AlphaToken representation. 1 TAO = 10^9 Alpha.
    uint256 public constant RATIO_TAO_TO_ALPHA = 1e9;

    /// @notice The address of the Subtensor staking precompile contract. This is immutable.
    address public stakingPrecompile;

    /// @notice The address of the factory contract used to deploy new AlphaToken contracts.
    address public alphaTokenFactory;

    /// @notice The public key associated with this staking manager's coldkey on the Subtensor network.
    bytes32 public pubKey;

    /// @notice Maps a network UID (netuid) to its corresponding AlphaToken contract address.
    mapping(uint256 netuid => address alphaToken) public alphaTokens;

    // --- Errors ---
    error AddStakeFailed();
    error RemoveStakeFailed();
    error TransferStakeFailed();
    error InsufficientAmountOut();
    error EtherTransferFailed();
    error InvalidAmount();
    error InsufficientTaoReceived(uint256 received, uint256 minExpected);

    // --- Events ---
    event Staked(address indexed user, uint256 indexed netuid, bytes32 hotkey, uint256 taoAmount, uint256 alphaAmount);
    event Unstaked(
        address indexed user, uint256 indexed netuid, bytes32 hotkey, uint256 alphaAmount, uint256 taoAmount
    );
    event PubKeySet(bytes32 newPubKey);
    event StakingPrecompileSet(address indexed newStakingPrecompile);
    event AlphaTokenFactorySet(address indexed newFactory);
    event AlphaTokenDeployed(uint256 indexed netuid, address indexed tokenAddress);

    /**
     * @dev Allows the contract to receive Ether, primarily from the unstaking process.
     */
    receive() external payable {}

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
     * @notice Sets the public key for staking operations.
     * @dev Only callable by the contract owner. Emits a {PubKeySet} event.
     * @param _pubKey The new public key to use.
     */
    function setPubKey(bytes32 _pubKey) external onlyOwner {
        pubKey = _pubKey;
        emit PubKeySet(_pubKey);
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
     * @notice Stakes TAO for a user and mints AlphaTokens in return.
     * @dev The amount of TAO to stake is determined by `msg.value`. The function will revert
     * if the amount sent is not a multiple of the ratio denominator.
     * @param hotkey The hotkey of the validator/miner to stake to.
     * @param netuid The network UID of the subnet.
     * @param receiver The address that will receive the minted AlphaTokens.
     * @param minAlphaToReceive The minimum amount of AlphaTokens the caller is willing to accept.
     */
    function stake(bytes32 hotkey, uint256 netuid, address receiver, uint256 minAlphaToReceive) external payable {
        uint256 taoAmount = msg.value;
        if (taoAmount == 0) revert InvalidAmount();

        if (alphaTokens[netuid] == address(0)) {
            _deployNewAlphaToken(netuid);
        }

        uint256 alphaReceived = _addStake(hotkey, netuid, taoAmount);

        if (alphaReceived < minAlphaToReceive) {
            revert InsufficientAmountOut();
        }

        IAlphaToken(alphaTokens[netuid]).mint(receiver, alphaReceived);
        emit Staked(msg.sender, netuid, hotkey, taoAmount, alphaReceived);
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
    function unstake(
        bytes32 hotkey,
        uint256 netuid,
        uint256 amount,
        address receiver,
        uint256 minAmountTaoReceived
    ) external nonReentrant {
        if (amount == 0) revert InvalidAmount();

        // Effect: Burn the tokens first to prevent reentrancy abuse
        IAlphaToken(alphaTokens[netuid]).burn(msg.sender, amount);

        // Interaction: Call the precompile to remove stake
        uint256 taoReceived = _removeStake(hotkey, netuid, amount);

        // Slippage protection
        if (taoReceived < minAmountTaoReceived) revert InsufficientTaoReceived(taoReceived, minAmountTaoReceived);

        // Interaction: Send TAO safely to the receiver
        (bool success,) = receiver.call{value: taoReceived}("");
        if (!success) revert EtherTransferFailed();

        emit Unstaked(msg.sender, netuid, hotkey, amount, taoReceived);
    }

    /**
     * @dev Deploys a new AlphaToken contract for a given subnet.
     * @param netuid The network UID to deploy a token for.
     * @return The address of the newly deployed token contract.
     */
    function _deployNewAlphaToken(uint256 netuid) internal returns (address) {
        string memory name = string(abi.encodePacked("Subtensor Alpha - ", Strings.toString(netuid)));
        string memory symbol = string(abi.encodePacked("ALPHA-", Strings.toString(netuid)));

        address alphaToken = IAlphaTokenFactory(alphaTokenFactory).deployNewAlphaToken(name, symbol, netuid);
        alphaTokens[netuid] = alphaToken;

        emit AlphaTokenDeployed(netuid, alphaToken);
        return alphaToken;
    }

    /**
     * @dev Internal function to add stake to the precompile.
     * @return alphaAmount The amount of stake added, in AlphaToken denomination.
     */
    function _addStake(bytes32 hotkey, uint256 netuid, uint256 taoAmount) internal returns (uint256 alphaAmount) {
        uint256 alphaBalanceBefore = IStakingV2(stakingPrecompile).getStake(hotkey, pubKey, netuid);

        // The amount is sent via msg.value to this contract, then forwarded here.
        (bool success,) = stakingPrecompile.call{value: taoAmount}(
            abi.encodeWithSelector(IStakingV2.addStake.selector, hotkey, taoAmount, netuid)
        );

        if (!success) {
            revert AddStakeFailed();
        }

        uint256 alphaBalanceAfter = IStakingV2(stakingPrecompile).getStake(hotkey, pubKey, netuid);
        return alphaBalanceAfter - alphaBalanceBefore;
    }

    /**
     * @dev Internal function to remove stake from the precompile.
     * @return taoAmount The amount of TAO received from unstaking.
     */
    function _removeStake(bytes32 hotkey, uint256 netuid, uint256 amount) internal returns (uint256 taoAmount) {
        uint256 taoBalanceBefore = address(this).balance;

        (bool success,) =
            stakingPrecompile.call(abi.encodeWithSelector(IStakingV2.removeStake.selector, hotkey, amount, netuid));

        if (!success) {
            revert RemoveStakeFailed();
        }

        uint256 taoBalanceAfter = address(this).balance;
        return taoBalanceAfter - taoBalanceBefore;
    }

    /**
     * @dev Internal function to transfer stake between hotkeys.
     */
    function _transferStake(bytes32 destinationColdkey, bytes32 hotkey, uint256 netuid, uint256 amount) internal {
        (bool success,) = stakingPrecompile.call(
            abi.encodeWithSelector(
                IStakingV2.transferStake.selector, destinationColdkey, hotkey, netuid, netuid, amount
            )
        );

        if (!success) {
            revert TransferStakeFailed();
        }
    }
}
