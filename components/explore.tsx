"use client";

import Link from "next/link";
import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { factoryAbi, vaultAbi } from "@/lib/abi";
import { stockByToken } from "@/lib/stocks";
import { CHAIN, FACTORY } from "@/lib/wagmi";
import { pct, short, usdc } from "@/lib/format";
import { MixBar } from "./slabs";
import { Button, ButtonLink, Panel } from "./ui";

const PAGE = 24;
const FIELDS = ["name", "creator", "driftBps", "currentDrift", "guardStatus", "holdings"] as const;

export function Explore() {
  const [limit, setLimit] = useState(PAGE);
  const list = useReadContract({ address: FACTORY, abi: factoryAbi, functionName: "latest", args: [0n, BigInt(limit)], chainId: CHAIN.id, query: { enabled: !!FACTORY, placeholderData: (p) => p } });
  const vaults = list.data ?? [];
  const reads = useReadContracts({
    contracts: vaults.flatMap((address) => FIELDS.map((functionName) => ({ address, abi: vaultAbi, functionName, chainId: CHAIN.id }) as const)),
    query: { enabled: vaults.length > 0 },
  });

  if (!FACTORY || (list.isSuccess && vaults.length === 0)) {
    return (
      <Panel className="px-6 py-16 text-center">
        <h2 className="text-3xl">{FACTORY ? "No indexes yet." : `Not live on ${CHAIN.name} yet.`}</h2>
        <p className="mx-auto mt-3 max-w-sm text-muted">{FACTORY ? "Make the first one. It takes a minute." : "Design your index now and share the link. It’ll be ready when the contracts are."}</p>
        <ButtonLink href="/build" className="mt-6">Build an index</ButtonLink>
      </Panel>
    );
  }
  if (list.isError) return <Panel className="p-6">Couldn’t reach {CHAIN.name}. <button type="button" className="link font-medium" onClick={() => list.refetch()}>Try again</button></Panel>;
  if (list.isPending || (vaults.length > 0 && reads.isPending)) return <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-sunk" />)}</div>;

  return (
    <>
      <ul className="divide-y divide-line border-y border-line">
        {vaults.map((address, i) => {
          const get = <T,>(f: (typeof FIELDS)[number]) => reads.data?.[i * FIELDS.length + FIELDS.indexOf(f)]?.result as T | undefined;
          const holdings = get<readonly [readonly { token: string; targetBps: bigint }[], bigint, bigint]>("holdings");
          const rows = (holdings?.[0] ?? []).map((h) => ({ ticker: stockByToken(h.token)?.ticker ?? short(h.token), weight: Number(h.targetBps) / 100 }));
          const drift = Number(get<bigint>("currentDrift") ?? 0n) / 100;
          const line = Number(get<bigint>("driftBps") ?? 0n) / 100;
          const creator = get<string>("creator");
          return (
            <li key={address}>
              <Link href={`/t/${address}`} className="grid gap-4 py-6 hover:bg-sunk/60 md:grid-cols-[1.1fr_1.4fr_8rem_9rem] md:items-center md:gap-8 md:px-3">
                <span className="min-w-0">
                  <span className="line-clamp-2 font-display text-2xl leading-tight font-medium tracking-[-0.04em] break-words">{get<string>("name") ?? short(address)}</span>
                  {creator && <span className="num text-sm text-muted">by {short(creator)}</span>}
                </span>
                <span>
                  <MixBar rows={rows} />
                  <span className="num mt-2 block text-sm text-muted">{rows.map((r) => `${r.ticker} ${r.weight}%`).join(" · ")}</span>
                </span>
                <span className="num text-sm"><span className={`block font-medium ${drift > line ? "hot" : ""}`}>{pct(drift)} drift</span><span className="text-muted">line at {line}%</span></span>
                <span className="num md:text-right"><span className="block font-display text-2xl font-medium">{holdings ? usdc(holdings[2]) : "–"}</span><span className="text-sm text-muted">{get<number>("guardStatus") === 0 ? "Running" : "Paused"}</span></span>
              </Link>
            </li>
          );
        })}
      </ul>
      {vaults.length === limit && <Button variant="outline" className="mt-6" onClick={() => setLimit((l) => l + PAGE)}>Show more</Button>}
    </>
  );
}
