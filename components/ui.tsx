"use client";

import { Slider as SliderBase } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import Link from "next/link";
import type { ComponentProps } from "react";

// shadcn-style primitives, themed by the tokens in globals.css.
const button = cva(
  "btn inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-grass text-ink hover:bg-[#7fc853]",
        cut: "bg-cut text-ink hover:bg-[#e6d30a]",
        ink: "bg-ink text-white hover:bg-[#42453f]",
        outline: "border border-line bg-panel hover:border-ink/50",
        ghost: "hover:bg-sunk",
      },
      size: { md: "h-11 px-5 text-[15px]", lg: "h-14 pl-6 pr-6 text-[17px]", sm: "h-10 px-3.5 text-sm" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
type V = VariantProps<typeof button>;

export const Button = ({ className, variant, size, type = "button", ...p }: ComponentProps<"button"> & V) => (
  <button type={type} className={cn(button({ variant, size }), className)} {...p} />
);
export const ButtonLink = ({ className, variant, size, children, ...p }: ComponentProps<typeof Link> & V) => (
  <Link className={cn(button({ variant, size }), size === "lg" && "pr-2.5", className)} {...p}>
    {children}
    {size === "lg" && <Go dark={variant !== "outline"} />}
  </Link>
);

/** Round arrow that marks a main action. */
const Go = ({ dark }: { dark: boolean }) => (
  <span className={cn("ml-1 grid size-9 place-items-center rounded-full", dark ? "bg-white" : "bg-grass")} aria-hidden>
    <svg viewBox="0 0 16 16" className="size-4"><path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

export function Slider({
  color = "var(--ink)", label, valueText, className, ...p
}: ComponentProps<typeof SliderBase.Root> & { color?: string; label: string; valueText?: string }) {
  return (
    <SliderBase.Root className={cn("relative flex h-11 w-full touch-none items-center select-none", className)} {...p}>
      <SliderBase.Track className="relative h-2 w-full grow rounded-full bg-sunk">
        <SliderBase.Range className="absolute h-full rounded-full" style={{ background: color }} />
      </SliderBase.Track>
      <SliderBase.Thumb
        aria-label={label}
        aria-valuetext={valueText}
        className="block size-6 cursor-grab rounded-full border-[3px] border-panel outline outline-1 outline-ink/25 active:cursor-grabbing"
        style={{ background: color }}
      />
    </SliderBase.Root>
  );
}

export const Panel = ({ className, ...p }: ComponentProps<"div">) => (
  <div className={cn("rounded-[28px] bg-panel sm:rounded-[40px]", className)} {...p} />
);

export const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-medium">{label}</span>
    {children}
    {hint && <span className="mt-1.5 block text-sm text-muted">{hint}</span>}
  </label>
);

export const Input = ({ className, ...p }: ComponentProps<"input">) => (
  <input className={cn("h-12 w-full rounded-[18px] border border-line bg-page px-3.5 text-base outline-offset-0 placeholder:text-muted", className)} {...p} />
);
