// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {ISTAO} from "../interfaces/ISTAO.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title STaoTaoUSDOracle
/// @author Syeam (Sturdy) https://github.com/shr1ftyy
/// @notice  An oracle for STAO/Taousd

contract STaoTaoUSDOracle {
    address public STAO;
    address public TAO_USD_API3;
    uint8 public constant DECIMALS = 18;

    uint256 public immutable MAX_ORACLE_DELAY;
    uint256 public immutable PRICE_MIN;

    string public name;

    error CHAINLINK_BAD_PRICE();

    constructor(address _oracle, address _sTAO, uint256 _maxOracleDelay, uint256 _priceMin, string memory _name) {
        name = _name;
        STAO = _sTAO;
        TAO_USD_API3 = _oracle;
        MAX_ORACLE_DELAY = _maxOracleDelay;
        PRICE_MIN = _priceMin;
    }

    /// @notice The ```getPrices``` function is intended to return price of ERC4626 token based on the base asset
    /// @return _isBadData is always false, just sync to other oracle interfaces
    /// @return _priceLow is the lower of the prices
    /// @return _priceHigh is the higher of the prices
    function getPrices() external view returns (bool _isBadData, uint256 _priceLow, uint256 _priceHigh) {
        (, int256 _answer,, uint256 _updatedAt,) = AggregatorV3Interface(TAO_USD_API3).latestRoundData(); // TAO/USD

        // TODO: consider STao
        uint256 rate = ISTAO(STAO).convertToAssets(1e18) * 1e30 / uint256(_answer); // NOTE: this returns how much sTAO is needed to obtain 1e18 taoUSD

        // If data is stale or negative, set bad data to true and return
        if (_answer <= 0 || (block.timestamp - _updatedAt > MAX_ORACLE_DELAY)) {
            revert CHAINLINK_BAD_PRICE();
        }

        _priceHigh = rate > PRICE_MIN ? rate : PRICE_MIN;
        _priceLow = _priceHigh;
    }
}
