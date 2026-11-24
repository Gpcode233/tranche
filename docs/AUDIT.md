# Tranche internal security review

24 November 2026. Scope: `TrancheVault`, `TrancheFactory`, `MarketGuard`, `TickPrice`.

**This is an internal AI-assisted review, written by the same author as the code. It is not an
independent audit and should not be presented as one.**

Method: manual line review, Slither 0.11.6, 42 unit and adversarial tests (including a 40-step
random walk on share price), and a full-flow simulation on live Base state.

## Fixed

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | Medium | Deposits and redemptions had no caller-set minimum or deadline. A signed transaction could sit unmined and fill at a later price. | `depositMin` and `redeemMin`; the app uses only these, with a 20-minute expiry. |
| 2 | Medium | If USDC blocked the creator's address, the fee transfer reverted and froze deposits for everyone. | Fee transfer failure is tolerated; the fee stays with the depositor. |
| 3 | Medium | If USDC blocked the vault, any idle USDC made `redeemInKind` revert, trapping the stocks. | `SKIP_USDC` mask bit. |
| 4 | Low | `redeemInKind` ignored virtual shares that all other share maths includes, so exits disagreed when supply was tiny. | Same denominator everywhere. |
| 5 | Low | `withdraw(maxWithdraw)` could need one share more than held (found earlier by tests). | Rounding margin. |

## Accepted risks

| # | Severity | Risk | Why, and what limits it |
| --- | --- | --- | --- |
| A | Medium | **Sandwiching.** Someone can move a pool, trigger a rebalance and trade back. | Each fill must be within 1% of Chainlink; once an hour at most; only past the drift line. Loss is up to 1% of the amount traded. |
| B | Medium | **Frozen token.** If an issuer blocks or pauses one stock, deposits, USDC exits and rebalances stop. In-kind exit works only by forfeiting that stock. | Immutable vaults cannot swap a venue or token. Forfeited tokens go to remaining holders. |
| C | Medium | **Venue failure is permanent.** If a pool loses depth, fees pass 1%, or a feed retires, USDC exits stop. | In-kind exit needs no oracle, pool or router. |
| D | Medium | **Factory owner key.** A stolen key could list a fake token, feed, pool or router for new vaults. `list` checks they agree with each other, not that they are genuine. | Existing vaults are unaffected. Use a multisig owner before promoting the app. |
| E | Low | `mint` charges, and `withdraw` burns, the 1% worst case. The surplus goes to other holders. | Needed for exact ERC-4626 previews. The app never calls them; integrators should use `deposit` and `redeem`. |
| F | Low | The first 25 hours of a weekday holiday use the 1.5% gap, not 0.5%. Coinbase's corporate-action pause flag is not read. | Chainlink feed is total-return and freezes; the pool comparison still applies. |
| G | Low | The 30-minute average lags, so fast markets pause the vault. | Fails closed. |
| H | Info | Share value read during a swap is inconsistent (read-only reentrancy). | Do not use a vault's price as an oracle or lending collateral. |
| I | Info | Anyone can name a vault anything. | The app shows the creator and opens factory-made vaults only. |

## Checked and found sound

- First-depositor inflation, and collapsing supply then donating.
- Oracle error on entry: deposits buy current proportions, so the edge cancels to first order.
- Exits charge slippage to the leaver, not to those who stay.
- Share allowance on every exit path; reentrancy guard on every state change.
- Donating tokens to force a rebalance: costs more than it can extract.
- No owner, upgrade, pause or sweep function on a vault.

## Slither

Reported date arithmetic as "weak PRNG", balance reads before swaps as reentrancy, zero checks as
"strict equality", and divide-before-multiply in `_dust` and TickMath. Reviewed as false positives:
state-changing entry points are `nonReentrant`, listed tokens have no transfer hooks, zero checks are not used as
balance invariants, and the divisions are intended.

## Before real deposits

1. Independent audit.
2. Multisig factory owner.
3. Start small, and watch `Rebalanced` events for `navBefore - navAfter`.
