import { network } from "hardhat";
import { STOCKS } from "../lib/stocks.js";
import { ROUTERS, SEQUENCER_FEED, USDC } from "./config.js";

// Real deployment to Base mainnet. Needs DEPLOYER_PRIVATE_KEY and ETH for gas.
const { viem } = await network.create("base");
const [wallet] = await viem.getWalletClients();
if (!wallet) throw new Error("Set DEPLOYER_PRIVATE_KEY first.");
const client = await viem.getPublicClient();
if ((await client.getChainId()) !== 8453) throw new Error("Not Base mainnet.");
console.log("Deployer", wallet.account.address);

const factory = await viem.deployContract("TrancheFactory", [USDC, SEQUENCER_FEED, wallet.account.address], { confirmations: 2 });
console.log("Factory ", factory.address);

for (const s of STOCKS) {
  const pool = await viem.getContractAt("ICLPool", s.pool);
  const router = ROUTERS[(await pool.read.factory()).toLowerCase()];
  if (!router) throw new Error(`${s.ticker}: pool factory has no known router`);
  const hash = await factory.write.list([s.token, s.feed, s.pool, router]);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${s.ticker}: listing reverted`);
  console.log("Listed  ", s.ticker);
}
console.log(`\nAdd to .env.local:\nNEXT_PUBLIC_FACTORY=${factory.address}`);
