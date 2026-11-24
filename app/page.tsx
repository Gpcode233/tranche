import Image from "next/image";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { DriftSim } from "@/components/drift-sim";
import { GuardDemo } from "@/components/guard-demo";
import { PriceFlow } from "@/components/price-table";
import { MixBar } from "@/components/slabs";
import { ButtonLink } from "@/components/ui";
import { DEFAULT_STRATEGY, encodeStrategy } from "@/lib/strategy";
import amaka from "@/public/art/amaka.webp";
import garden from "@/public/art/garden.webp";
import mei from "@/public/art/mei.webp";
import night from "@/public/art/night.webp";
import same from "@/public/art/same.webp";
import share from "@/public/art/share.webp";
import tunde from "@/public/art/tunde.webp";

const CURATORS = [
  { art: amaka, who: "Amaka", bg: "#8ed462", line: "Writes software, and believes chips run the next decade.", name: "AI & Compute", drift: 5, slices: [["NVDA", 60], ["AAPL", 25], ["TSLA", 15]] },
  { art: tunde, who: "Tunde", bg: "#2ba0ff", line: "Sees every business he knows moving to the cloud.", name: "Cloud Three", drift: 4, slices: [["MSFT", 40], ["AMZN", 35], ["GOOGL", 25]] },
  { art: mei, who: "Mei", bg: "#dcb8ff", line: "Won’t pick a favourite, so she planted seven the same size.", name: "Equal Seven", drift: 3, slices: [["NVDA", 15], ["AAPL", 15], ["MSFT", 14], ["GOOGL", 14], ["AMZN", 14], ["META", 14], ["TSLA", 14]] },
].map((s) => ({ ...s, fee: 0.1, slices: s.slices.map(([ticker, weight]) => ({ ticker: String(ticker), weight: Number(weight) })) }));

const RULES = [
  ["When", "Any stock is further from its weight than your line, and an hour has passed since the last trim."],
  ["Trim", "Sell only what each stock holds above its weight."],
  ["Feed", "Buy the ones below their weight, in proportion to what they lack."],
  ["Never", "Trade more than 1% worse than Chainlink’s price. It’s cancelled instead."],
];

const H2 = "text-[clamp(2.75rem,1.4rem+5.6vw,5.06rem)] tracking-[-0.06em]";
const LEAD = "mt-6 max-w-lg text-lg leading-[1.5] sm:text-xl sm:leading-[1.5]";

