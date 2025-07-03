// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IStaking, ISUBTENSOR_STAKING_ADDRESS} from "./interfaces/IStaking.sol";
import {ISTAO} from "./interfaces/ISTAO.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TAOStaker} from "./TAOStaker.sol";

/**
 * @title Staked TAO (sTAO)
 * @author kitanovicd (TaoFi)
 * @notice This contract handles the liquid staking token sTAO. It allows users to deposit TAO
 * and receive sTAO, which represents their share of the total staked TAO pool. Users can
 * later withdraw their TAO by burning sTAO.
 * @dev This is an upgradeable contract using OpenZeppelin's proxy pattern. It inherits staking
 * logic from TAOStaker.
 */
contract STAO is ERC20Upgradeable, OwnableUpgradeable, ISTAO, TAOStaker {
    using Math for uint256;

    /// @notice The public key of the contract used for staking. (Deprecated in V2)
    bytes32 public pubKey;
    /// @notice The address of the staking precompile contract. (Deprecated in V2)
    address public stakingPrecompile;
    /// @notice The fee taken from each deposit, denominated in TAO (wei).
    uint256 public networkFee;

    /**
     * @notice Initializes the contract for the first time.
     * @dev Sets up the ERC20 token details, ownership, and the initial TAOStaker state.
     * This function can only be called once.
     */
    function initialize() public initializer {
        __ERC20_init("Staked TAO", "sTAO");
        __Ownable_init();
        __TAOStaker_init(bytes32(0), address(0));
    }

    /**
     * @notice Initializes the V2 version of the contract.
     * @dev This reinitializer sets the pubKey and stakingPrecompile for the TAOStaker logic.
     * It's intended to be called during an upgrade to V2.
     * @param _pubKey The public key to be used for staking operations.
     * @param _stakingPrecompile The address of the external staking precompile contract.
     */
    function initializeV2(bytes32 _pubKey, address _stakingPrecompile) public reinitializer(2) {
        __TAOStaker_init(_pubKey, _stakingPrecompile);
    }

    /// @inheritdoc ISTAO
    function setNetworkFee(uint256 _networkFee) public onlyOwner {
        networkFee = _networkFee;
        emit NetworkFeeSet(_networkFee);
    }

    /**
     * @notice Deposits TAO into the contract and mints sTAO shares for the receiver.
     * @dev The function takes a network fee from the sent value, stakes the remainder,
     * calculates the corresponding sTAO shares, and mints them.
     * @param receiver The address that will receive the minted sTAO.
     * @param minSTAO The minimum amount of sTAO to be minted to protect against slippage.
     */
    function deposit(address receiver, uint256 minSTAO) public payable {
        require(msg.value >= networkFee, "Amount too low");

        uint256 amount = msg.value - networkFee;
        _stakeOnFirstHotKey(amount);

        uint256 sTAOAmount = convertToShares(amount, amount);
        require(sTAOAmount >= minSTAO, "Slippage too big");

        _mint(receiver, sTAOAmount);
        emit Deposit(msg.sender, receiver, amount, sTAOAmount);
    }

    /**
     * @notice Burns a specified amount of sTAO and transfers the corresponding amount of TAO to a receiver.
     * @dev If the contract's liquid TAO balance is insufficient, it will attempt to unstake
     * the required difference from the staking precompile.
     * @param amount The amount of sTAO to burn.
     * @param receiver The address to receive the TAO.
     * @param minTAO The minimum amount of TAO to be received to protect against slippage.
     */
    function withdraw(uint256 amount, address receiver, uint256 minTAO) external {
        require(balanceOf(msg.sender) >= amount, "Insufficient sTAO balance");

        uint256 taoAmount = convertToAssets(amount);
        require(taoAmount >= minTAO, "Slippage too big");

        uint256 taoAmountAvailable = address(this).balance;
        if (taoAmountAvailable < taoAmount) {
            _unstake(taoAmount - taoAmountAvailable);
        }

        require(address(this).balance >= taoAmount, "Insufficient TAO balance after unstaking");

        _burn(msg.sender, amount);
        payable(receiver).transfer(taoAmount);

        emit Withdrawal(msg.sender, receiver, taoAmount, amount);
    }

    /// @inheritdoc ISTAO
    function convertToShares(uint256 amount, uint256 totalStakedToDecrease) public view returns (uint256) {
        uint256 totalStaked = totalStakedTAO() - totalStakedToDecrease;
        // The +1 and +10**_decimalsOffset() are to prevent division by zero and ensure
        // a baseline share price when the pool is empty.
        return amount.mulDiv(totalSupply() + 10 ** _decimalsOffset(), totalStaked + 1, Math.Rounding.Down);
    }

    /// @inheritdoc ISTAO
    function convertToAssets(uint256 amount) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return amount;
        }
        // The +1 and +10**_decimalsOffset() are to prevent division by zero and ensure
        // a baseline share price when the pool is empty.
        return amount.mulDiv(totalStakedTAO() + 1, supply + 10 ** _decimalsOffset(), Math.Rounding.Down);
    }

    /**
     * @dev Returns a decimal offset for share calculations. Currently 0.
     * This could be used in the future to handle tokens with different decimals.
     */
    function _decimalsOffset() private pure returns (uint256) {
        return 0;
    }
}
