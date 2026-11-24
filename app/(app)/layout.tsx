import { SiteFooter, SiteHeader } from "@/components/chrome";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader app />
      <main className="mx-auto w-full max-w-6xl px-4 pt-10 pb-20 sm:px-6">{children}</main>
      <SiteFooter />
    </>
  );
}
