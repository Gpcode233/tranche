# Tranche

**Grow your own index fund on Base.** Pick tokenized US stocks, set weights, and
a vault with no owner rebalances by fixed rules. No AI, no custodian.

Built for Base Stocks Maxxing Season, Programmable Stock Markets track.

## How it works

1. **Build** a basket of 2–8 stocks with weights and a drift line, such as 5%.
2. **Drift, then cut.** When any weight passes the line, anyone can call `rebalance()`. The contract
   computes every trade: overweight stocks are sold to target, proceeds buy the underweight ones.
3. **Share** `/t/<vault>`. Others deposit USDC; the creator earns a fixed deposit fee (0–1%, set forever).

A contract cannot wake itself up, so "automatic" means permissionless: the app button, anyone's
script, or `npm run keeper`. The caller cannot choose sizes, prices or timing outside the rule.

## Contracts

| File | Role |
| --- | --- |
| `TrancheVault.sol` | ERC-4626 over USDC. Immutable weights, drift, fee and venues. No admin, no upgrade. |
| `MarketGuard.sol` | Weekend circuit breaker. |
| `TrancheFactory.sol` | Lists stocks and deploys vaults. Its owner affects **new** vaults only. |

**Integrations:** Coinbase B20 tokenized stocks, Chainlink 24/5 tokenized-equity feeds, Chainlink L2
sequencer feed, Aerodrome concentrated-liquidity pools.

**Circuit breaker.** Compares each pool's spot and 30-minute average with the Chainlink price, which
holds Friday's close over the weekend. Allowed gap: 1.5% in session, 0.5% on weekends or when the
feed is over 25 hours old. While tripped, deposits, USDC redemptions and rebalances stop.
`redeemInKind` uses no price and no swap, so it is not affected.

**Fills.** Every swap must return at least 99% of the Chainlink value, pool fee included.

**Entry.** Deposits buy the vault's *current* proportions, so a slightly wrong oracle price scales
both sides of the share calculation and gives entrants no edge over holders.

## Run it

```bash
npm install
npm test                 # contract tests
npm run verify:mainnet   # read-only: whole flow simulated on live Base state
npm run dev              # http://localhost:3000, design-only until a factory is set
```

Full local demo with mock stocks:

```bash
npm run chain            # terminal 1
npm run seed             # terminal 2, writes .env.local
npm run dev              # terminal 3
```

Import a Hardhat test key printed by `npm run chain` into a throwaway wallet profile to click through it.

## Deploy to Base

```bash
DEPLOYER_PRIVATE_KEY=0x... npm run deploy   # lists all seven stocks
```

Put the printed `NEXT_PUBLIC_FACTORY` in your hosting environment. Set `NEXT_PUBLIC_BUILDER_CODE`
so Base can attribute onchain usage to the app.

## Known limits

- **No independent audit.** See docs/AUDIT.md for the internal review. Use small amounts.
- B20 issuers can block addresses or pause transfers. `redeemInKind` takes a skip mask so one frozen
  token does not hold the others; skipped assets are forfeited.
- A rebalance can lose up to 1% of the amount traded to price impact or MEV.
- Large deposits fail rather than fill badly when pool depth is short.
- Fast markets can trip the breaker because the 30-minute average lags.
