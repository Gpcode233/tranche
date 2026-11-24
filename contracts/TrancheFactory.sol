// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {TrancheVault} from "./TrancheVault.sol";
import {IAggregatorV3, ICLPool, ICLSwapRouter} from "./interfaces/External.sol";

/// @notice Lists supported stocks and deploys vaults. The owner can only change what *new*
/// vaults may hold; each vault copies its configuration at creation and has no admin.
contract TrancheFactory is Ownable2Step {
    struct Listing {
        address feed;
        address pool;
        address router;
        int24 tickSpacing;
        bool enabled;
    }

    IERC20 public immutable usdc;
    address public immutable sequencerFeed;
    mapping(address token => Listing) public listings;
    address[] public vaults;
    mapping(address => bool) public isVault;

    event Listed(address indexed token, address feed, address pool, address router, bool enabled);
    event TrancheCreated(address indexed vault, address indexed creator, string name, string symbol);

    error NotListed(address token);
    error BadListing();
    error BadInput();

    constructor(IERC20 usdc_, address sequencerFeed_, address owner_) Ownable(owner_) {
        usdc = usdc_;
        sequencerFeed = sequencerFeed_;
    }

    function list(address token, address feed, address pool, address router) external onlyOwner {
        (address t0, address t1) = token < address(usdc) ? (token, address(usdc)) : (address(usdc), token);
        ICLPool p = ICLPool(pool);
        if (
            p.token0() != t0 || p.token1() != t1 || ICLSwapRouter(router).factory() != p.factory()
                || IAggregatorV3(feed).decimals() != 8
        ) revert BadListing();
        listings[token] = Listing(feed, pool, router, p.tickSpacing(), true);
        emit Listed(token, feed, pool, router, true);
    }

    function delist(address token) external onlyOwner {
        Listing storage l = listings[token];
        l.enabled = false;
        emit Listed(token, l.feed, l.pool, l.router, false);
    }

    function create(
        string calldata name,
        string calldata symbol,
        address[] calldata tokens,
        uint16[] calldata weightsBps,
        uint256 driftBps,
        uint256 creatorFeeBps
    ) external returns (address vault) {
        if (
            tokens.length != weightsBps.length || bytes(name).length == 0 || bytes(name).length > 48
                || bytes(symbol).length == 0 || bytes(symbol).length > 12
        ) revert BadInput();
        TrancheVault.AssetConfig[] memory a = new TrancheVault.AssetConfig[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) {
            Listing memory l = listings[tokens[i]];
            if (!l.enabled) revert NotListed(tokens[i]);
            a[i] = TrancheVault.AssetConfig(tokens[i], l.feed, l.pool, l.router, l.tickSpacing, weightsBps[i]);
        }
        vault = address(
            new TrancheVault(usdc, msg.sender, name, symbol, a, driftBps, creatorFeeBps, sequencerFeed)
        );
        vaults.push(vault);
        isVault[vault] = true;
        emit TrancheCreated(vault, msg.sender, name, symbol);
    }

    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }

    /// @notice Newest first.
    function latest(uint256 offset, uint256 limit) external view returns (address[] memory out) {
        uint256 n = vaults.length;
        if (offset >= n) return out;
        uint256 k = n - offset < limit ? n - offset : limit;
        out = new address[](k);
        for (uint256 i; i < k; ++i) {
            out[i] = vaults[n - 1 - offset - i];
        }
    }
}
