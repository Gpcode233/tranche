import type { Metadata } from "next";
import { Suspense } from "react";
import { Vault } from "@/components/vault";

export const metadata: Metadata = {
  title: "Index",
  description: "Deposit USDC into this stock index on Base. Fixed weights, fixed rules, no manager.",
};

export default function VaultPage({ params }: PageProps<"/t/[address]">) {
  return (
    <Suspense fallback={<div className="h-96 rounded-2xl bg-sunk" aria-busy="true" />}>
      {params.then(({ address }) => (
        <Vault address={address} />
      ))}
    </Suspense>
  );
}