export default function Home() {
  return (
    <>
      <SiteHeader tone="grass" />
      <main>
        <section className="-mt-24 overflow-hidden bg-grass pt-24">
          <div className="mx-auto max-w-6xl px-4 pt-12 text-center sm:px-6 sm:pt-16">
            <h1 className="text-[clamp(3.6rem,1rem+10.5vw,9rem)] leading-[0.95] tracking-[-0.06em]">Grow your own index</h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-[1.45] sm:text-xl sm:leading-[1.45]">
              Choose the stocks you believe in. Decide how much of each. Tranche keeps your personal index fund in shape.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/build" size="lg" variant="outline" className="border-transparent">Start growing</ButtonLink>
            </div>
          </div>
          <Image src={garden} alt="Three friends tending hedges of different heights: one trims the tallest, one waters, one lifts a new sprout" priority
            sizes="(max-width: 768px) 170vw, 1300px" className="mx-auto mt-6 w-[170vw] max-w-none -translate-x-[4vw] sm:mt-2 sm:w-[min(96vw,1300px)] sm:translate-x-0" />
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-2 lg:gap-16">
          <Image src={same} alt="A man shrugging between shelves of identical grey plants, glancing at one small colourful sprout" sizes="(max-width: 1024px) 92vw, 560px" className="order-2 lg:order-1" />
          <div className="order-1 lg:order-2">
            <h2 className={H2}>Everyone gets the same plant</h2>
            <p className={LEAD}>
              An index fund is simple, but someone else picked what’s in it. Picking your own means re-doing the sums every week. Or you hand your money to a trading bot and hope.
            </p>
            <p className={LEAD}>You should get to choose, and still not have to look after it every day.</p>
          </div>
        </section>

        <section id="curators" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32">
          <h2 className={`${H2} mx-auto max-w-4xl text-center`}>So they grew their own</h2>
          <ul className="mt-14 grid gap-5 lg:grid-cols-3">
            {CURATORS.map((s) => (
              <li key={s.who}>
                <a href={`/build?${encodeStrategy(s)}`} className="btn group flex h-full flex-col rounded-[40px] bg-panel p-5 hover:bg-[#fffdf6]">
                  <span className="flex h-72 items-end justify-center overflow-hidden rounded-[28px] px-4 pt-6" style={{ background: s.bg }}>
                    <Image src={s.art} alt={`${s.who} holding a small garden`} sizes="320px" className="h-full w-auto object-contain object-bottom" />
                  </span>
                  <span className="px-1 pt-6 text-[1.9rem] leading-tight font-medium tracking-[-0.04em]">{s.who}</span>
                  <span className="px-1 pt-2 text-[17px] leading-[1.5]">{s.line}</span>
                  <span className="mt-auto px-1 pt-7">
                    <span className="flex justify-between text-[15px] font-medium"><span>{s.name}</span><span className="num">trims at {s.drift}%</span></span>
                    <MixBar rows={s.slices} className="mt-3 h-7" />
                    <span className="num mt-3 block text-[15px] leading-[1.5] text-muted">{s.slices.map((x) => `${x.ticker} ${x.weight}%`).join(" · ")}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-[15px] text-muted">Amaka, Tunde and Mei are made up. Tap one to start from that mix.</p>
        </section>

        <section id="cut" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32">
          <div className="grid gap-x-16 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <h2 className={H2}>Then one grew too big</h2>
            <p className={`${LEAD} lg:mt-0`}>
              Amaka wanted 60% NVIDIA. It soared, and now it’s most of what she owns. Give it a trim.
            </p>
          </div>
          <div className="mt-12">
            <DriftSim wide slices={DEFAULT_STRATEGY.slices} drift={5} initialMoves={[60, 0, -5]} height={300} />
            <p className="mt-4 text-center text-[15px] text-muted">Simulation on an example $10,000, before swap costs.</p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 sm:px-6 sm:pb-32 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <div>
            <h2 className={H2}>Four rules, no guessing</h2>
            <p className={LEAD}>No AI decides anything. Anyone can trigger a trim, but nobody can change its size, or your rules.</p>
          </div>
          <dl className="rounded-[40px] bg-panel px-6 py-3 sm:px-9">
            {RULES.map(([k, v]) => (
              <div key={k} className="grid gap-1 border-b border-line py-6 last:border-0 sm:grid-cols-[7rem_1fr] sm:gap-4">
                <dt className="text-[1.9rem] leading-none font-medium tracking-[-0.04em]">{k}</dt>
                <dd className="text-[17px] leading-[1.5]">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="breaker" className="bg-[#26633a] text-page">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
            <div>
              <h2 className={H2}>It rests when Wall Street does</h2>
              <p className={LEAD}>
                Stock markets close at the weekend. Onchain pools don’t, and their prices can wander. When they stray too far from the last official price, trading pauses.
              </p>
              <p className={LEAD}>Even then, you can take out your share as stocks.</p>
            </div>
            <Image src={night} alt="A gardener asleep in a hammock between two hedges under a crescent moon" sizes="(max-width: 1024px) 92vw, 560px" />
            <div className="lg:col-span-2"><GuardDemo /></div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className={H2}>Pass on a cutting</h2>
            <p className={LEAD}>Share one link. Friends can put USDC into the very same index.</p>
            <p className={LEAD}>You earn a small fee on what they add, 0.1% unless you change it, and they see it before they pay.</p>
            <div className="mt-8"><ButtonLink href="/explore" size="lg" variant="outline">Explore gardens</ButtonLink></div>
          </div>
          <Image src={share} alt="One friend handing a potted cutting to another" sizes="(max-width: 1024px) 92vw, 560px" />
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-28 text-center sm:px-6 sm:pb-36">
          <h2 className={H2}>Pick your seeds</h2>
          <div className="mt-12"><PriceFlow /></div>
          <p className="mt-8 text-[17px] text-muted">Coinbase tokenized stocks on Base, priced by Chainlink and traded on Aerodrome.</p>
          <div className="mt-10 flex justify-center"><ButtonLink href="/build" size="lg">Start growing</ButtonLink></div>
        </section>
      </main>
      <SiteFooter illustrated />
    </>
  );
}
