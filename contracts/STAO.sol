// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IStaking, ISUBTENSOR_STAKING_ADDRESS} from "./interfaces/IStaking.sol";
import {ISTAO} from "./interfaces/ISTAO.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TAOStaker} from "./TAOStaker.sol";

contract STAO is ERC20Upgradeable, OwnableUpgradeable, ISTAO, TAOStaker {
    using Math for uint256;

    bytes32 public pubKey; // Not used after updated
    address public stakingPrecompile; // Not used after upgrade
    uint256 public networkFee;

    function initialize() public initializer {
        __ERC20_init("Staked TAO", "sTAO");
        __Ownable_init();
        __TAOStaker_init(bytes32(0), address(0));
    }

    function initializeV2(bytes32 _pubKey, address _stakingPrecompile) public reinitializer(2) {
        __TAOStaker_init(_pubKey, _stakingPrecompile);
    }

    /// @inheritdoc ISTAO
    function setNetworkFee(uint256 _networkFee) public onlyOwner {
        networkFee = _networkFee;
        emit NetworkFeeSet(_networkFee);
    }

    /// @inheritdoc ISTAO
    function deposit(address receiver, uint256 minSTAO) public payable {
        require(msg.value >= networkFee, "Amount too low");

        uint256 amount = msg.value - networkFee;
        _stakeOnFirstHotKey(amount);

        uint256 sTAOAmount = convertToShares(amount, amount);
        require(sTAOAmount >= minSTAO, "Slippage too big");

        _mint(receiver, sTAOAmount);
        emit Deposit(msg.sender, receiver, amount, sTAOAmount);
    }

    /// @inheritdoc ISTAO
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
        return amount.mulDiv(totalSupply() + 10 ** _decimalsOffset(), totalStaked + 1, Math.Rounding.Down);
    }

    /// @inheritdoc ISTAO
    function convertToAssets(uint256 amount) public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return amount;
        }
        return amount.mulDiv(totalStakedTAO() + 1, supply + 10 ** _decimalsOffset(), Math.Rounding.Down);
    }

    function _decimalsOffset() private pure returns (uint256) {
        return 0;
    }
}
