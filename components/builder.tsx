"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConnection } from "wagmi";
import { parseEventLogs } from "viem";
import { DriftSim } from "./drift-sim";
import { usePrices } from "./price-table";
import { ConnectButton, useTx } from "./wallet";
import { Button, Field, Input, Panel, Slider } from "./ui";
import { addSlice, decodeStrategy, encodeStrategy, LIMITS, removeSlice, setWeight, type Strategy } from "@/lib/strategy";
import { stockByTicker, STOCKS } from "@/lib/stocks";
import { factoryAbi } from "@/lib/abi";
import { CHAIN, FACTORY } from "@/lib/wagmi";
import { usd } from "@/lib/format";

const symbolFor = (name: string) => (name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "TRNCH") + "x";

export function Builder() {
  const params = useSearchParams();
  const router = useRouter();
  const { isConnected, chainId } = useConnection();
  const { prices } = usePrices();
  const { run, busy, error } = useTx();
  const [s, setS] = useState<Strategy>(() => decodeStrategy(new URLSearchParams(params)));
  const [copied, setCopied] = useState(false);

  const update = (patch: Partial<Strategy>) => {
    const next = { ...s, ...patch };
    setS(next);
    setCopied(false);
    window.history.replaceState(null, "", `/build?${encodeStrategy(next)}`);
  };
  const unused = STOCKS.filter((x) => !s.slices.some((y) => y.ticker === x.ticker));
  const name = s.name.trim();
  // The contract limits the name by bytes, not characters.
  const nameOk = name.length > 0 && new TextEncoder().encode(name).length <= 48;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/build?${encodeStrategy(s)}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const create = async () => {
    if (!FACTORY) return;
    const receipt = await run("create", {
      address: FACTORY,
      abi: factoryAbi,
      functionName: "create",
      args: [
        name, symbolFor(name),
        s.slices.map((x) => stockByTicker(x.ticker)!.token),
        s.slices.map((x) => x.weight * 100),
        BigInt(Math.round(s.drift * 100)), BigInt(Math.round(s.fee * 100)),
      ],
    });
    if (!receipt) return;
    const [log] = parseEventLogs({ abi: factoryAbi, eventName: "TrancheCreated", logs: receipt.logs });
    if (log) router.push(`/t/${log.args.vault}`);
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
      <div className="space-y-8">
        <Field label="Name">
          <Input value={s.name} maxLength={48} onChange={(e) => update({ name: e.target.value })} />
        </Field>

        <section>
          <h2 className="text-2xl">Weights</h2>
          <Panel className="mt-4 divide-y divide-line">
            {s.slices.map((x, i) => {
              const stock = stockByTicker(x.ticker)!;
              return (
                <div key={x.ticker} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-medium">{x.ticker}</span>{" "}
                      <span className="num text-sm text-muted">{prices[x.ticker] ? usd(prices[x.ticker]!, 2) : stock.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="num font-display text-2xl font-medium">{x.weight}%</span>
                      <Button variant="ghost" size="sm" className="w-10 px-0 text-muted" aria-label={`Remove ${stock.name}`}
                        disabled={s.slices.length <= LIMITS.minStocks} onClick={() => update({ slices: removeSlice(s.slices, i) })}>
                        <svg viewBox="0 0 16 16" className="size-4" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                      </Button>
                    </div>
                  </div>
                  <Slider label={`${stock.name} weight`} valueText={`${x.weight}%`} color={stock.color} min={1} max={101 - s.slices.length} step={1}
                    value={[x.weight]} onValueChange={([v]) => update({ slices: setWeight(s.slices, i, v) })} />
                </div>
              );
            })}
          </Panel>
          {unused.length > 0 && s.slices.length < LIMITS.maxStocks && (
            <div className="mt-4 flex flex-wrap gap-2">
              {unused.map((x) => (
                <Button key={x.ticker} variant="outline" size="sm" onClick={() => update({ slices: addSlice(s.slices, x.ticker) })}>
                  <span className="h-4 w-2.5 rounded-[2px]" style={{ background: x.color }} /> Add {x.ticker}
                </Button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-2xl">Rules</h2>
          <Panel className="mt-4 divide-y divide-line">
            <div className="px-4 py-3 sm:px-5">
              <div className="flex items-baseline justify-between"><span className="font-medium">Drift line</span><span className="num font-display text-2xl font-medium">{s.drift}%</span></div>
              <Slider label="Drift line" valueText={`${s.drift}%`} color="var(--cut)" min={1} max={25} step={0.5} value={[s.drift]} onValueChange={([v]) => update({ drift: v })} />
              <p className="text-sm text-muted">Rebalance when any stock is more than this far from its weight. Lower means more trades and more swap costs.</p>
            </div>
            <div className="px-4 py-3 sm:px-5">
              <div className="flex items-baseline justify-between"><span className="font-medium">Your fee</span><span className="num font-display text-2xl font-medium">{s.fee}%</span></div>
              <Slider label="Creator fee" valueText={`${s.fee}%`} min={0} max={1} step={0.05} value={[s.fee]} onValueChange={([v]) => update({ fee: Math.round(v * 100) / 100 })} />
              <p className="text-sm text-muted">Taken once from each deposit, including yours, and paid to your wallet.</p>
            </div>
          </Panel>
        </section>
      </div>

      <div className="space-y-6 lg:sticky lg:top-24">
        <div>
          <h2 className="text-2xl">Try it</h2>
          <p className="mt-2 mb-4 text-muted">See what your rule would do with $10,000, before swap costs.</p>
          <DriftSim key={s.slices.map((x) => x.ticker).join()} slices={s.slices} drift={s.drift} height={200} />
        </div>
        <Panel className="p-5">
          <p className="text-muted">Weights and rules are permanent once created. To change them, make a new index.</p>
          {!FACTORY && <p className="mt-3 font-medium">Contracts aren’t live on {CHAIN.name} yet. You can still design and share this index.</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            {FACTORY && (isConnected && chainId === CHAIN.id
              ? <Button className="grow" disabled={!!busy || !nameOk} onClick={create}>{busy ? "Creating" : "Create index"}</Button>
              : <ConnectButton size="md" variant="primary" className="grow" />)}
            <Button variant={FACTORY ? "outline" : "primary"} className="grow" onClick={copy}>{copied ? "Link copied" : "Copy design link"}</Button>
          </div>
          {!nameOk && <p className="mt-3 text-sm font-medium">Give your index a name of up to 48 characters.</p>}
          {error && <p role="alert" className="mt-3 text-sm font-medium">{error}</p>}
        </Panel>
      </div>
    </div>
  );
}
