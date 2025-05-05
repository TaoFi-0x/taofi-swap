// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUniswapRouter {
    uint256 public expectedLiquidity;

    function setExpectedLiquidity(uint256 _expectedLiquidity) external {
        expectedLiquidity = _expectedLiquidity;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        require(amountADesired >= amountAMin, "Insufficient A amount");
        require(amountBDesired >= amountBMin, "Insufficient B amount");
        require(deadline >= block.timestamp, "Expired");

        // Transfer tokens from sender to this contract
        IERC20(tokenA).transferFrom(msg.sender, address(this), amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, address(this), amountBDesired);

        return (amountADesired, amountBDesired, expectedLiquidity);
    }
}
