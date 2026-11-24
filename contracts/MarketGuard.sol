// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAggregatorV3, ICLPool} from "./interfaces/External.sol";
import {TickPrice} from "./libraries/TickPrice.sol";

/// @title Weekend circuit breaker
/// @notice US equities close; Base DEXs do not. Chainlink's 24/5 equity feeds hold Friday's
/// close all weekend, so this compares that reference with the pool's spot AND 30-minute
/// average price. The allowed gap is tight when the market is closed, wider when open.
abstract contract MarketGuard {
    enum Status {
        Ok,
        SequencerDown,
        BadPrice,
        StalePrice,
        NoPoolHistory,
        PriceGap
    }

    struct Market {
        address feed;
        address pool;
        uint8 tokenDecimals;
        bool tokenIsToken0;
    }

    uint32 public constant TWAP_WINDOW = 30 minutes;
    uint256 public constant SEQUENCER_GRACE = 1 hours;
    /// @dev Fri 8pm ET to Tue 8pm ET covers a three-day weekend plus the heartbeat before it.
    uint256 public constant MAX_PRICE_AGE = 5 days;
    /// @dev Feed heartbeat is 24h while a session is live; older than this means no session.
    uint256 public constant SESSION_PRICE_AGE = 25 hours;
    uint256 public constant OPEN_GAP_BPS = 150;
    uint256 public constant CLOSED_GAP_BPS = 50;

    address public immutable sequencerFeed;

    constructor(address sequencerFeed_) {
        sequencerFeed = sequencerFeed_;
    }

    /// @notice Conservative 24/5 session test. The clock alone never unlocks anything; it only
    /// picks which price gap applies.
    function isWeekend(uint256 ts) public pure returns (bool) {
        // 1970-01-01 was a Thursday. 0 = Monday ... 6 = Sunday.
        uint256 day = (ts / 1 days + 3) % 7;
        // Sessions end Fri 8pm ET (Sat 00:00/01:00 UTC), resume Sun 8pm ET (Mon 00:00/01:00 UTC).
        return day >= 5 || (day == 0 && ts % 1 days < 1 hours);
    }

    function _sequencerOk() internal view returns (bool) {
        if (sequencerFeed == address(0)) return true;
        (, int256 down, uint256 startedAt,,) = IAggregatorV3(sequencerFeed).latestRoundData();
        return down == 0 && startedAt != 0 && block.timestamp - startedAt > SEQUENCER_GRACE;
    }

    /// @dev Price of one whole token in 1e8 USD.
    function _referencePrice(Market memory m) internal view returns (uint256 price, uint256 updatedAt) {
        (, int256 answer,, uint256 at,) = IAggregatorV3(m.feed).latestRoundData();
        return (answer > 0 ? uint256(answer) : 0, at);
    }

    /// @dev Pool price of one whole token in 1e8 USD, given 6-decimal USDC.
    function _poolPrice(Market memory m, int24 tick) internal pure returns (uint256) {
        return TickPrice.quote(tick, 10 ** m.tokenDecimals, m.tokenIsToken0) * 100;
    }

    function _twapTick(address pool) internal view returns (bool ok, int24 tick) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = TWAP_WINDOW;
        try ICLPool(pool).observe(ago) returns (int56[] memory cum, uint160[] memory) {
            int56 delta = cum[1] - cum[0];
            int56 window = int56(uint56(TWAP_WINDOW));
            int56 t = delta / window;
            if (delta < 0 && delta % window != 0) t--;
            return (true, int24(t));
        } catch {
            return (false, 0);
        }
    }

    function _gapBps(uint256 a, uint256 ref) private pure returns (uint256) {
        return ((a > ref ? a - ref : ref - a) * 10_000) / ref;
    }

    function _marketStatus(Market memory m) internal view returns (Status) {
        (uint256 ref, uint256 updatedAt) = _referencePrice(m);
        if (ref == 0 || updatedAt == 0 || updatedAt > block.timestamp) return Status.BadPrice;
        uint256 age = block.timestamp - updatedAt;
        if (age > MAX_PRICE_AGE) return Status.StalePrice;

        (bool ok, int24 avg) = _twapTick(m.pool);
        if (!ok) return Status.NoPoolHistory;
        (, int24 spot,,,,) = ICLPool(m.pool).slot0();

        uint256 limit =
            isWeekend(block.timestamp) || age > SESSION_PRICE_AGE ? CLOSED_GAP_BPS : OPEN_GAP_BPS;
        if (_gapBps(_poolPrice(m, spot), ref) > limit || _gapBps(_poolPrice(m, avg), ref) > limit) {
            return Status.PriceGap;
        }
        return Status.Ok;
    }
}
