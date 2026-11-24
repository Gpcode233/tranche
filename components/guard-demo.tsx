"use client";

import { useState } from "react";
import { Slider } from "./ui";

// Mirrors OPEN_GAP_BPS and CLOSED_GAP_BPS in MarketGuard.sol.
const DAYS = [
  { id: "open", label: "Wednesday", limit: 1.5 },
  { id: "closed", label: "Saturday", limit: 0.5 },
] as const;

export function GuardDemo() {
  const [day, setDay] = useState<(typeof DAYS)[number]>(DAYS[1]);
  const [gap, setGap] = useState(1);
  const ok = gap <= day.limit;
  return (
    <div className="rounded-[28px] bg-panel p-5 text-ink sm:rounded-[40px] sm:p-9">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-sunk p-1" role="group" aria-label="Day of week">
        {DAYS.map((d) => (
          <button key={d.id} type="button" aria-pressed={d.id === day.id} onClick={() => setDay(d)}
            className={`btn h-11 rounded-full font-medium ${d.id === day.id ? "bg-panel" : "text-muted"}`}>
            {d.label}
          </button>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">NVDA pool price against the last official price</p>
      <div className="num mt-2 font-display text-5xl font-medium tracking-[-0.04em]">+{gap.toFixed(1)}%</div>
      <Slider className="mt-3" label="Price gap" valueText={`${gap.toFixed(1)}%`} min={0} max={4} step={0.1} value={[gap]} onValueChange={([v]) => setGap(v)} />
      <div className="mt-5 min-h-[5.5rem] border-t border-line pt-5" aria-live="polite">
        <p className={`font-display text-2xl font-normal ${ok ? "text-good" : "hot ml-0 w-fit"}`}>{ok ? "Running" : "Paused"}</p>
        <p className="mt-2 text-muted">
          {ok ? `Inside the ${day.limit}% limit for ${day.label}.` : `Past the ${day.limit}% limit for ${day.label}. No trades until prices agree.`}
        </p>
      </div>
    </div>
  );
}
