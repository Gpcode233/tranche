// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICLSwapRouter} from "../interfaces/External.sol";

// Local development and tests only. Never deployed to mainnet.

contract MockToken is ERC20 {
    uint8 private immutable _d;
    mapping(address => bool) public blocked;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _d = d;
    }

    function decimals() public view override returns (uint8) {
        return _d;
    }

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function _update(address f, address t, uint256 v) internal override {
        require(!blocked[f] && !blocked[t], "policy");
        super._update(f, t, v);
    }
}

contract MockFeed {
    uint8 public immutable decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint256 public startedAt;

    constructor(uint8 d, int256 a, uint256 started) {
        decimals = d;
        answer = a;
        updatedAt = block.timestamp;
        startedAt = started;
    }

    function set(int256 a, uint256 at) external {
        answer = a;
        updatedAt = at;
    }

    function setStarted(uint256 at) external {
        startedAt = at;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, startedAt, updatedAt, 1);
    }
}

contract MockPool {
    address public immutable token0;
    address public immutable token1;
    address public factory;
    int24 public constant tickSpacing = 10;
    int24 public spot;
    int24 public avg;
    bool public noHistory;

    constructor(address a, address b, address f) {
        (token0, token1) = a < b ? (a, b) : (b, a);
        factory = f;
    }

    function set(int24 s, int24 a) external {
        spot = s;
        avg = a;
    }

    function setNoHistory(bool v) external {
        noHistory = v;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, bool) {
        return (0, spot, 0, 100, 100, true);
    }

    function observe(uint32[] calldata ago) external view returns (int56[] memory c, uint160[] memory l) {
        require(!noHistory, "OLD");
        c = new int56[](2);
        l = new uint160[](2);
        c[1] = int56(avg) * int56(uint56(ago[0] - ago[1]));
    }
}

/// @dev Fills at the feed price minus a configurable cost, minting the output.
contract MockRouter is ICLSwapRouter {
    address public factory;
    address public immutable usdc;
    uint256 public costBps = 10;
    mapping(address => address) public feedOf;

    constructor(address f, address u) {
        factory = f;
        usdc = u;
    }

    function setFeed(address t, address f) external {
        feedOf[t] = f;
    }

    function setCost(uint256 c) external {
        costBps = c;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 out) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        bool buy = p.tokenIn == usdc;
        uint256 price = uint256(MockFeed(feedOf[buy ? p.tokenOut : p.tokenIn]).answer());
        uint256 unit = 10 ** (uint256(ERC20(buy ? p.tokenOut : p.tokenIn).decimals()) + 2);
        out = buy ? p.amountIn * unit / price : p.amountIn * price / unit;
        out = out * (10_000 - costBps) / 10_000;
        require(out >= p.amountOutMinimum, "Too little received");
        MockToken(p.tokenOut).mint(p.recipient, out);
    }
}
