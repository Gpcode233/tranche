import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deploy, deploy18, networkHelpers, viem, USD, SATURDAY, WEDNESDAY } from "./fixture.js";

type Ctx = Awaited<ReturnType<typeof deploy>>;
const load = () => networkHelpers.loadFixture(deploy);
const put = (c: Ctx, who: Ctx["amaka"], usd: number) =>
  c.vault.write.deposit([USD(usd), who.account.address], { account: who.account });
const near = (a: bigint, b: bigint, bps = 1n) =>
  assert.ok((a > b ? a - b : b - a) * 10_000n <= b * bps, `${a} !~ ${b}`);

describe("deposit", () => {
  it("buys the target basket and pays the creator 0.1%", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    const [h] = await c.vault.read.holdings();
    assert.deepEqual(h.map((x) => Math.round(Number(x.currentBps) / 10)), [600, 250, 150]);
    assert.equal(await c.usdc.read.balanceOf([c.creator.account.address]), USD(10));
  });

  for (const [label, fixture] of [["8", deploy], ["18", deploy18]] as const) {
    it(`values ${label}-decimal tokens correctly`, async () => {
      const c = await networkHelpers.loadFixture(fixture);
      await put(c, c.amaka, 10_000);
      // 10,000 less 10 creator fee less 0.1% swap cost.
      near(await c.vault.read.totalAssets(), USD(9980.01));
      assert.equal(await c.vault.read.guardStatus(), 0);
    });
  }

  it("mints at least the preview", async () => {
    const c = await load();
    await put(c, c.amaka, 5_000);
    const preview = await c.vault.read.previewDeposit([USD(1_234)]);
    await put(c, c.bola, 1_234);
    assert.ok((await c.vault.read.balanceOf([c.bola.account.address])) >= preview);
  });

  it("does not dilute existing holders", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    const shares = await c.vault.read.balanceOf([c.amaka.account.address]);
    const before = await c.vault.read.convertToAssets([shares]);
    await put(c, c.bola, 90_000);
    assert.ok((await c.vault.read.convertToAssets([shares])) + 1n >= before);
  });

  it("buys current proportions, so oracle error gives entrants no edge", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    await c.nvda.setPrice(200);
    const [before] = await c.vault.read.holdings();
    await put(c, c.bola, 10_000);
    const [after] = await c.vault.read.holdings();
    after.forEach((h, i) => near(h.currentBps, before[i].currentBps, 10n));
  });

  it("mint() gives exact shares", async () => {
    const c = await load();
    await put(c, c.amaka, 1_000);
    const want = await c.vault.read.convertToShares([USD(500)]);
    await c.vault.write.mint([want, c.bola.account.address], { account: c.bola.account });
    assert.equal(await c.vault.read.balanceOf([c.bola.account.address]), want);
  });

  it("rejects dust", async () => {
    const c = await load();
    await viem.assertions.revertWithCustomError(
      c.vault.write.deposit([999_999n, c.amaka.account.address], { account: c.amaka.account }), c.vault, "TooSmall");
  });

  it("reverts when fills are worse than 1%", async () => {
    const c = await load();
    await c.router.write.setCost([101n]);
    await viem.assertions.revertWith(put(c, c.amaka, 100), "Too little received");
  });

  it("survives a first-depositor donation attack", async () => {
    const c = await load();
    await c.vault.write.deposit([USD(1), c.amaka.account.address], { account: c.amaka.account });
    await c.usdc.write.transfer([c.vault.address, USD(10_000)], { account: c.amaka.account });
    await put(c, c.bola, 5_000);
    const s = await c.vault.read.balanceOf([c.bola.account.address]);
    near(await c.vault.read.convertToAssets([s]), USD(4_990), 20n);
  });
});

describe("rebalance", () => {
  it("reverts inside the drift band", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    await c.nvda.setPrice(165);
    assert.equal(await c.vault.read.canRebalance(), false);
    await viem.assertions.revertWithCustomError(c.vault.write.rebalance(), c.vault, "WithinDrift");
  });

  it("trims the winner back to target once past 5%, by anyone", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    await c.nvda.setPrice(210);
    assert.ok((await c.vault.read.currentDrift()) > 500n);
    const navBefore = await c.vault.read.totalAssets();
    await c.vault.write.rebalance({ account: c.keeper.account });
    const [h, idle] = await c.vault.read.holdings();
    [6000n, 2500n, 1500n].forEach((t, i) => near(h[i].currentBps, t, 10n));
    assert.ok(idle < USD(1));
    near(await c.vault.read.totalAssets(), navBefore, 5n);
  });

  it("handles one loser and several winners", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    await c.nvda.setPrice(110);
    await c.tsla.setPrice(450);
    await c.vault.write.rebalance();
    assert.ok((await c.vault.read.currentDrift()) < 20n);
  });

  it("enforces the cooldown", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    await c.nvda.setPrice(210);
    await c.vault.write.rebalance();
    await c.nvda.setPrice(300);
    await viem.assertions.revertWithCustomError(c.vault.write.rebalance(), c.vault, "CoolingDown");
    await networkHelpers.time.increase(3601);
    await c.vault.write.rebalance();
  });
});

