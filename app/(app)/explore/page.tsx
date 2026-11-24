import type { Metadata } from "next";
import { Explore } from "@/components/explore";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <>
      <h1 className="mb-8 text-[clamp(2.75rem,1.6rem+4.5vw,5rem)] tracking-[-0.06em]">Explore</h1>
      <Explore />
    </>
  );
}
