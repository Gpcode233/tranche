// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MarketGuard} from "./MarketGuard.sol";
import {ICLSwapRouter} from "./interfaces/External.sol";

/// @title Tranche
/// @notice A fixed-weight stock index with no owner. Weights, drift threshold, fee and venues
/// are set at creation and cannot change. Anyone may call `rebalance` once the rule is met.
/// @dev ERC-4626 over USDC. Every preview is a worst case: it assumes swaps fill exactly at the
/// slippage limit, so real execution is never worse than the preview.
contract TrancheVault is ERC4626, MarketGuard, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    struct AssetConfig {
        address token;
        address feed;
        address pool;
        address router;
        int24 tickSpacing;
        uint16 weightBps;
    }

    struct Holding {
        address token;
        uint256 balance;
        uint256 value;
        uint256 price;
        uint256 targetBps;
        uint256 currentBps;
        Status status;
    }

    uint256 internal constant BPS = 10_000;
    uint256 public constant MAX_CREATOR_FEE_BPS = 100;
    uint256 public constant REBALANCE_COOLDOWN = 1 hours;
    /// @dev Worst accepted fill against the Chainlink reference, pool fee included.
    uint256 public constant MAX_SLIPPAGE_BPS = 100;
    uint256 public constant MIN_DEPOSIT = 1e6;
    /// @dev Bit in `redeemInKind`'s skipMask that skips the USDC leg.
    uint256 public constant SKIP_USDC = 1 << 255;

    address public immutable creator;
    uint256 public immutable driftBps;
    uint256 public immutable creatorFeeBps;
    uint256 public lastRebalance;

    AssetConfig[] private _assets;
    mapping(uint256 => Market) private _markets;

    event Rebalanced(address indexed caller, uint256 maxDriftBps, uint256 navBefore, uint256 navAfter);
    event Trade(address indexed token, bool buy, uint256 amountIn, uint256 amountOut);
    event CreatorFee(address indexed creator, address indexed depositor, uint256 amount);
    event RedeemInKind(address indexed owner, address indexed receiver, uint256 shares, uint256 skipMask);

    error GuardTripped(Status status);
    error WithinDrift(uint256 driftBps, uint256 thresholdBps);
    error CoolingDown(uint256 readyAt);
    error BadConfig();
    error TooSmall();
    error ValueLost();
    error Expired();

    constructor(
        IERC20 usdc,
        address creator_,
        string memory name_,
        string memory symbol_,
        AssetConfig[] memory assets_,
        uint256 driftBps_,
        uint256 creatorFeeBps_,
        address sequencerFeed_
    ) ERC20(name_, symbol_) ERC4626(usdc) MarketGuard(sequencerFeed_) {
        if (
            assets_.length < 2 || assets_.length > 8 || driftBps_ < 100 || driftBps_ > 2_500
                || creatorFeeBps_ > MAX_CREATOR_FEE_BPS || creator_ == address(0)
        ) revert BadConfig();
        uint256 sum;
        for (uint256 i; i < assets_.length; ++i) {
            AssetConfig memory a = assets_[i];
            if (a.weightBps < 100) revert BadConfig();
            for (uint256 j; j < i; ++j) {
                if (assets_[j].token == a.token) revert BadConfig();
            }
            sum += a.weightBps;
            _assets.push(a);
            _markets[i] = Market({
                feed: a.feed,
                pool: a.pool,
                tokenDecimals: IERC20Metadata(a.token).decimals(),
                tokenIsToken0: a.token < address(usdc)
            });
        }
        if (sum != BPS) revert BadConfig();
        creator = creator_;
        driftBps = driftBps_;
        creatorFeeBps = creatorFeeBps_;
    }

    // ---------------------------------------------------------------- views

    function assetCount() external view returns (uint256) {
        return _assets.length;
    }

    function assetConfig(uint256 i) external view returns (AssetConfig memory) {
        return _assets[i];
    }

    /// @dev Virtual shares; makes first-depositor inflation attacks uneconomic.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    function totalAssets() public view override returns (uint256) {
        (uint256 nav,,) = _nav();
        return nav;
    }

    /// @notice Worst breaker state across the sequencer and every stock in the basket.
    function guardStatus() public view returns (Status) {
        if (!_sequencerOk()) return Status.SequencerDown;
        uint256 n = _assets.length;
        for (uint256 i; i < n; ++i) {
            Status s = _marketStatus(_markets[i]);
            if (s != Status.Ok) return s;
        }
        return Status.Ok;
    }

    /// @notice Largest gap, in basis points of the portfolio, between any weight and its target.
    function currentDrift() public view returns (uint256 worst) {
        (uint256 nav, uint256[] memory values,) = _nav();
        if (nav == 0) return 0;
        for (uint256 i; i < values.length; ++i) {
            uint256 w = values[i].mulDiv(BPS, nav);
            uint256 t = _assets[i].weightBps;
            worst = Math.max(worst, w > t ? w - t : t - w);
        }
    }

    function canRebalance() external view returns (bool) {
        return totalSupply() != 0 && currentDrift() > driftBps
            && block.timestamp >= lastRebalance + REBALANCE_COOLDOWN && guardStatus() == Status.Ok;
    }

    function holdings() external view returns (Holding[] memory out, uint256 idleUsdc, uint256 nav) {
        uint256[] memory values;
        uint256[] memory prices;
        (nav, values, prices) = _nav();
        idleUsdc = IERC20(asset()).balanceOf(address(this));
        out = new Holding[](values.length);
        for (uint256 i; i < values.length; ++i) {
            AssetConfig memory a = _assets[i];
            out[i] = Holding({
                token: a.token,
                balance: IERC20(a.token).balanceOf(address(this)),
                value: values[i],
                price: prices[i],
                targetBps: a.weightBps,
                currentBps: nav == 0 ? 0 : values[i].mulDiv(BPS, nav),
                status: _marketStatus(_markets[i])
            });
        }
    }

    // ------------------------------------------------------- ERC-4626 limits

    function maxDeposit(address) public view override returns (uint256) {
        return guardStatus() == Status.Ok ? type(uint256).max : 0;
    }

    function maxMint(address) public view override returns (uint256) {
        return guardStatus() == Status.Ok ? type(uint256).max : 0;
    }

    /// @dev USDC exits need fair prices. `redeemInKind` works regardless.
    function maxRedeem(address owner) public view override returns (uint256) {
        return guardStatus() == Status.Ok ? balanceOf(owner) : 0;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        if (guardStatus() != Status.Ok) return 0;
        uint256 max = previewRedeem(balanceOf(owner));
        // previewWithdraw rounds up, so stay a hair under or the largest request needs one
        // share more than the owner has.
        return max > 2 ? max - 2 : 0;
    }

    // ----------------------------------------------------- ERC-4626 previews

    function previewDeposit(uint256 assets) public view override returns (uint256) {
        uint256 net = assets - assets.mulDiv(creatorFeeBps, BPS, Math.Rounding.Ceil);
        uint256 invested = net.mulDiv(BPS - MAX_SLIPPAGE_BPS, BPS);
        uint256 dust = _dust();
        return invested > dust ? _convertToShares(invested - dust, Math.Rounding.Floor) : 0;
    }

    function previewMint(uint256 shares) public view override returns (uint256) {
        uint256 net = _convertToAssets(shares, Math.Rounding.Ceil) + _dust();
        uint256 gross = net.mulDiv(BPS, BPS - MAX_SLIPPAGE_BPS, Math.Rounding.Ceil);
        return gross.mulDiv(BPS, BPS - creatorFeeBps, Math.Rounding.Ceil);
    }

    function previewRedeem(uint256 shares) public view override returns (uint256) {
        uint256 gross = _convertToAssets(shares, Math.Rounding.Floor);
        uint256 net = gross.mulDiv(BPS - MAX_SLIPPAGE_BPS, BPS);
        uint256 dust = _dust();
        return net > dust ? net - dust : 0;
    }

    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        uint256 gross =
            (assets + _dust()).mulDiv(BPS, BPS - MAX_SLIPPAGE_BPS, Math.Rounding.Ceil);
        return _convertToShares(gross, Math.Rounding.Ceil) + 1;
    }

    // -------------------------------------------------------- deposit / mint

    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256) {
        return _depositNow(assets, receiver);
    }

    /// @notice `deposit` with a floor and an expiry. Wallets should prefer this one.
    function depositMin(uint256 assets, address receiver, uint256 minShares, uint256 deadline)
        external
        nonReentrant
        returns (uint256 shares)
    {
        if (block.timestamp > deadline) revert Expired();
        shares = _depositNow(assets, receiver);
        if (shares < minShares) revert ValueLost();
    }

    function _depositNow(uint256 assets, address receiver) private returns (uint256 shares) {
        _requireGuard();
        if (assets < MIN_DEPOSIT) revert TooSmall();
        shares = _enter(assets);
        if (shares == 0) revert TooSmall();
        _mint(receiver, shares);
        emit Deposit(_msgSender(), receiver, assets, shares);
    }

    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256 assets) {
        _requireGuard();
        assets = previewMint(shares);
        if (assets < MIN_DEPOSIT) revert TooSmall();
        // Anything bought above the requested shares accrues to all holders.
        if (_enter(assets) < shares) revert ValueLost();
        _mint(receiver, shares);
        emit Deposit(_msgSender(), receiver, assets, shares);
    }

    /// @dev Pulls USDC, pays the creator, buys the basket in the vault's *current* proportions
    /// and returns shares for the value really added. Matching current proportions means oracle
    /// error scales both sides of the ratio alike, so entrants cannot dilute holders with it.
    function _enter(uint256 assets) private returns (uint256) {
        IERC20 usdc = IERC20(asset());
        (uint256 nav, uint256[] memory values, uint256[] memory prices) = _nav();
        uint256 supply = totalSupply();
        usdc.safeTransferFrom(_msgSender(), address(this), assets);

        uint256 fee = assets.mulDiv(creatorFeeBps, BPS, Math.Rounding.Ceil);
        if (fee != 0) {
            // A creator blocked by USDC must not be able to freeze deposits for everyone.
            if (usdc.trySafeTransfer(creator, fee)) emit CreatorFee(creator, _msgSender(), fee);
            else fee = 0;
        }
        uint256 net = assets - fee;
        uint256 n = values.length;
        for (uint256 i; i < n; ++i) {
            uint256 spend =
                supply == 0 || nav == 0 ? net.mulDiv(_assets[i].weightBps, BPS) : net.mulDiv(values[i], nav);
            _buy(i, spend, prices[i]);
        }
        uint256 added = _navAt(prices) - nav;
        return added.mulDiv(supply + 10 ** _decimalsOffset(), nav + 1);
    }

    // ----------------------------------------------------- withdraw / redeem

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return _redeemNow(shares, receiver, owner);
    }

    /// @notice `redeem` with a floor and an expiry. Wallets should prefer this one.
    function redeemMin(uint256 shares, address receiver, address owner, uint256 minAssets, uint256 deadline)
        external
        nonReentrant
        returns (uint256 assets)
    {
        if (block.timestamp > deadline) revert Expired();
        assets = _redeemNow(shares, receiver, owner);
        if (assets < minAssets) revert ValueLost();
    }

    function _redeemNow(uint256 shares, address receiver, address owner) private returns (uint256 assets) {
        _requireGuard();
        assets = _exit(shares, owner);
        IERC20(asset()).safeTransfer(receiver, assets);
        emit Withdraw(_msgSender(), receiver, owner, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        _requireGuard();
        shares = previewWithdraw(assets);
        // Surplus above the exact request stays with remaining holders.
        if (_exit(shares, owner) < assets) revert ValueLost();
        IERC20(asset()).safeTransfer(receiver, assets);
        emit Withdraw(_msgSender(), receiver, owner, assets, shares);
    }

    /// @notice Take your exact slice of each stock. No swap, no oracle, no pause: this exit is
    /// always open, including weekends.
    /// @param skipMask bit i skips (and forfeits) asset i, and SKIP_USDC skips the cash leg, so
    /// one frozen token cannot trap the rest. Pass 0 normally.
    function redeemInKind(uint256 shares, address receiver, address owner, uint256 skipMask)
        external
        nonReentrant
    {
        // Virtual shares are included here exactly as in every other share calculation.
        uint256 supply = totalSupply() + 10 ** _decimalsOffset();
        _spendShares(shares, owner);
        uint256 n = _assets.length;
        if (skipMask & SKIP_USDC == 0) {
            IERC20 usdc = IERC20(asset());
            uint256 cash = usdc.balanceOf(address(this)).mulDiv(shares, supply);
            if (cash != 0) usdc.safeTransfer(receiver, cash);
        }
        for (uint256 i; i < n; ++i) {
            if (skipMask & (1 << i) != 0) continue;
            IERC20 t = IERC20(_assets[i].token);
            uint256 amount = t.balanceOf(address(this)).mulDiv(shares, supply);
            if (amount != 0) t.safeTransfer(receiver, amount);
        }
        emit RedeemInKind(owner, receiver, shares, skipMask);
    }

    /// @dev Sells exactly the pro-rata slice; the leaver bears their own slippage. Denominator
    /// includes virtual shares, matching the preview.
    function _exit(uint256 shares, address owner) private returns (uint256 proceeds) {
        uint256 denom = totalSupply() + 10 ** _decimalsOffset();
        _spendShares(shares, owner);
        IERC20 usdc = IERC20(asset());
        proceeds = usdc.balanceOf(address(this)).mulDiv(shares, denom);
        uint256 n = _assets.length;
        for (uint256 i; i < n; ++i) {
            uint256 amount = IERC20(_assets[i].token).balanceOf(address(this)).mulDiv(shares, denom);
            (uint256 price,) = _referencePrice(_markets[i]);
            proceeds += _sell(i, amount, price);
        }
        if (proceeds == 0) revert TooSmall();
    }

    function _spendShares(uint256 shares, address owner) private {
        if (shares == 0) revert TooSmall();
        if (_msgSender() != owner) _spendAllowance(owner, _msgSender(), shares);
        _burn(owner, shares);
    }

    // ------------------------------------------------------------- rebalance

    /// @notice Permissionless. Trims every overweight stock to target, then buys every
    /// underweight one. Reverts unless some weight is past `driftBps` and the breaker is clear.
    function rebalance() external nonReentrant {
        _requireGuard();
        if (block.timestamp < lastRebalance + REBALANCE_COOLDOWN) {
            revert CoolingDown(lastRebalance + REBALANCE_COOLDOWN);
        }
        uint256 drift = currentDrift();
        if (totalSupply() == 0 || drift <= driftBps) revert WithinDrift(drift, driftBps);
        lastRebalance = block.timestamp;

        (uint256 nav, uint256[] memory values, uint256[] memory prices) = _nav();
        uint256 n = values.length;
        uint256[] memory deficit = new uint256[](n);
        uint256 totalDeficit;
        for (uint256 i; i < n; ++i) {
            uint256 target = nav.mulDiv(_assets[i].weightBps, BPS);
            if (values[i] > target) {
                uint256 bal = IERC20(_assets[i].token).balanceOf(address(this));
                _sell(i, bal.mulDiv(values[i] - target, values[i]), prices[i]);
            } else {
                deficit[i] = target - values[i];
                totalDeficit += deficit[i];
            }
        }
        uint256 cash = IERC20(asset()).balanceOf(address(this));
        uint256 spend = Math.min(cash, totalDeficit);
        for (uint256 i; i < n; ++i) {
            if (deficit[i] != 0) _buy(i, spend.mulDiv(deficit[i], totalDeficit), prices[i]);
        }
        emit Rebalanced(_msgSender(), drift, nav, _navAt(prices));
    }

    // -------------------------------------------------------------- internal

    /// @dev Upper bound on rounding loss across one swap per asset, in USDC units. Stock tokens
    /// have 8 decimals, so one token unit can be worth several USDC units.
    function _dust() private view returns (uint256 dust) {
        uint256 n = _assets.length;
        for (uint256 i; i < n; ++i) {
            (uint256 price,) = _referencePrice(_markets[i]);
            dust += 2 * (price / 10 ** (uint256(_markets[i].tokenDecimals) + 2)) + 4;
        }
    }

    function _requireGuard() private view {
        Status s = guardStatus();
        if (s != Status.Ok) revert GuardTripped(s);
    }

    function _nav() private view returns (uint256 nav, uint256[] memory values, uint256[] memory prices) {
        uint256 n = _assets.length;
        values = new uint256[](n);
        prices = new uint256[](n);
        nav = IERC20(asset()).balanceOf(address(this));
        for (uint256 i; i < n; ++i) {
            (prices[i],) = _referencePrice(_markets[i]);
            values[i] = _value(i, IERC20(_assets[i].token).balanceOf(address(this)), prices[i]);
            nav += values[i];
        }
    }

    function _navAt(uint256[] memory prices) private view returns (uint256 nav) {
        nav = IERC20(asset()).balanceOf(address(this));
        for (uint256 i; i < prices.length; ++i) {
            nav += _value(i, IERC20(_assets[i].token).balanceOf(address(this)), prices[i]);
        }
    }

    /// @dev Token amount to 6-decimal USDC at a 1e8 price.
    function _value(uint256 i, uint256 amount, uint256 price) private view returns (uint256) {
        return amount.mulDiv(price, 10 ** (uint256(_markets[i].tokenDecimals) + 2));
    }

    function _buy(uint256 i, uint256 usdcIn, uint256 price) private {
        uint256 fair = usdcIn.mulDiv(10 ** (uint256(_markets[i].tokenDecimals) + 2), price);
        if (fair == 0) return;
        uint256 out = _swap(i, asset(), _assets[i].token, usdcIn, fair);
        emit Trade(_assets[i].token, true, usdcIn, out);
    }

    function _sell(uint256 i, uint256 amount, uint256 price) private returns (uint256 out) {
        uint256 fair = _value(i, amount, price);
        if (fair == 0) return 0;
        out = _swap(i, _assets[i].token, asset(), amount, fair);
        emit Trade(_assets[i].token, false, amount, out);
    }

    function _swap(uint256 i, address from, address to, uint256 amountIn, uint256 fair)
        private
        returns (uint256)
    {
        AssetConfig memory a = _assets[i];
        IERC20(from).forceApprove(a.router, amountIn);
        return ICLSwapRouter(a.router).exactInputSingle(
            ICLSwapRouter.ExactInputSingleParams({
                tokenIn: from,
                tokenOut: to,
                tickSpacing: a.tickSpacing,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: fair.mulDiv(BPS - MAX_SLIPPAGE_BPS, BPS),
                sqrtPriceLimitX96: 0
            })
        );
    }
}
