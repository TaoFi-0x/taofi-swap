// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockTaousd is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;
    bytes32 public DOMAIN_SEPARATOR;
    address public FACTORY;
    uint256 public _DURATION;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        DOMAIN_SEPARATOR = keccak256(abi.encode(name_));
        FACTORY = msg.sender;
        _DURATION = 1 days;
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
