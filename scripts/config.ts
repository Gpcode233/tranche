import type { Address } from "viem";

// Base mainnet. Aerodrome routers come from the Slipstream README and dromos-labs/metadex-slipstream-public, and are matched to each pool
// by factory, so a pool never gets paired with the wrong deployment's router.
export const USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const SEQUENCER_FEED: Address = "0xBCF85224fc0756B9Fa45aA7892530B47e10b6433";
export const ROUTERS: Record<string, Address> = {
  "0x9cb220581b91b0c83223012fe69688b92ad07a76": "0x9Ee35Bf1bd69a03c6F0393582030fCe8Bb93D418",
  "0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a": "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5",
  "0xade65c38cd4849adba595a4323a8c7ddfe89716a": "0xcbBb8035cAc7D4B3Ca7aBb74cF7BdF900215Ce0D",
  "0xf8f2eb4940cfe7d13603dddd87f123820fc061ef": "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F",
};
