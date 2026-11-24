import { writeFileSync } from "node:fs";
import { network } from "hardhat";
import { parseUnits } from "viem";
import { FACTORY, tickFor } from "../test/fixture.js";

// Seeds `npm run chain` with mock stocks so the whole app works offline, and prints .env.local.
const { viem } = await network.create("localhost");
const [owner, , user] = await viem.getWalletClients();
const client = await viem.getPublicClient();
const now = (await client.getBlock()).timestamp;

const usdc = await viem.deployContract("MockToken", ["USD Coin", "USDC", 6]);
const sequencer = await viem.deployContract("MockFeed", [0, 0n, now - 86_400n]);
const router = await viem.deployContract("MockRouter", [FACTORY, usdc.address]);
const factory = await viem.deployContract("TrancheFactory", [usdc.address, sequencer.address, owner.account.address]);

const prices: [string, number][] = [["NVDA", 161], ["AAPL", 350], ["TSLA", 384], ["GOOGL", 283], ["AMZN", 256], ["META", 597], ["MSFT", 494]];
const stocks: Record<string, { token: string; feed: string; pool: string }> = {};
for (const [ticker, price] of prices) {
  const token = await viem.deployContract("MockToken", [ticker, `${ticker}c`, 8]);
  const feed = await viem.deployContract("MockFeed", [8, BigInt(price * 1e8), 1n]);
  const pool = await viem.deployContract("MockPool", [token.address, usdc.address, FACTORY]);
  const tick = tickFor(price, 8, token.address.toLowerCase() < usdc.address.toLowerCase());
  await pool.write.set([tick, tick]);
  await router.write.setFeed([token.address, feed.address]);
  await factory.write.list([token.address, feed.address, pool.address, router.address]);
  stocks[ticker] = { token: token.address, feed: feed.address, pool: pool.address };
}

const pick = (...t: string[]) => t.map((x) => stocks[x].token as `0x${string}`);
await factory.write.create(["AI & Compute", "AICOx", pick("NVDA", "AAPL", "TSLA"), [6000, 2500, 1500], 500n, 10n]);
await factory.write.create(["Cloud Three", "CLOUDx", pick("MSFT", "AMZN", "GOOGL"), [4000, 3500, 2500], 400n, 10n]);
for (const w of [owner, user]) await usdc.write.mint([w.account.address, parseUnits("25000", 6)]);
const first = await viem.getContractAt("TrancheVault", await factory.read.vaults([0n]));
await usdc.write.approve([first.address, parseUnits("5000", 6)]);
await first.write.deposit([parseUnits("5000", 6), owner.account.address]);
// Leave the first index past its line so "Make the cut" is live.
const nvda = await viem.getContractAt("MockFeed", stocks.NVDA.feed as `0x${string}`);
const pool = await viem.getContractAt("MockPool", stocks.NVDA.pool as `0x${string}`);
await nvda.write.set([BigInt(215 * 1e8), now]);
const tick = tickFor(215, 8, stocks.NVDA.token.toLowerCase() < usdc.address.toLowerCase());
await pool.write.set([tick, tick]);

writeFileSync(".env.local", `NEXT_PUBLIC_CHAIN=local
NEXT_PUBLIC_FACTORY=${factory.address}
NEXT_PUBLIC_USDC=${usdc.address}
NEXT_PUBLIC_LOCAL_STOCKS=${JSON.stringify(stocks)}
`);
console.log("Wrote .env.local. First index:", first.address);
