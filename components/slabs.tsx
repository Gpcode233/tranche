"use client";

import { stockByTicker } from "@/lib/stocks";
import { pct } from "@/lib/format";

export type SlabRow = { ticker: string; target: number; weight: number };

/** The cut-line chart: one slab per stock, the band as a dashed line, overhang in the accent. */
export function Slabs({
  rows, drift, height = 300, cutKey = 0, offcuts = [],
}: { rows: SlabRow[]; drift: number; height?: number; cutKey?: number; offcuts?: number[] }) {
  const top = Math.max(...rows.map((r) => Math.max(r.weight, r.target + drift, r.target + (offcuts[rows.indexOf(r)] ?? 0)))) * 1.1;
  const y = (n: number) => (n / top) * height;
  return (
    <div
      role="img"
      aria-label={rows.map((r) => `${r.ticker} ${pct(r.weight)}, target ${r.target}%`).join("; ")}
      className={`grid sm:gap-4 ${rows.length > 4 ? "gap-1" : "gap-2"}`}
      style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
    >
      {rows.map((r, i) => {
        const limit = r.target + drift;
        const floor = r.target - drift;
        const over = Math.max(0, r.weight - limit);
        const under = r.weight < floor;
        const off = offcuts[i] ?? 0;
        return (
          <div key={r.ticker} className="min-w-0">
            <div className="relative" style={{ height }}>
              <div
                className="slab absolute inset-x-0 bottom-0 rounded-t-[26px]"
                style={{ background: stockByTicker(r.ticker)?.color, height: y(over > 0 ? limit : r.weight), borderTopLeftRadius: over > 0 ? 0 : undefined, borderTopRightRadius: over > 0 ? 0 : undefined }}
              />
              {over > 0 && (
                <div className="absolute inset-x-0 rounded-t-[26px] border-2 border-b-0 border-ink bg-cut" style={{ bottom: y(limit), height: Math.max(3, y(over)) }} />
              )}
              {cutKey > 0 && off > 0 && (
                <div key={cutKey} className="offcut absolute inset-x-0 rounded-[18px] border-2 border-ink bg-cut" style={{ bottom: y(r.target), height: Math.max(4, y(off)) }} />
              )}
              <div className="absolute -inset-x-1 border-t-2 border-dashed border-ink" style={{ bottom: y(limit) }} />
              {floor > 0 && (
                <div className={`absolute -inset-x-1 border-t-2 border-dashed ${under ? "border-ink" : "border-white/45"}`} style={{ bottom: y(floor) }} />
              )}
            </div>
            <div className="border-t-2 border-ink pt-2.5">
              <div className={`truncate font-medium ${rows.length > 4 ? "text-[10px] tracking-[-0.04em] sm:text-sm" : "text-sm"}`}>{r.ticker}</div>
              <div className={`num font-display ${rows.length > 4 ? "text-[clamp(0.75rem,0.5rem+1vw,1.25rem)]" : "text-[clamp(1.35rem,0.9rem+1.8vw,2.4rem)]"} leading-tight ${rows.length > 4 ? "font-normal" : over > 0 || under ? "mt-1" : "mt-1 font-medium"} ${over > 0 || under ? "font-normal hot" : ""}`}>
                {pct(r.weight, rows.length > 4 ? 0 : 1)}
              </div>
              <div className="num text-xs text-muted sm:text-sm">{rows.length > 4 ? "" : "target "}{r.target}%</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Thin proportional bar for lists. */
export function MixBar({ rows, className = "" }: { rows: { ticker: string; weight: number }[]; className?: string }) {
  return (
    <div className={`flex gap-0.5 overflow-hidden rounded-full ${className || "h-3"}`} aria-hidden>
      {rows.map((r) => (
        <div key={r.ticker} style={{ flexGrow: r.weight, flexBasis: 0, background: stockByTicker(r.ticker)?.color }} />
      ))}
    </div>
  );
}
