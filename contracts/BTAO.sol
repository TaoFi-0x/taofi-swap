// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IXERC20} from "./interfaces/IXERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IBridge} from "./interfaces/IBridge.sol";
import {ISTAO} from "./interfaces/ISTAO.sol";
import {IBTAO} from "./interfaces/IBTAO.sol";

contract BTAO is IBTAO, ERC20Upgradeable, OwnableUpgradeable {
    uint256 public networkFee;
    uint256 public bridgeFee;
    address public bridge;
    address public sTAO;

    function initialize(uint256 _networkFee, uint256 _bridgeFee, address _sTAO) public initializer {
        __ERC20_init("Bridged TAO", "bTAO");
        __Ownable_init();

        networkFee = _networkFee;
        bridgeFee = _bridgeFee;
        sTAO = _sTAO;

        emit NetworkFeeSet(_networkFee);
        emit BridgeFeeSet(_bridgeFee);
        emit BridgeSet(_sTAO);
    }

    /// @inheritdoc IBTAO
    function setNetworkFee(uint256 _networkFee) external onlyOwner {
        networkFee = _networkFee;
        emit NetworkFeeSet(_networkFee);
    }

    /// @inheritdoc IBTAO
    function setBridgeFee(uint256 _bridgeFee) external onlyOwner {
        bridgeFee = _bridgeFee;
        emit BridgeFeeSet(_bridgeFee);
    }

    /// @inheritdoc IBTAO
    function setBridge(address _bridge) external onlyOwner {
        bridge = _bridge;
        emit BridgeSet(_bridge);
    }

    /// @inheritdoc IBTAO
    function stake(uint256 _amount, uint256 minSTAO) external payable onlyOwner {
        ISTAO(sTAO).deposit{value: _amount}(address(this), minSTAO);
    }

    /// @inheritdoc IBTAO
    function unstake(uint256 _amount, uint256 minTAO) external onlyOwner {
        ISTAO(sTAO).withdraw(_amount, address(this), minTAO);
    }

    /// @inheritdoc IBTAO
    function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount, uint256 _minSTAO)
        external
        payable
        returns (bytes32 messageId)
    {
        uint256 amount = _amount - networkFee - bridgeFee;
        ISTAO(sTAO).deposit{value: amount}(address(this), _minSTAO);

        _mint(address(this), amount);
        IERC20(address(this)).approve(bridge, amount);

        return IBridge(bridge).transferRemote{value: bridgeFee}(_destination, _recipient, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        // If caller is not bridge just transfer this token properly
        if (from != bridge) {
            super._transfer(from, to, amount);
        } else {
            // If caller is bridge, we need to burn the tokens
            _burn(from, amount);

            uint256 amountToUnstake = ISTAO(sTAO).convertToShares(amount, 0);
            ISTAO(sTAO).withdraw(amountToUnstake, address(this), amount);

            // Send native tokens to receiver
            payable(to).transfer(amount);
        }
    }
}
