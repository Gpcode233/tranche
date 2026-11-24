"use client";

import { useEffect, useRef, useState } from "react";
import { useConfig, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain, useWriteContract, type Config } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import type { TransactionReceipt } from "viem";
import { CHAIN } from "@/lib/wagmi";
import { errorText, short } from "@/lib/format";
import { Button } from "./ui";

export function ConnectButton({ className, size = "sm", variant = "ink" }: { className?: string; size?: "sm" | "md"; variant?: "ink" | "primary" }) {
  const { address, isConnected, chainId } = useConnection();
  const { mutate: connect, isPending, error } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain } = useSwitchChain();
  const connectors = useConnectors();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isConnected && chainId !== CHAIN.id) {
    return <Button size={size} className={className} onClick={() => switchChain({ chainId: CHAIN.id })}>Switch to {CHAIN.name}</Button>;
  }
  // Wallets announced by the browser (EIP-6963); the generic one is only a fallback.
  const named = connectors.filter((c) => c.id !== "injected");
  const wallets = named.length ? named : connectors;
  return (
    <div ref={box} className={`relative ${className ?? ""}`}>
      <Button size={size} variant={variant} className="w-full" aria-expanded={open} disabled={isPending} onClick={() => setOpen((o) => !o)}>
        {isConnected && address ? <span className="num">{short(address)}</span> : isPending ? "Connecting" : "Connect wallet"}
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-line bg-panel p-1.5 shadow-[0_12px_32px_oklch(0.24_0.018_255/0.16)]">
          {isConnected ? (
            <Button variant="ghost" className="w-full" onClick={() => { disconnect({}); setOpen(false); }}>Disconnect</Button>
          ) : (
            <>
              {wallets.map((c) => (
                <Button key={c.uid} variant="ghost" className="w-full justify-start" onClick={() => connect({ connector: c, chainId: CHAIN.id }, { onSuccess: () => setOpen(false) })}>
                  {c.id === "injected" ? "Browser wallet" : c.name}
                </Button>
              ))}
              {error && <p className="px-3 py-2 text-sm font-medium">{/provider not found/i.test(error.message) ? "No wallet found in this browser. Install one, or open this page in a wallet app." : errorText(error)}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Write = Parameters<ReturnType<typeof useWriteContract>["mutateAsync"]>[0];

/** Send a transaction, wait for it, refresh every read. */
export function useTx() {
  const config = useConfig() as Config;
  const queries = useQueryClient();
  const { mutateAsync } = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (label: string, request: Write): Promise<TransactionReceipt | null> => {
    setError(null);
    setBusy(label);
    try {
      const hash = await mutateAsync({ ...request, chainId: CHAIN.id } as Write);
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: CHAIN.id });
      if (receipt.status !== "success") throw new Error("Transaction failed onchain.");
      await queries.invalidateQueries();
      return receipt;
    } catch (e) {
      setError(errorText(e));
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { run, busy, error };
}
