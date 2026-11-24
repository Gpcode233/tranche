import type { Address } from "viem";

/**
 * Coinbase-issued B20 tokenized stocks on Base mainnet. Token and pool addresses were read from
 * Base and the feeds from Chainlink's directory; `scripts/verify-mainnet.ts` re-checks all of them.
 */
export type Stock = {
  ticker: string;
  name: string;
  token: Address;
  feed: Address;
  pool: Address;
  color: string;
};

export const STOCKS: Stock[] = [
  { ticker: "NVDA", name: "NVIDIA", token: "0xb20000000000000000000078ee7ce2fE4908108C", feed: "0x04689a41629776563E6822F76f2e57D148d28513", pool: "0xF668e21993f0ACd7ab00BB1cFbAeD0df28A3C8EC", color: "#2f7d45" },
  { ticker: "AAPL", name: "Apple", token: "0xb200000000000000000000C2e324d24d7eEcd1fb", feed: "0x787f13dEa48Db0897CbCDD985de77809D837F988", pool: "0xF5FCB9CDAFcE67d50AfEf298F88E709d2B946BA6", color: "#2ba0ff" },
  { ticker: "TSLA", name: "Tesla", token: "0xb2000000000000000000001e800a7f5189430cD0", feed: "0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4", pool: "0x7A33000372f3F028f074182CCb9d16cBEEfBF920", color: "#dcb8ff" },
  { ticker: "GOOGL", name: "Alphabet", token: "0xb2000000000000000000002D0BA3164cc74f58B7", feed: "0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2", pool: "0x16c70F04C3080a127486Cdf5a4C33c066bBF47C3", color: "#8ed462" },
  { ticker: "AMZN", name: "Amazon", token: "0xb200000000000000000000d9192b6B456483C2E8", feed: "0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295", pool: "0x532e0F46d1e528507FC9454d5847C231f23bDDf6", color: "#ffb3c4" },
  { ticker: "META", name: "Meta", token: "0xb2000000000000000000008bC8786B856E61707C", feed: "0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D", pool: "0xd072410fa13D242e1d53721Bcf7AF02e3455DC96", color: "#1fa89a" },
  { ticker: "MSFT", name: "Microsoft", token: "0xB200000000000000000000Ab99cFa739E253872B", feed: "0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c", pool: "0x2740C0faAb738F6e346e545fDE02aEF9B1A01ee7", color: "#c9c2ae" },
];

/** A local dev chain replaces the addresses, never the tickers. See scripts/local.ts. */
const overrides: Record<string, { token: Address; feed: Address; pool: Address }> = JSON.parse(
  process.env.NEXT_PUBLIC_LOCAL_STOCKS || "{}",
);
for (const s of STOCKS) Object.assign(s, overrides[s.ticker]);

export const stockByTicker = (t: string) => STOCKS.find((s) => s.ticker === t);
export const stockByToken = (a: string) =>
  STOCKS.find((s) => s.token.toLowerCase() === a.toLowerCase());
