// SPDX-License-Identifier: ISC
pragma solidity ^0.8.21;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import {ISTAO} from "../interfaces/ISTAO.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title STaoTaoUSDOracle
/// @author Syeam (Sturdy) https://github.com/shr1ftyy
/// @notice  An oracle for STAO/Taousd

contract STaoTaoUSDOracle {
    address public STAO;
    address public TAO_USD_PYTH;
    bytes32 public PRICE_FEED_ID;
    uint8 public constant DECIMALS = 18;

    uint256 public immutable MAX_ORACLE_DELAY;
    uint256 public immutable PRICE_MIN;

    string public name;

    constructor(address _oracle, bytes32 price_feed_id, address _sTAO, uint256 _maxOracleDelay, uint256 _priceMin, string memory _name) {
        name = _name;
        STAO = _sTAO;
        TAO_USD_PYTH = _oracle;
        PRICE_FEED_ID = price_feed_id;
        MAX_ORACLE_DELAY = _maxOracleDelay;
        PRICE_MIN = _priceMin;
    }

    /// @notice The ```getPrices``` function is intended to return price of ERC4626 token based on the base asset
    /// @return _isBadData is always false, just sync to other oracle interfaces
    /// @return _priceLow is the lower of the prices
    /// @return _priceHigh is the higher of the prices
    function getPrices() public view returns (bool _isBadData, uint256 _priceLow, uint256 _priceHigh) {
        PythStructs.Price memory priceStruct = IPyth(TAO_USD_PYTH).getPriceNoOlderThan(PRICE_FEED_ID, MAX_ORACLE_DELAY); // TAO/USD price 

        uint256 multiple = 10 ** uint256(int256(-1 * priceStruct.expo));

        // number of shares that is equal to 1e18 TAO
        uint256 numShares = ISTAO(STAO).convertToShares(1e18, 0);
        uint256 rate = numShares * 1e12 * multiple / uint256(int256(priceStruct.price)); // NOTE: this returns how much sTAO is needed to obtain 1e18 taoUSD

        _priceHigh = rate > PRICE_MIN ? rate : PRICE_MIN;
        _priceLow = _priceHigh;
    }
}
