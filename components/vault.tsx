"use client";

import { useState } from "react";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, formatUnits, isAddress, parseUnits, type Address } from "viem";
import { factoryAbi, GUARD_TEXT, vaultAbi } from "@/lib/abi";
import { stockByToken } from "@/lib/stocks";
import { CHAIN, explorer, FACTORY, isLocal, USDC } from "@/lib/wagmi";
import { pct, short, usdc } from "@/lib/format";
import { encodeStrategy } from "@/lib/strategy";
import { cn } from "@/lib/cn";
import { Slabs } from "./slabs";
import { ConnectButton, useTx } from "./wallet";
import { Button, ButtonLink, Field, Input, Panel } from "./ui";

const FIELDS = ["name", "creator", "driftBps", "creatorFeeBps", "guardStatus", "currentDrift", "canRebalance", "holdings", "totalSupply", "lastRebalance"] as const;

export function Vault({ address }: { address: string }) {
  if (!isAddress(address)) return <NotFound />;
  return <VaultChecked address={address} />;
}

const NotFound = () => (
  <Panel className="px-6 py-16 text-center">
    <h1 className="text-3xl">No index at this address.</h1>
    <p className="mt-3 text-muted">Only indexes made by the Tranche contract open here. Check the link.</p>
    <ButtonLink href="/explore" className="mt-6">Explore indexes</ButtonLink>
  </Panel>
);

/** A share link can carry any address, so confirm the factory made it before offering deposits. */
function VaultChecked({ address }: { address: Address }) {
  const known = useReadContract({ address: FACTORY, abi: factoryAbi, functionName: "isVault", args: [address], chainId: CHAIN.id, query: { enabled: !!FACTORY, staleTime: Infinity } });
  if (!FACTORY || known.data === false) return <NotFound />;
  if (known.isError) return <Panel className="p-6">Couldn’t reach {CHAIN.name}. <button type="button" className="link font-medium" onClick={() => known.refetch()}>Try again</button></Panel>;
  if (known.isPending) return <div className="h-96 rounded-2xl bg-sunk" aria-busy="true" />;
  return <VaultView address={address} />;
}

