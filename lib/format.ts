import { formatUnits } from "viem";

export const usd = (n: number, digits = n < 1000 ? 2 : 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
export const usdc = (v: bigint) => usd(Number(formatUnits(v, 6)));
export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** First human-readable line of a wallet or contract error. */
export function errorText(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string } } };
  const name = err?.cause?.data?.errorName;
  if (name === "GuardTripped") return "The circuit breaker is on. Try again when the market reopens.";
  if (name === "WithinDrift") return "Every stock is inside its band. Nothing to rebalance.";
  if (name === "CoolingDown") return "Rebalanced less than an hour ago.";
  if (name === "ValueLost") return "The price moved past your minimum. Nothing was traded; try again.";
  if (name === "Expired") return "That took too long, so it was cancelled. Try again.";
  if (name === "TooSmall") return "Amount is too small.";
  const text = err?.shortMessage || err?.message || "Something went wrong.";
  if (/rejected|denied/i.test(text)) return "You cancelled the request.";
  if (/Too little received/i.test(text)) return "The pool would fill more than 1% away from the market price. Try a smaller amount.";
  return text.split("\n")[0];
}
