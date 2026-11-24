import { createConfig, http } from "wagmi";
import { base, hardhat } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { Attribution } from "ox/erc8021";
import { isAddress, type Address } from "viem";

export const isLocal = process.env.NEXT_PUBLIC_CHAIN === "local";
export const CHAIN = isLocal ? hardhat : base;

const envAddress = (v: string | undefined): Address | undefined => (v && isAddress(v) ? v : undefined);

export const USDC: Address =
  envAddress(process.env.NEXT_PUBLIC_USDC) ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** Undefined until the factory is deployed; the app then runs in design-only mode. */
export const FACTORY = envAddress(process.env.NEXT_PUBLIC_FACTORY);

// Base Builder Code: attributes onchain activity to this app (ERC-8021).
const code = process.env.NEXT_PUBLIC_BUILDER_CODE;

export const wagmiConfig = createConfig({
  chains: [CHAIN],
  connectors: [injected()],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
  ssr: true,
  ...(code ? { dataSuffix: Attribution.toDataSuffix({ codes: [code] }) } : {}),
});

export const explorer = (a: string) => `https://basescan.org/address/${a}`;