function VaultView({ address }: { address: Address }) {
  const { address: me, isConnected, chainId } = useConnection();
  const ready = isConnected && chainId === CHAIN.id && !!me;
  const tx = useTx();
  const [copied, setCopied] = useState(false);

  const q = useReadContracts({
    allowFailure: false,
    contracts: FIELDS.map((functionName) => ({ address, abi: vaultAbi, functionName, chainId: CHAIN.id }) as const),
    query: { refetchInterval: 30_000 },
  });
  if (q.isError) return <Panel className="p-6">Couldn’t load this index. <button type="button" className="link font-medium" onClick={() => q.refetch()}>Try again</button></Panel>;
  if (!q.data) return <div className="h-96 rounded-2xl bg-sunk" aria-busy="true" />;

  const [name, creator, driftBps, feeBps, guard, drift, canRebalance, [held, idle, nav], supply, last] = q.data as unknown as [
    string, Address, bigint, bigint, number, bigint, boolean,
    [{ token: Address; balance: bigint; value: bigint; targetBps: bigint; currentBps: bigint; status: number }[], bigint, bigint], bigint, bigint,
  ];
  const line = Number(driftBps) / 100;
  const label = (t: string) => stockByToken(t)?.ticker ?? short(t);
  const rows = held.map((h) => ({
    ticker: label(h.token),
    target: Number(h.targetBps) / 100,
    weight: supply === 0n ? Number(h.targetBps) / 100 : Number(h.currentBps) / 100,
  }));
  const tripped = held.filter((h) => h.status !== 0).map((h) => label(h.token));
  const remix = encodeStrategy({ name: `${name} remix`.slice(0, 48), drift: line, fee: Number(feeBps) / 100, slices: rows.map((r) => ({ ticker: r.ticker, weight: r.target })) });

  const share = async () => {
    const url = `${location.origin}/t/${address}`;
    try {
      if (navigator.share) await navigator.share({ title: `${name} on Tranche`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      // Share sheet dismissed or clipboard blocked; nothing to recover.
    }
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[clamp(2.75rem,1.6rem+4.5vw,5rem)] tracking-[-0.06em] break-words">{name}</h1>
            <p className="num mt-2 text-muted">
              by {isLocal ? short(creator) : <a className="link" href={explorer(creator)}>{short(creator)}</a>}
              {!isLocal && <> · <a className="link" href={explorer(address)}>contract</a></>}
            </p>
          </div>
          <Button variant="outline" onClick={share}>{copied ? "Link copied" : "Share"}</Button>
        </div>

        <div className="mt-8 flex flex-wrap gap-x-12 gap-y-5">
          <Stat label="In this index" value={usdc(nav)} big />
          <Stat label={`Drift, line at ${line}%`} value={pct(Number(drift) / 100)} hot={drift > driftBps} />
          <Stat label="Creator fee" value={pct(Number(feeBps) / 100, 2)} />
        </div>

        <Panel className="mt-8 overflow-hidden">
          <div className="p-4 sm:p-6"><Slabs rows={rows} drift={line} height={250} /></div>
          <div className="flex flex-col gap-4 border-t border-line bg-sunk/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className={cn("font-medium", guard === 0 ? "text-good" : "hot")}>
                {guard === 0 ? "Running" : "Paused"}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {guard !== 0 ? `${GUARD_TEXT[guard]}${tripped.length ? ` (${tripped.join(", ")})` : ""}.`
                  : canRebalance ? (ready ? "Past the line. Anyone can trim it." : "Past the line. Connect a wallet to trim it; anyone can.")
                  : drift > driftBps && supply > 0n ? "Past the line. Waiting out the one-hour gap between trims."
                  : "Every stock is inside its band."}
                {last > 0n && ` Last trim ${new Date(Number(last) * 1000).toLocaleString()}.`}
              </p>
            </div>
            <Button variant={canRebalance ? "cut" : "outline"} className="shrink-0" disabled={!canRebalance || !ready || !!tx.busy}
              onClick={() => tx.run("rebalance", { address, abi: vaultAbi, functionName: "rebalance" })}>
              {tx.busy === "rebalance" ? "Trimming" : "Trim it"}
            </Button>
          </div>
          {tx.error && <p role="alert" className="border-t border-line px-4 py-3 text-sm font-medium sm:px-6">{tx.error}</p>}
        </Panel>
        <p className="mt-4 text-sm text-muted">
          {idle >= 10_000n && `${usdc(idle)} waiting in USDC. `}
          <a className="link" href={`/build?${remix}`}>Make your own version</a>
        </p>
      </div>
      <Position address={address} me={ready ? me : undefined} paused={guard !== 0} feeBps={feeBps} held={held} />
    </div>
  );
}

const Stat = ({ label, value, big, hot }: { label: string; value: string; big?: boolean; hot?: boolean }) => (
  <div>
    <div className="text-sm text-muted">{label}</div>
    <div className={cn("num mt-1 font-display leading-tight font-medium tracking-[-0.04em]", big ? "text-4xl" : "text-2xl", hot && "font-normal hot")}>{value}</div>
  </div>
);

function parse(v: string, decimals: number) {
  return /^\d*\.?\d*$/.test(v) && /\d/.test(v) ? parseUnits(v.replace(new RegExp(`(\\.\\d{${decimals}})\\d+`), "$1"), decimals) : 0n;
}

/** Signed transactions that sit unmined for 20 minutes should fail, not fill at a new price. */
const expiry = () => BigInt(Math.floor(Date.now() / 1000) + 1200);

function Position({ address, me, paused, feeBps, held }: {
  address: Address; me?: Address; paused: boolean; feeBps: bigint; held: { token: Address; balance: bigint }[];
}) {
  const [tab, setTab] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState(100);
  const [done, setDone] = useState<string | null>(null);
  const tx = useTx();

  const user = useReadContracts({
    allowFailure: false,
    contracts: [
      { address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [me!], chainId: CHAIN.id },
      { address: USDC, abi: erc20Abi, functionName: "allowance", args: [me!, address], chainId: CHAIN.id },
      { address, abi: vaultAbi, functionName: "balanceOf", args: [me!], chainId: CHAIN.id },
    ],
    query: { enabled: !!me },
  });
  const [cash = 0n, allowance = 0n, shares = 0n] = user.data ?? [];
  const worth = useReadContract({ address, abi: vaultAbi, functionName: "convertToAssets", args: [shares], chainId: CHAIN.id, query: { enabled: shares > 0n } });

  const value = parse(amount, 6);
  const part = (shares * BigInt(percent)) / 100n;
  const preview = useReadContract({ address, abi: vaultAbi, functionName: "previewRedeem", args: [part], chainId: CHAIN.id, query: { enabled: part > 0n && !paused } });
  const quote = useReadContract({ address, abi: vaultAbi, functionName: "previewDeposit", args: [value], chainId: CHAIN.id, query: { enabled: value > 0n && !paused } });
  const problem = value > cash ? "That’s more USDC than you have." : value > 0n && value < 1_000_000n ? "The minimum is 1 USDC." : null;
  const fee = (value * feeBps + 9_999n) / 10_000n;

  const deposit = async () => {
    setDone(null);
    if (allowance < value && !(await tx.run("approve", { address: USDC, abi: erc20Abi, functionName: "approve", args: [address, value] }))) return;
    if (await tx.run("deposit", { address, abi: vaultAbi, functionName: "depositMin", args: [value, me!, quote.data!, expiry()] })) {
      setDone(`You’re in. ${usdc(value - fee)} went into ${held.length} stocks.`);
      setAmount("");
    }
  };
  const redeem = async () => {
    setDone(null);
    if (await tx.run("redeem", { address, abi: vaultAbi, functionName: "redeemMin", args: [part, me!, me!, preview.data!, expiry()] })) setDone("Done. Your USDC is in your wallet.");
  };
  const inKind = async () => {
    setDone(null);
    if (await tx.run("kind", { address, abi: vaultAbi, functionName: "redeemInKind", args: [part, me!, me!, 0n] })) setDone("Done. Your stocks are in your wallet.");
  };

  return (
    <Panel className="p-5 sm:p-6 lg:sticky lg:top-24">
      <div className="text-sm text-muted">Your share</div>
      <div className="num mt-1 font-display text-4xl font-medium tracking-[-0.04em]">{shares > 0n && worth.data !== undefined ? usdc(worth.data) : "$0.00"}</div>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-sunk p-1" role="group" aria-label="Action">
        {(["in", "out"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => { setTab(t); setDone(null); }}
            className={cn("btn h-11 rounded-full font-medium", tab === t ? "bg-panel" : "text-muted")}>{t === "in" ? "Deposit" : "Take out"}</button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {tab === "in" ? (
          <>
            <Field label="USDC">
              <Input inputMode="decimal" placeholder="100" value={amount} aria-invalid={!!problem} onChange={(e) => setAmount(e.target.value.replace(",", "."))} className="num text-xl" />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              {["50", "100", "500"].map((v) => <Button key={v} size="sm" variant="outline" onClick={() => setAmount(v)}>${v}</Button>)}
              {me && <Button size="sm" variant="ghost" onClick={() => setAmount(formatUnits(cash, 6))}>All {usdc(cash)}</Button>}
            </div>
            <dl className="num space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Creator fee</dt><dd>{usdc(fee)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Invested, before swap costs</dt><dd>{usdc(value - fee)}</dd></div>
            </dl>
            {!me ? <ConnectButton size="md" variant="primary" className="w-full" /> : (
              <Button className="w-full" disabled={paused || quote.data === undefined || value < 1_000_000n || !!problem || !!tx.busy} onClick={deposit}>
                {tx.busy === "approve" ? "Approve in your wallet" : tx.busy === "deposit" ? "Depositing" : paused ? "Paused" : "Deposit"}
              </Button>
            )}
            {problem && me && <p className="text-sm font-medium">{problem}</p>}
            {paused && <p className="text-sm text-muted">Deposits reopen when pool prices match the market again.</p>}
          </>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((p) => <Button key={p} size="sm" variant={p === percent ? "ink" : "outline"} aria-pressed={p === percent} className="px-0" onClick={() => setPercent(p)}>{p}%</Button>)}
            </div>
            {!me ? <ConnectButton size="md" variant="primary" className="w-full" /> : (
              <>
                <div>
                  <Button className="w-full" disabled={paused || preview.data === undefined || part === 0n || !!tx.busy} onClick={redeem}>{tx.busy === "redeem" ? "Selling" : "Take out as USDC"}</Button>
                  <p className="num mt-2 text-sm text-muted">{paused ? "Paused until prices agree." : part > 0n && preview.data !== undefined ? `You get at least ${usdc(preview.data)}.` : "Deposit first to take out."}</p>
                </div>
                <div>
                  <Button variant="outline" className="w-full" disabled={part === 0n || !!tx.busy} onClick={inKind}>{tx.busy === "kind" ? "Sending" : "Take out as stocks"}</Button>
                  <p className="mt-2 text-sm text-muted">Your exact slice, no swap. Not stopped by the breaker.</p>
                </div>
              </>
            )}
          </>
        )}
        <div aria-live="polite">
          {done && <p className="rounded-lg bg-sunk p-3 font-medium">{done}</p>}
          {tx.error && <p className="text-sm font-medium">{tx.error}</p>}
        </div>
      </div>
    </Panel>
  );
}
