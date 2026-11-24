"use client";

import { useState } from "react";
import { Slabs } from "./slabs";
import { Button, Panel, Slider } from "./ui";
import { simulate, type Slice } from "@/lib/strategy";
import { stockByTicker } from "@/lib/stocks";
import { pct, usd } from "@/lib/format";

/** What-if simulator. Runs the same arithmetic as TrancheVault.rebalance, before swap costs. */
export function DriftSim({ slices, drift, initialMoves, height, wide }: {
  slices: Slice[]; drift: number; initialMoves?: number[]; height?: number; wide?: boolean;
}) {
  const [start, setStart] = useState(10_000);
  const [moves, setMoves] = useState<number[]>(initialMoves ?? []);
  const [cut, setCut] = useState<{ key: number; offcuts: number[]; trades: { ticker: string; usd: number }[] }>({ key: 0, offcuts: [], trades: [] });
  const sim = simulate(slices, moves, drift, start);

  const run = () => {
    setCut((c) => ({
      key: c.key + 1,
      offcuts: sim.rows.map((r) => Math.max(0, r.weight - r.target)),
      trades: sim.rows.map((r) => ({ ticker: r.ticker, usd: r.trade })),
    }));
    setStart(sim.nav);
    setMoves([]);
  };
  const move = (i: number, v: number) => {
    setCut((c) => ({ ...c, offcuts: [], trades: [] }));
    setMoves(slices.map((_, k) => (k === i ? v : moves[k] ?? 0)));
  };
  const trades = cut.trades.length === slices.length ? cut.trades : sim.triggered ? sim.rows.map((r) => ({ ticker: r.ticker, usd: r.trade })) : [];
  const done = cut.trades.length === slices.length;

  return (
    <Panel className="overflow-hidden">
      <div className={wide ? "grid lg:grid-cols-[1.35fr_1fr]" : ""}>
      <div className="p-4 sm:p-6">
        <Slabs rows={sim.rows} drift={drift} height={height ?? 260} cutKey={cut.key} offcuts={cut.offcuts} />
      </div>
      <div className={`border-line border-t px-4 py-3 sm:px-6 ${wide ? "lg:flex lg:flex-col lg:justify-center lg:gap-4 lg:border-t-0 lg:border-l lg:px-8" : ""}`}>
        {wide && <p className="font-display text-2xl font-medium tracking-[-0.04em]">What if prices move?</p>}
        {slices.map((s, i) => {
          const m = moves[i] ?? 0;
          return (
            <div key={s.ticker} className="grid grid-cols-[3.5rem_1fr_3.75rem] items-center gap-3">
              <span className="text-sm font-medium">{s.ticker}</span>
              <Slider
                label={`${stockByTicker(s.ticker)?.name ?? s.ticker} price change`}
                valueText={`${m}%`}
                color={stockByTicker(s.ticker)?.color}
                min={-50} max={100} step={1} value={[m]}
                onValueChange={([v]) => move(i, v)}
              />
              <span className="num text-right text-sm">{m > 0 ? "+" : ""}{m}%</span>
            </div>
          );
        })}
      </div>
      </div>
      <div className="flex min-h-[8.5rem] flex-col justify-between gap-4 border-t border-line bg-page/60 px-4 py-4 sm:min-h-[6.5rem] sm:flex-row sm:items-center sm:px-6" aria-live="polite">
        <div>
          <p className="font-display text-xl font-normal tracking-[-0.04em]">
            {done ? "Back on target." : sim.triggered ? `Drift is ${pct(sim.worst)}, past the ${drift}% line.` : `Drift is ${pct(sim.worst)}. Inside the ${drift}% band, so nothing trades.`}
          </p>
          <p className="num mt-1 text-sm text-muted">
            {trades.length
              ? trades.filter((t) => Math.abs(t.usd) >= 0.5).map((t) => `${t.usd < 0 ? (done ? "Sold" : "Sell") : done ? "Bought" : "Buy"} ${usd(Math.abs(t.usd), 0)} ${t.ticker}`).join(" · ")
              : "Drag a stock to change its price."}
          </p>
        </div>
        <Button variant="cut" onClick={run} disabled={!sim.triggered} className="shrink-0">Trim it</Button>
      </div>
    </Panel>
  );
}
