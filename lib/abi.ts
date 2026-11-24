import { parseAbi } from "viem";

export const factoryAbi = parseAbi([
  "function create(string name, string symbol, address[] tokens, uint16[] weightsBps, uint256 driftBps, uint256 creatorFeeBps) returns (address vault)",
  "function latest(uint256 offset, uint256 limit) view returns (address[])",
  "function vaultCount() view returns (uint256)",
  "function isVault(address) view returns (bool)",
  "event TrancheCreated(address indexed vault, address indexed creator, string name, string symbol)",
  "error NotListed(address token)",
  "error BadInput()",
  "error BadConfig()",
]);

export const vaultAbi = parseAbi([
  "struct Holding { address token; uint256 balance; uint256 value; uint256 price; uint256 targetBps; uint256 currentBps; uint8 status; }",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function creator() view returns (address)",
  "function driftBps() view returns (uint256)",
  "function creatorFeeBps() view returns (uint256)",
  "function lastRebalance() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function previewDeposit(uint256) view returns (uint256)",
  "function previewRedeem(uint256) view returns (uint256)",
  "function guardStatus() view returns (uint8)",
  "function currentDrift() view returns (uint256)",
  "function canRebalance() view returns (bool)",
  "function holdings() view returns (Holding[] out, uint256 idleUsdc, uint256 nav)",
  "function depositMin(uint256 assets, address receiver, uint256 minShares, uint256 deadline) returns (uint256)",
  "function redeemMin(uint256 shares, address receiver, address owner, uint256 minAssets, uint256 deadline) returns (uint256)",
  "function redeemInKind(uint256 shares, address receiver, address owner, uint256 skipMask)",
  "function rebalance()",
  "error GuardTripped(uint8 status)",
  "error WithinDrift(uint256 driftBps, uint256 thresholdBps)",
  "error CoolingDown(uint256 readyAt)",
  "error TooSmall()",
  "error ValueLost()",
  "error Expired()",
]);

export const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);

export const GUARD_TEXT = [
  "Running",
  "Base sequencer is down or just restarted",
  "Reference price unavailable",
  "Reference price too old",
  "Not enough pool price history",
  "Pool price too far from the market close",
] as const;
