import { readFileSync } from "node:fs";
import {
  createPublicClient, encodeAbiParameters, encodeDeployData, encodeFunctionData, decodeFunctionResult,
  erc20Abi, getContractAddress, http, keccak256, numberToHex, parseAbi, parseUnits, type Address, type Hex,
} from "viem";
import { base } from "viem/chains";
import { STOCKS } from "../lib/stocks.js";
import { vaultAbi } from "../lib/abi.js";
import { ROUTERS, SEQUENCER_FEED, USDC } from "./config.js";

// Read-only. Runs deploy -> list -> create -> deposit -> redeem -> in-kind exit against live Base
// state with eth_simulateV1. B20 tokens are native precompiles, so a local EVM fork cannot do this.
const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org", { retryCount: 6, retryDelay: 1500, timeout: 60_000 }),
});
const poolAbi = parseAbi(["function factory() view returns (address)"]);
const art = JSON.parse(readFileSync("artifacts/contracts/TrancheFactory.sol/TrancheFactory.json", "utf8"));

// A fresh, unfunded address; balances are overridden inside the simulation only.
const me: Address = "0x000000000000000000000000000000007a11c4e5";
const factory = getContractAddress({ from: me, nonce: 0n });
const vault = getContractAddress({ from: factory, nonce: 1n });
const basket = STOCKS.slice(0, 3);
const amount = parseUnits(process.env.AMOUNT ?? "500", 6);

const calls: { label: string; to?: Address; data: Hex }[] = [
  { label: "deploy factory", data: encodeDeployData({ abi: art.abi, bytecode: art.bytecode, args: [USDC, SEQUENCER_FEED, me] }) },
];
for (const s of STOCKS) {
  const pf = await client.readContract({ address: s.pool, abi: poolAbi, functionName: "factory" });
  const router = ROUTERS[pf.toLowerCase()];
  if (!router) throw new Error(`${s.ticker}: no router for pool factory ${pf}`);
  calls.push({ label: `list ${s.ticker}`, to: factory, data: encodeFunctionData({ abi: art.abi, functionName: "list", args: [s.token, s.feed, s.pool, router] }) });
}
const v = (functionName: string, args: unknown[] = []) => encodeFunctionData({ abi: vaultAbi, functionName, args } as never);
calls.push(
  { label: "create vault", to: factory, data: encodeFunctionData({ abi: art.abi, functionName: "create", args: ["AI & Compute", "AICOx", basket.map((s) => s.token), [6000, 2500, 1500], 500n, 10n] }) },
  { label: "guardStatus", to: vault, data: v("guardStatus") },
  { label: "approve", to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, amount] }) },
  { label: "deposit", to: vault, data: v("depositMin", [amount, me, 1n, 10n ** 12n]) },
  { label: "holdings", to: vault, data: v("holdings") },
);

const simulate = (extra: typeof calls) => {
  const all = [...calls, ...extra];
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [me, 9n]));
  return client.simulateBlocks({
    blocks: [{
      stateOverrides: [
        { address: me, balance: parseUnits("10", 18) },
        { address: USDC, stateDiff: [{ slot, value: numberToHex(amount, { size: 32 }) }] },
      ],
      calls: all.map((c) => ({ from: me, to: c.to, data: c.data })) as never,
    }],
  }).then(([b]) => (b.calls as unknown as { status: string; data: Hex; gasUsed: bigint; error?: Error }[]).map((r, i) => ({ ...r, label: all[i].label })));
};

let out = await simulate([]);
const report = (rows: typeof out) => rows.forEach((r) => console.log(r.status.padEnd(8), r.label.padEnd(16), String(r.gasUsed).padStart(9), "gas", r.status === "success" ? "" : r.error?.message?.split("\n")[0] ?? r.data));
const failed = out.find((r) => r.status !== "success");
if (failed) {
  report(out);
  process.exit(1);
}
const shares = BigInt(out.find((r) => r.label === "deposit")!.data);
const [held, , nav] = decodeFunctionResult({ abi: vaultAbi, functionName: "holdings", data: out.at(-1)!.data });

out = await simulate([
  { label: "redeem half", to: vault, data: v("redeemMin", [shares / 2n, me, me, 1n, 10n ** 12n]) },
  { label: "in-kind rest", to: vault, data: v("redeemInKind", [shares - shares / 2n, me, me, 0n]) },
  ...basket.map((s) => ({ label: `my ${s.ticker}`, to: s.token, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [me] }) })),
]);
report(out);
console.log(`\nDeposited ${Number(amount) / 1e6} USDC, index value ${Number(nav) / 1e6}`);
held.forEach((h, i) => console.log(basket[i].ticker, `${Number(h.currentBps) / 100}% of target ${Number(h.targetBps) / 100}%`));
console.log("Redeemed half for", Number(BigInt(out.find((r) => r.label === "redeem half")!.data)) / 1e6, "USDC");
for (const r of out.slice(-3)) console.log(r.label, Number(BigInt(r.data)) / 1e8);
if (out.some((r) => r.status !== "success")) process.exit(1);
