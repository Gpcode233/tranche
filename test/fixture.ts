import { network } from "hardhat";
import { parseUnits } from "viem";

export const connection = await network.create();
export const { viem, networkHelpers } = connection;

export const USD = (n: number | string) => parseUnits(String(n), 6);
export const px = (n: number) => BigInt(Math.round(n * 1e8));
export const ZERO = "0x0000000000000000000000000000000000000000" as const;
export const FACTORY = "0x00000000000000000000000000000000000000fa" as const;
// Wed 2030-01-09 15:00 UTC, mid session.
export const WEDNESDAY = 1894201200n;
export const SATURDAY = WEDNESDAY + 3n * 86400n;

/** Tick whose price is `usd` per 8-decimals-agnostic whole token. */
export function tickFor(usd: number, decimals: number, tokenIsToken0: boolean) {
  const raw = (usd * 1e6) / 10 ** decimals;
  return Math.floor(Math.log(tokenIsToken0 ? raw : 1 / raw) / Math.log(1.0001));
}

async function setup(decimals: number) {
  if (BigInt(await networkHelpers.time.latest()) < WEDNESDAY) await networkHelpers.time.increaseTo(WEDNESDAY);
  const [owner, creator, amaka, bola, keeper] = await viem.getWalletClients();
  const usdc = await viem.deployContract("MockToken", ["USD Coin", "USDC", 6]);
  const sequencer = await viem.deployContract("MockFeed", [0, 0n, WEDNESDAY - 86400n]);
  const router = await viem.deployContract("MockRouter", [FACTORY, usdc.address]);
  const factory = await viem.deployContract("TrancheFactory", [
    usdc.address,
    sequencer.address,
    owner.account.address,
  ]);

  const stocks = [];
  for (const [symbol, price] of [["NVDA", 160], ["AAPL", 350], ["TSLA", 384]] as const) {
    const token = await viem.deployContract("MockToken", [symbol, symbol, decimals]);
    const feed = await viem.deployContract("MockFeed", [8, px(price), 1n]);
    const pool = await viem.deployContract("MockPool", [token.address, usdc.address, FACTORY]);
    const is0 = token.address.toLowerCase() < usdc.address.toLowerCase();
    const setPool = async (usd: number, avg = usd) =>
      pool.write.set([tickFor(usd, decimals, is0), tickFor(avg, decimals, is0)]);
    const setPrice = async (usd: number) => {
      await feed.write.set([px(usd), BigInt(await networkHelpers.time.latest())]);
      await setPool(usd);
    };
    await setPrice(price);
    await router.write.setFeed([token.address, feed.address]);
    await factory.write.list([token.address, feed.address, pool.address, router.address]);
    stocks.push({ symbol, token, feed, pool, setPool, setPrice });
  }
  const [nvda, aapl, tsla] = stocks;

  await factory.write.create(
    ["AI & Compute", "AICO", stocks.map((s) => s.token.address), [6000, 2500, 1500], 500n, 10n],
    { account: creator.account },
  );
  const vault = await viem.getContractAt("TrancheVault", await factory.read.vaults([0n]));

  for (const u of [amaka, bola]) {
    await usdc.write.mint([u.account.address, USD(100_000)]);
    await usdc.write.approve([vault.address, USD(100_000)], { account: u.account });
  }
  return { owner, creator, amaka, bola, keeper, usdc, sequencer, router, factory, nvda, aapl, tsla, stocks, vault };
}
// loadFixture passes the connection as an argument, so these take none.
export const deploy = async () => setup(8);
export const deploy18 = async () => setup(18);
