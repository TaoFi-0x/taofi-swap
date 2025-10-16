// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC20} from "oz5/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
