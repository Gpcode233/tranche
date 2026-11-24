import { defineConfig, configVariable } from "hardhat/config";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import hardhatViemAssertions from "@nomicfoundation/hardhat-viem-assertions";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";

export default defineConfig({
  plugins: [hardhatViem, hardhatViemAssertions, hardhatNodeTestRunner, hardhatNetworkHelpers],
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", viaIR: true },
  },
  networks: {
    base: {
      type: "http",
      chainType: "op",
      url: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [configVariable("DEPLOYER_PRIVATE_KEY")] : [],
    },
  },
});
