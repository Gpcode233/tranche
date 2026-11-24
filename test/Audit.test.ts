import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deploy, networkHelpers, viem, USD, WEDNESDAY } from "./fixture.js";

type Ctx = Awaited<ReturnType<typeof deploy>>;
const load = () => networkHelpers.loadFixture(deploy);
const FOREVER = 10n ** 12n;
const put = (c: Ctx, who: Ctx["amaka"], usd: number) =>
  c.vault.write.deposit([USD(usd), who.account.address], { account: who.account });
const shares = (c: Ctx, who: Ctx["amaka"]) => c.vault.read.balanceOf([who.account.address]);

describe("audit regressions", () => {
  it("a USDC-blocked creator cannot freeze deposits", async () => {
    const c = await load();
    await c.usdc.write.setBlocked([c.creator.account.address, true]);
    await put(c, c.amaka, 100);
    assert.ok((await c.vault.read.totalAssets()) > USD(99.8));
  });

  it("stocks can leave when USDC blocks the vault", async () => {
    const c = await load();
    await put(c, c.amaka, 1_000);
    await c.usdc.write.mint([c.vault.address, 1n]);
    await c.usdc.write.mint([c.vault.address, USD(10)]);
    await c.usdc.write.setBlocked([c.vault.address, true]);
    const me = c.amaka.account.address;
    const s = await shares(c, c.amaka);
    await assert.rejects(c.vault.write.redeemInKind([s, me, me, 0n], { account: c.amaka.account }));
    await c.vault.write.redeemInKind([s, me, me, 1n << 255n], { account: c.amaka.account });
    assert.ok((await c.nvda.token.read.balanceOf([me])) > 0n);
  });

  it("depositMin and redeemMin enforce the floor and the expiry", async () => {
    const c = await load();
    const me = c.amaka.account.address;
    const o = { account: c.amaka.account };
    const v = c.vault;
    const quote = await v.read.previewDeposit([USD(100)]);
    await viem.assertions.revertWithCustomError(v.write.depositMin([USD(100), me, quote * 2n, FOREVER], o), v, "ValueLost");
    await viem.assertions.revertWithCustomError(v.write.depositMin([USD(100), me, 0n, WEDNESDAY], o), v, "Expired");
    await v.write.depositMin([USD(100), me, quote, FOREVER], o);
    const s = await shares(c, c.amaka);
    const out = await v.read.previewRedeem([s]);
    await viem.assertions.revertWithCustomError(v.write.redeemMin([s, me, me, out * 2n, FOREVER], o), v, "ValueLost");
    await viem.assertions.revertWithCustomError(v.write.redeemMin([s, me, me, 0n, WEDNESDAY], o), v, "Expired");
    await viem.assertions.revertWithCustomError(
      v.write.redeemMin([s, me, me, 0n, FOREVER], { account: c.bola.account }), v, "ERC20InsufficientAllowance");
    await v.write.redeemMin([s, me, me, out, FOREVER], o);
  });

  it("collapsing supply then donating cannot take a later deposit", async () => {
    const c = await load();
    await put(c, c.amaka, 10);
    const a = c.amaka.account.address;
    const s = await shares(c, c.amaka);
    await c.vault.write.redeemInKind([s - 1n, a, a, 0n], { account: c.amaka.account });
    await c.usdc.write.transfer([c.vault.address, USD(20_000)], { account: c.amaka.account });
    await put(c, c.bola, 5_000);
    await put(c, c.amaka, 5_000);
    const usd = async (who: Ctx["amaka"]) => c.vault.read.convertToAssets([await shares(c, who)]);
    // Attacker spent 25,000 and holds far less; the grief costs more than anyone can gain.
    assert.ok((await usd(c.amaka)) < USD(20_000));
    assert.ok((await usd(c.bola)) > USD(4_900));
  });

  it("donating cannot make a rebalance profitable to the caller", async () => {
    const c = await load();
    await put(c, c.bola, 10_000);
    await c.usdc.write.transfer([c.vault.address, USD(2_000)], { account: c.amaka.account });
    const before = await c.vault.read.totalAssets();
    const k = await c.usdc.read.balanceOf([c.keeper.account.address]);
    await c.router.write.setCost([100n]);
    await c.vault.write.rebalance({ account: c.keeper.account });
    assert.equal(await c.usdc.read.balanceOf([c.keeper.account.address]), k);
    assert.ok((await c.vault.read.totalAssets()) > before - USD(25));
  });

  it("in-kind exit needs no oracle at all", async () => {
    const c = await load();
    await put(c, c.amaka, 1_000);
    for (const s of c.stocks) await networkHelpers.setCode(s.feed.address, "0xfe");
    await assert.rejects(c.vault.read.totalAssets());
    const me = c.amaka.account.address;
    await c.vault.write.redeemInKind([await shares(c, c.amaka), me, me, 0n], { account: c.amaka.account });
    assert.ok((await c.tsla.token.read.balanceOf([me])) > 0n);
  });

  it("share price never falls from other people's deposits and exits (random walk)", async () => {
    const c = await load();
    let seed = 7;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    await put(c, c.amaka, 5_000);
    const probe = 10n ** 12n;
    let pricePerShare = await c.vault.read.convertToAssets([probe * 1000n]);
    for (let i = 0; i < 40; i++) {
      await c.router.write.setCost([BigInt(Math.floor(rnd() * 95))]);
      const b = c.bola.account.address;
      const s = await shares(c, c.bola);
      const part = (s * BigInt(1 + Math.floor(rnd() * 100))) / 100n;
      const k = rnd();
      const o = { account: c.bola.account };
      if (s === 0n || k < 0.45) {
        const amt = USD((1 + rnd() * 2000).toFixed(6));
        const quote = await c.vault.read.previewDeposit([amt]);
        await c.vault.write.deposit([amt, b], o);
        assert.ok((await shares(c, c.bola)) - s >= quote);
      } else if (k < 0.65) await c.vault.write.redeem([part, b, b], o);
      else if (k < 0.8) await c.vault.write.redeemInKind([part, b, b, 0n], o);
      else if (k < 0.9) {
        const max = await c.vault.read.maxWithdraw([b]);
        if (max > 10n) await c.vault.write.withdraw([max / 2n, b, b], o);
      } else await c.vault.write.mint([probe, b], o);
      const now = await c.vault.read.convertToAssets([probe * 1000n]);
      assert.ok(now + 20n >= pricePerShare, `step ${i}: ${now} < ${pricePerShare}`);
      pricePerShare = now;
    }
  });

  it("every drift in a sweep rebalances back inside the band without losing more than costs", async () => {
    const c = await load();
    await put(c, c.amaka, 10_000);
    for (const [n, a, t] of [[300, 350, 384], [90, 500, 200], [1000, 50, 384], [20, 350, 900]]) {
      await c.nvda.setPrice(n); await c.aapl.setPrice(a); await c.tsla.setPrice(t);
      await networkHelpers.time.increase(3601);
      const before = await c.vault.read.totalAssets();
      await c.vault.write.rebalance();
      assert.ok((await c.vault.read.currentDrift()) <= 20n);
      assert.ok((await c.vault.read.totalAssets()) * 1000n >= before * 997n);
    }
  });
});
