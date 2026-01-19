// SPDX-License-Identifier: AGPL-v3.0
pragma solidity ^0.8.21;

interface IUniswapV3Pool {
    function protocolFees() external view returns (uint128 token0, uint128 token1);
    function collectProtocol(
        address recipient,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external returns (uint128 amount0, uint128 amount1);
}

interface IUniswapV3Factory {
    function setOwner(address _owner) external;
}

contract UniV3PoolFeeClaimer {
    IUniswapV3Pool private constant POOL =
        IUniswapV3Pool(0x6647dcbeb030dc8E227D8B1A2Cb6A49F3C887E3c);
    IUniswapV3Factory private constant FACTORY =
        IUniswapV3Factory(0x20D0Cdf9004bf56BCa52A25C9288AAd0EbB97D59);
    
    address public receiver;
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _receiver) {
        owner = msg.sender;
        receiver = _receiver;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function claim() external {
        (uint128 fee0, uint128 fee1) = POOL.protocolFees();
        POOL.collectProtocol(receiver, fee0, fee1);
    }

    function setReceiver(address _receiver) external onlyOwner {
        receiver = _receiver;
    }

    function setFactoryOwner(address newOwner) external onlyOwner {
        FACTORY.setOwner(newOwner);
    }

    /**
     * @notice Transfer contract ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");

        address oldOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