describe("weekend circuit breaker", () => {
  const trip = async (c: Ctx, expected: number) => {
    assert.equal(await c.vault.read.guardStatus(), expected);
    assert.equal(await c.vault.read.maxDeposit([c.amaka.account.address]), 0n);
    assert.equal(await c.vault.read.maxRedeem([c.amaka.account.address]), 0n);
    await viem.assertions.revertWithCustomError(c.vault.write.rebalance(), c.vault, "GuardTripped");
    await viem.assertions.revertWithCustomError(put(c, c.amaka, 100), c.vault, "GuardTripped");
  };

  it("knows weekends", async () => {
    const c = await load();
    const w = (t: bigint) => c.vault.read.isWeekend([t]);
    assert.equal(await w(WEDNESDAY), false);
    assert.equal(await w(SATURDAY), true);
    assert.equal(await w(SATURDAY + 86400n), true);
    const mon = SATURDAY + 2n * 86400n - 15n * 3600n;
    assert.equal(await w(mon + 1800n), true);
    assert.equal(await w(mon + 3600n), false);
    assert.equal(await w(SATURDAY - 15n * 3600n - 1n), false);
  });

  it("allows a 1% gap mid-week but pauses on it at the weekend", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    await c.nvda.setPool(161.6);
    assert.equal(await c.vault.read.guardStatus(), 0);
    await networkHelpers.time.increaseTo(SATURDAY);
    await trip(c, 5);
  });

  it("keeps working on a weekend while pools agree with Friday's close", async () => {
    const c = await load();
    await networkHelpers.time.increaseTo(SATURDAY);
    await put(c, c.amaka, 100);
  });

  it("uses the tight band on a weekday holiday", async () => {
    const c = await load();
    await c.nvda.setPool(161.6);
    await networkHelpers.time.increase(26 * 3600);
    assert.equal(await c.vault.read.guardStatus(), 5);
  });

  it("is not fooled by spot manipulation when the average disagrees", async () => {
    const c = await load();
    await c.nvda.setPool(160, 170);
    await trip(c, 5);
  });

  it("trips on spot alone", async () => {
    const c = await load();
    await c.nvda.setPool(170, 160);
    await trip(c, 5);
  });

  it("trips on stale, zero and missing history", async () => {
    const c = await load();
    await c.nvda.pool.write.setNoHistory([true]);
    await trip(c, 4);
    await c.nvda.pool.write.setNoHistory([false]);
    await c.nvda.feed.write.set([0n, WEDNESDAY]);
    assert.equal(await c.vault.read.guardStatus(), 2);
    await c.nvda.setPrice(160);
    await networkHelpers.time.increase(6 * 86400);
    await trip(c, 3);
  });

  it("trips when the sequencer is down or just restarted", async () => {
    const c = await load();
    await c.sequencer.write.set([1n, WEDNESDAY]);
    await trip(c, 1);
    await c.sequencer.write.set([0n, WEDNESDAY]);
    await c.sequencer.write.setStarted([BigInt(await networkHelpers.time.latest()) - 60n]);
    await trip(c, 1);
  });

  it("always allows in-kind exit, even with the breaker tripped", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    await c.nvda.setPool(200);
    await networkHelpers.time.increaseTo(SATURDAY);
    const me = c.amaka.account.address;
    const shares = await c.vault.read.balanceOf([me]);
    const held = await c.nvda.token.read.balanceOf([c.vault.address]);
    await c.vault.write.redeemInKind([shares, me, me, 0n], { account: c.amaka.account });
    near(await c.nvda.token.read.balanceOf([me]), held);
  });
});

