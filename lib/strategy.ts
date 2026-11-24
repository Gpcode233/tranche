import { stockByTicker } from "./stocks";

export type Slice = { ticker: string; weight: number };
export type Strategy = { name: string; slices: Slice[]; drift: number; fee: number };

export const DEFAULT_STRATEGY: Strategy = {
  name: "AI & Compute",
  slices: [
    { ticker: "NVDA", weight: 60 },
    { ticker: "AAPL", weight: 25 },
    { ticker: "TSLA", weight: 15 },
  ],
  drift: 5,
  fee: 0.1,
};

export const LIMITS = { minDrift: 1, maxDrift: 25, maxFee: 1, minWeight: 1, maxStocks: 8, minStocks: 2 };

/** `?b=NVDA-60.AAPL-25.TSLA-15&d=5&f=0.1&n=AI` */
export function encodeStrategy(s: Strategy) {
  const q = new URLSearchParams({
    b: s.slices.map((x) => `${x.ticker}-${x.weight}`).join("."),
    d: String(s.drift),
    f: String(s.fee),
    n: s.name,
  });
  return q.toString();
}

const clamp = (n: number, lo: number, hi: number, fallback: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;

/** URL input is untrusted: anything malformed falls back to the default strategy. */
export function decodeStrategy(q: URLSearchParams): Strategy {
  const raw = q.get("b");
  if (!raw) return DEFAULT_STRATEGY;
  const slices: Slice[] = [];
  for (const part of raw.split(".").slice(0, LIMITS.maxStocks)) {
    const [ticker, w] = part.split("-");
    const weight = Math.round(Number(w));
    if (!stockByTicker(ticker) || slices.some((s) => s.ticker === ticker)) continue;
    if (!(weight >= LIMITS.minWeight && weight <= 99)) continue;
    slices.push({ ticker, weight });
  }
  if (slices.length < LIMITS.minStocks || slices.reduce((a, s) => a + s.weight, 0) !== 100) {
    return DEFAULT_STRATEGY;
  }
  return {
    slices,
    name: (q.get("n") || DEFAULT_STRATEGY.name).slice(0, 48),
    drift: Math.round(clamp(Number(q.get("d") ?? 5), LIMITS.minDrift, LIMITS.maxDrift, 5) * 2) / 2,
    fee: Math.round(clamp(Number(q.get("f") ?? 0.1), 0, LIMITS.maxFee, 0.1) * 100) / 100,
  };
}

/** Move one weight; the others absorb the change in proportion. Integers, always totals 100. */
export function setWeight(slices: Slice[], index: number, next: number): Slice[] {
  const others = slices.length - 1;
  const value = Math.round(Math.min(100 - others, Math.max(1, next)));
  const rest = 100 - value;
  const oldRest = slices.reduce((a, s, i) => (i === index ? a : a + s.weight), 0);
  // Give each other stock 1%, then split what is left by its old share (largest remainder).
  const spare = rest - others;
  const exact = slices.map((s, i) => (i === index ? 0 : (spare * s.weight) / oldRest));
  const out = slices.map((s, i) => (i === index ? value : 1 + Math.floor(exact[i])));
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, r: e - Math.floor(e) }))
    .filter((o) => o.i !== index)
    .sort((a, b) => b.r - a.r);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k].i]++;
  return slices.map((s, i) => ({ ...s, weight: out[i] }));
}

export function addSlice(slices: Slice[], ticker: string): Slice[] {
  const weight = Math.floor(100 / (slices.length + 1));
  return setWeight([...slices, { ticker, weight }], slices.length, weight);
}

export function removeSlice(slices: Slice[], index: number): Slice[] {
  const kept = slices.filter((_, i) => i !== index);
  const total = kept.reduce((a, s) => a + s.weight, 0);
  const first = Math.max(1, Math.round((kept[0].weight * 100) / total));
  return setWeight(kept, 0, first);
}

export type SimRow = {
  ticker: string;
  target: number;
  weight: number;
  value: number;
  trade: number;
  past: boolean;
};

/** Same rule as TrancheVault.rebalance: any weight strictly past the band sends all to target. */
export function simulate(slices: Slice[], moves: number[], drift: number, start = 10_000) {
  const values = slices.map((s, i) => (start * s.weight * (1 + (moves[i] ?? 0) / 100)) / 100);
  const nav = values.reduce((a, b) => a + b, 0);
  const rows: SimRow[] = slices.map((s, i) => {
    const weight = (values[i] / nav) * 100;
    return {
      ticker: s.ticker,
      target: s.weight,
      weight,
      value: values[i],
      trade: (nav * s.weight) / 100 - values[i],
      past: Math.abs(weight - s.weight) > drift,
    };
  });
  const worst = Math.max(...rows.map((r) => Math.abs(r.weight - r.target)));
  return { rows, nav, worst, triggered: worst > drift };
}
