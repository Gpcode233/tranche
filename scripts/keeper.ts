import { network } from "hardhat";

// Optional convenience. `rebalance` is permissionless, so this bot has no special powers:
// anyone can run it, and the app's "Make the cut" button does the same thing.
const { viem } = await network.create(process.env.KEEPER_NETWORK ?? "base");
const address = process.env.NEXT_PUBLIC_FACTORY as `0x${string}` | undefined;
if (!address) throw new Error("Set NEXT_PUBLIC_FACTORY.");
const factory = await viem.getContractAt("TrancheFactory", address);
const client = await viem.getPublicClient();

async function sweep() {
  const count = await factory.read.vaultCount();
  for (let i = 0n; i < count; i++) {
    try {
      const vault = await viem.getContractAt("TrancheVault", await factory.read.vaults([i]));
      if (!(await vault.read.canRebalance())) continue;
      const hash = await vault.write.rebalance();
      const { status } = await client.waitForTransactionReceipt({ hash });
      console.log(new Date().toISOString(), vault.address, status, hash);
    } catch (e) {
      console.error("vault", i, (e as Error).message.split("\n")[0]);
    }
  }
}

do {
  await sweep();
  if (process.env.KEEPER_ONCE) break;
  await new Promise((r) => setTimeout(r, 60_000));
} while (true);
