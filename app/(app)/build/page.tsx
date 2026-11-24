import type { Metadata } from "next";
import { Suspense } from "react";
import { Builder } from "@/components/builder";

export const metadata: Metadata = { title: "Build an index" };

export default function BuildPage() {
  return (
    <>
      <h1 className="mb-8 text-[clamp(2.75rem,1.6rem+4.5vw,5rem)] tracking-[-0.06em]">Build an index</h1>
      <Suspense fallback={<div className="h-[40rem] rounded-2xl bg-sunk" aria-busy="true" />}>
        <Builder />
      </Suspense>
    </>
  );
}
