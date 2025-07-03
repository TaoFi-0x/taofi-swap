// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC20PermitUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";

contract AlphaToken is OwnableUpgradeable, ERC20Upgradeable, ERC20PermitUpgradeable {
    function initialize(string memory name, string memory symbol) external initializer {
        __Ownable_init();
        __ERC20_init(name, symbol);
        __ERC20Permit_init(name);
    }

    function decimals() public pure override returns (uint8) {
        return 9;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