describe("exit", () => {
  it("redeem pays at least the preview and empties the position", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    await put(c, c.bola, 3_000);
    const me = c.amaka.account.address;
    const shares = await c.vault.read.balanceOf([me]);
    const preview = await c.vault.read.previewRedeem([shares]);
    const before = await c.usdc.read.balanceOf([me]);
    await c.vault.write.redeem([shares, me, me], { account: c.amaka.account });
    const got = (await c.usdc.read.balanceOf([me])) - before;
    assert.ok(got >= preview);
    near(got, USD(9970), 5n);
  });

  it("redeem meets the preview at the slippage limit, for tiny amounts too", async () => {
    const c = await load();
    await put(c, c.amaka, 100);
    const me = c.amaka.account.address;
    await c.router.write.setCost([100n]);
    const one = (await c.vault.read.balanceOf([me])) / 97n;
    const preview = await c.vault.read.previewRedeem([one]);
    const before = await c.usdc.read.balanceOf([me]);
    await c.vault.write.redeem([one, me, me], { account: c.amaka.account });
    assert.ok((await c.usdc.read.balanceOf([me])) - before >= preview);
  });

  it("withdraw pays the exact amount", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    const me = c.amaka.account.address;
    const before = await c.usdc.read.balanceOf([me]);
    await c.vault.write.withdraw([USD(1_000), me, me], { account: c.amaka.account });
    assert.equal((await c.usdc.read.balanceOf([me])) - before, USD(1_000));
  });

  it("withdraw(maxWithdraw) succeeds at the slippage limit", async () => {
    const c = await load();
    await put(c, c.amaka, 1_000);
    await c.router.write.setCost([100n]);
    const me = c.amaka.account.address;
    const max = await c.vault.read.maxWithdraw([me]);
    await c.vault.write.withdraw([max, me, me], { account: c.amaka.account });
  });

  it("one person leaving does not cost the others", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    await put(c, c.bola, 10_000);
    const b = c.bola.account.address;
    const before = await c.vault.read.convertToAssets([await c.vault.read.balanceOf([b])]);
    await c.router.write.setCost([90n]);
    const a = c.amaka.account.address;
    await c.vault.write.redeem([await c.vault.read.balanceOf([a]), a, a], { account: c.amaka.account });
    assert.ok((await c.vault.read.convertToAssets([await c.vault.read.balanceOf([b])])) + 2n >= before);
  });

  it("skipMask lets holders out when one token is frozen", async () => {
    const c = await load();
    await put(c, c.amaka, 1_000);
    const me = c.amaka.account.address;
    const s = await c.vault.read.balanceOf([me]);
    await c.nvda.token.write.setBlocked([c.vault.address, true]);
    await assert.rejects(c.vault.write.redeemInKind([s, me, me, 0n], { account: c.amaka.account }));
    await c.vault.write.redeemInKind([s, me, me, 1n], { account: c.amaka.account });
    assert.ok((await c.aapl.token.read.balanceOf([me])) > 0n);
  });

  it("nobody can spend someone else's shares", async () => {
    const c = await load();
    await put(c, c.amaka, 1_000);
    const me = c.amaka.account.address;
    const thief = c.bola.account;
    for (const p of [
      c.vault.write.redeem([1_000_000n, thief.address, me], { account: thief }),
      c.vault.write.withdraw([USD(1), thief.address, me], { account: thief }),
      c.vault.write.redeemInKind([1_000_000n, thief.address, me, 0n], { account: thief }),
    ]) await viem.assertions.revertWithCustomError(p, c.vault, "ERC20InsufficientAllowance");
  });
});

describe("factory", () => {
  it("rejects bad baskets", async () => {
    const c = await load();
    const t = c.stocks.map((s) => s.token.address);
    const mk = (w: number[], tokens = t, drift = 500n, fee = 10n) =>
      c.factory.write.create(["x", "X", tokens, w, drift, fee]);
    for (const p of [
      mk([6000, 2500, 1400]),
      mk([9950, 25, 25]),
      mk([5000, 2500, 2500], [t[0], t[0], t[1]]),
      mk([6000, 2500, 1500], t, 50n),
      mk([6000, 2500, 1500], t, 500n, 101n),
    ]) await viem.assertions.revertWithCustomError(p, c.vault, "BadConfig");
    await viem.assertions.revertWithCustomError(mk([5000, 5000], [t[0], c.usdc.address]), c.factory, "NotListed");
  });

  it("only the owner lists, and a listing must match its pool", async () => {
    const c = await load();
    const a = [c.nvda.token.address, c.nvda.feed.address, c.aapl.pool.address, c.router.address] as const;
    await viem.assertions.revertWithCustomError(c.factory.write.list(a), c.factory, "BadListing");
    await viem.assertions.revertWithCustomError(
      c.factory.write.list(a, { account: c.amaka.account }), c.factory, "OwnableUnauthorizedAccount");
  });

  it("delisting stops new vaults and leaves old ones alone", async () => {
    const c = await load();
    await c.factory.write.delist([c.nvda.token.address]);
    await put(c, c.amaka, 100);
    await viem.assertions.revertWithCustomError(
      c.factory.write.create(["x", "X", [c.nvda.token.address, c.aapl.token.address], [5000, 5000], 500n, 0n]),
      c.factory, "NotListed");
  });
});

