// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {XERC20} from "./XERC20.sol";

/// @title Taousd
/// @author Syeam Bin Abdullah (Sturdy) https://github.com/shr1fyy
/// @notice taousd stablecoin contract
contract Taousd is XERC20 {
    constructor(string memory name_, string memory symbol_) XERC20(name_, symbol_, msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
