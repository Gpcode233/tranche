import Image from "next/image";
import Link from "next/link";
import footer from "@/public/art/footer.webp";
import { ConnectButton } from "./wallet";
import { ButtonLink } from "./ui";
import { cn } from "@/lib/cn";

/** Three clipped hedges, with the offcut in yellow. */
export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <rect x="1" y="12" width="8" height="15" rx="3.6" fill="#8ed462" />
      <rect x="10" y="12" width="8" height="15" rx="3.6" fill="#2f7d45" />
      <rect x="19" y="17" width="8" height="10" rx="3.6" fill="#2ba0ff" />
      <path d="M10 9.5C10 4.5 13 1.5 18.5 1.5 19 6.5 16 9.5 10 9.5Z" fill="#f5e211" stroke="#2c2e2a" strokeWidth="0.9" />
    </svg>
  );
}

const Logo = ({ compact = false }: { compact?: boolean }) => (
  <Link href="/" className="flex items-center gap-2 pl-1 text-xl font-medium tracking-[-0.04em]">
    <Mark /> <span className={compact ? "sr-only sm:not-sr-only" : ""}>Tranche</span>
  </Link>
);

export function SiteHeader({ app = false, tone }: { app?: boolean; tone?: "grass" }) {
  const links = app
    ? [["/explore", "Explore"], ["/build", "Build"]]
    : [["#curators", "Stories"], ["#cut", "How it works"], ["#breaker", "Weekends"], ["/explore", "Explore"]];
  return (
    <div className={cn("pointer-events-none sticky top-0 z-20 px-2 pt-3 sm:px-6 sm:pt-4", tone !== "grass" && "pb-2")}>
      <header className={cn("pointer-events-auto mx-auto flex h-16 max-w-6xl items-center justify-between gap-1 rounded-full bg-panel pr-2 pl-2.5 sm:pr-3 sm:pl-4", tone !== "grass" && "border border-line")}>
        <Logo compact={app} />
        <div className="flex items-center gap-1 sm:gap-2">
          <nav className={app ? "flex" : "hidden md:flex"}>
            {links.map(([href, label]) => (
              <Link key={href} href={href} className="flex h-11 items-center rounded-full px-1.5 text-[15px] font-medium hover:bg-page sm:px-4">{label}</Link>
            ))}
          </nav>
          {app ? <ConnectButton variant="primary" /> : <ButtonLink href="/build" size="sm">Start growing</ButtonLink>}
        </div>
      </header>
    </div>
  );
}

export function SiteFooter({ illustrated = false }: { illustrated?: boolean }) {
  return (
    <footer className={cn("mt-auto overflow-hidden", illustrated ? "bg-cut" : "border-t border-line")}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 text-[15px] leading-[1.5] sm:px-6 md:flex-row md:justify-between">
        <Logo />
        <p className="max-w-xl">
          Tranche is experimental and has not been independently audited. Tokenized stocks can lose value and are not available to everyone; check the rules where you live. Nothing here is investment advice. Not affiliated with Coinbase, Base or the companies named.
        </p>
      </div>
      {illustrated && (
        <Image src={footer} alt="A row of colourful hedges with a snail, a bird and someone waving goodbye" sizes="(max-width: 768px) 200vw, 100vw" className="w-[200vw] max-w-none -translate-x-[55vw] sm:w-full sm:translate-x-0" />
      )}
    </footer>
  );
}
