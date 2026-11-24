"use client";

import { useReadContracts } from "wagmi";
import { STOCKS } from "@/lib/stocks";
import { feedAbi } from "@/lib/abi";
import { CHAIN } from "@/lib/wagmi";
import { usd } from "@/lib/format";

export function usePrices() {
  const { data, isPending } = useReadContracts({
    contracts: STOCKS.map((s) => ({ address: s.feed, abi: feedAbi, functionName: "latestRoundData", chainId: CHAIN.id }) as const),
    query: { refetchInterval: 60_000 },
  });
  const prices = Object.fromEntries(
    STOCKS.map((s, i) => [s.ticker, data?.[i]?.status === "success" ? Number(data[i].result[1]) / 1e8 : undefined]),
  ) as Record<string, number | undefined>;
  return { prices, isPending };
}

/** Running line of supported stocks with live prices. Widths are reserved so nothing jumps. */
export function PriceFlow() {
  const { prices } = usePrices();
  return (
    <ul className="flex flex-wrap justify-center gap-3">
      {STOCKS.map((s) => (
        <li key={s.ticker} className="flex items-center gap-3 rounded-full bg-panel py-2.5 pr-6 pl-3 text-[1.35rem] font-medium tracking-[-0.03em]">
          <span className="h-9 w-6 rounded-full" style={{ background: s.color }} />
          {s.name}
          <span className="num inline-block min-w-[4.4rem] text-left text-[17px] font-normal tracking-normal text-muted">
            {prices[s.ticker] ? usd(prices[s.ticker]!, 2) : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
