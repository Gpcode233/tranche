// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Chainlink V3 aggregator surface used by Coinbase tokenized-equity feeds.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @dev Aerodrome Slipstream concentrated-liquidity pool (read side only).
interface ICLPool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function factory() external view returns (address);
    function tickSpacing() external view returns (int24);
    function slot0()
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint16 obsIndex, uint16 obsCardinality, uint16 obsCardinalityNext, bool unlocked);
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidity);
}

/// @dev Aerodrome Slipstream router. Note `tickSpacing` where Uniswap V3 has `fee`.
interface ICLSwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        int24 tickSpacing;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function factory() external view returns (address);
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}
