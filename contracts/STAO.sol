// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IStaking, ISUBTENSOR_STAKING_ADDRESS} from "./interfaces/IStaking.sol";
import {ISTAO} from "./interfaces/ISTAO.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract STAO is ERC20Upgradeable, OwnableUpgradeable, ISTAO {
    using Math for uint256;

    bytes32 public pubKey;
    address public stakingPrecompile;
    uint256 public networkFee;

    function initialize() public initializer {
        __ERC20_init("Staked TAO", "sTAO");
        __Ownable_init();
    }

    /// @inheritdoc ISTAO
    function setNetworkFee(uint256 _networkFee) public onlyOwner {
        networkFee = _networkFee;
        emit NetworkFeeSet(_networkFee);
    }

    /// @inheritdoc ISTAO
    function setPubKey(bytes32 _pubKey) public onlyOwner {
        pubKey = _pubKey;
        emit PubKeySet(_pubKey);
    }

    /// @inheritdoc ISTAO
    function setStakingPrecompile(address _stakingPrecompile) public onlyOwner {
        stakingPrecompile = _stakingPrecompile;
        emit StakingPrecompileSet(_stakingPrecompile);
    }

    // TODO: WIP
    /// @inheritdoc ISTAO
    function rebalance(bytes32[] calldata hotkeys, uint256[] calldata amounts) public onlyOwner {
        // increase/decrease the stakes according to the hotkeys and amounts
        // make it so that the final stake in the hotkeys is the amount specified
        for (uint256 i = 0; i < hotkeys.length; i++) {
            // TODO: this points to root for now
            uint256 currentStake = IStaking(stakingPrecompile).getStake(hotkeys[i], pubKey, 0);
            if (currentStake < amounts[i]) {
                increaseStake(hotkeys[i], amounts[i] - currentStake);
            } else if (currentStake > amounts[i]) {
                decreaseStake(hotkeys[i], currentStake - amounts[i]);
            }
        }

        emit Rebalanced(hotkeys, amounts);
    }

    // TODO: add onlyStaker modifier?
    /// @inheritdoc ISTAO
    function increaseStake(bytes32 hotkey, uint256 amount) public payable onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance for staking");
        require(hotkey != bytes32(0), "Invalid hotkey");

        (bool sent,) = payable(stakingPrecompile).call{value: amount}(
            abi.encodeWithSignature("addStake(bytes32,uint256)", hotkey, 0)
        );
        require(sent, "Failed to send TAO");
        emit StakeIncreased(hotkey, amount);
    }

    /// @inheritdoc ISTAO
    function decreaseStake(bytes32 hotkey, uint256 amount) public onlyOwner {
        // call removeStake by using encodeWithSignature
        (bool success,) =
            stakingPrecompile.call(abi.encodeWithSignature("removeStake(bytes32,uint256,uint256)", hotkey, amount, 0));
        require(success, "Failed to remove stake");
        emit StakeDecreased(hotkey, amount);
    }

    /// @inheritdoc ISTAO
    function deposit(address receiver, uint256 minSTAO) public payable {
        require(msg.value >= networkFee, "Amount too low");

        uint256 amount = msg.value - networkFee;
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

    /// @inheritdoc ISTAO
    function totalStakedTAO() public view returns (uint256) {
        return IStaking(stakingPrecompile).getTotalColdkeyStake(pubKey) + address(this).balance;
    }

    function _decimalsOffset() private pure returns (uint256) {
        return 0;
    }
}
