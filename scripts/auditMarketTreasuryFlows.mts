/**
 * Market treasury money by Market and channel (docs/plan/salt-supply-calibration.md §3.4): every change of
 * a Market's `marketTreasury.balance`, classified by the module and function that made it, summed per
 * Market and year, with the balances and the unpaid rural grain at the year's start and end. The
 * treasury has no single debit function, so the audit wraps `balance` (and `marketTreasury` itself)
 * in accessors; a treasury object built and assigned in one step is caught by the `marketTreasury`
 * setter. Read-only apart from the accessors. Usage: auditMarketTreasuryFlows.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getMarkets } from "../src/extensions/economy/context/trade";
import type { Market } from "../src/extensions/economy/generators/marketTypes";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "./lib/conflictAutonomyFromEnv.mts";

const [input, output, length = "48"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 12)
  throw new Error("Usage: auditMarketTreasuryFlows.mts <archive.fmg> <output.json> [months>=12]");

const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const years: unknown[] = [];
let flows: Record<number, Record<string, number>> = {};
const hooked = new WeakSet<object>();

function channel(): string {
  const frames = (new Error().stack ?? "").split("\n").slice(1);
  for (const frame of frames) {
    const file = frame.match(/([A-Za-z0-9_-]+)\.m?ts/)?.[1];
    const fn = frame.match(/at (?:[A-Za-z0-9_$]+\.)?([A-Za-z0-9_$<>]+) /)?.[1];
    // Shared helpers such as saltFinance.creditMarket hide the caller that decides the flow.
    if (!file || file === "auditMarketTreasuryFlows" || fn === "creditMarket") continue;
    return fn ? `${file}.${fn}` : file;
  }
  return "unknown";
}

function record(marketId: number, amount: number): void {
  if (!amount) return;
  const row = (flows[marketId] ??= {});
  const key = `${amount >= 0 ? "+" : "-"} ${channel()}`;
  row[key] = (row[key] ?? 0) + amount;
}

function hookTreasury(marketId: number, treasury: { balance: number } | undefined): void {
  if (!treasury || hooked.has(treasury)) return;
  hooked.add(treasury);
  let balance = treasury.balance ?? 0;
  Object.defineProperty(treasury, "balance", {
    enumerable: true,
    configurable: true,
    get: () => balance,
    set: (value: number) => {
      record(marketId, value - balance);
      balance = value;
    }
  });
}

function hookMarket(market: Market): void {
  if (hooked.has(market)) return;
  hooked.add(market);
  let treasury = market.marketTreasury;
  hookTreasury(market.i, treasury);
  Object.defineProperty(market, "marketTreasury", {
    enumerable: true,
    configurable: true,
    get: () => treasury,
    set: (value: Market["marketTreasury"]) => {
      if (value !== treasury) {
        record(market.i, (value?.balance ?? 0) - (treasury?.balance ?? 0));
        hookTreasury(market.i, value);
      }
      treasury = value;
    }
  });
}

function snapshot(): Record<number, { balance: number; ruralGrainPayable: number }> {
  const out: Record<number, { balance: number; ruralGrainPayable: number }> = {};
  for (const market of getMarkets())
    out[market.i] = {
      balance: market.marketTreasury?.balance ?? 0,
      ruralGrainPayable: market.marketTreasury?.ruralGrainPayable ?? 0
    };
  return out;
}

try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  applyConflictAutonomyFromEnv();
  for (const market of getMarkets()) hookMarket(market);
  let start = snapshot();
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    for (const market of getMarkets()) hookMarket(market);
    if (m % 12 === 0) {
      const end = snapshot();
      years.push({ date: [host.simulation.currentYear, host.simulation.currentMonth], start, end, flows });
      start = end;
      flows = {};
    }
    console.error(`[treasury] ${m}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify({
      schemaVersion: 1,
      inputSha256: createHash("sha256").update(bytes).digest("hex"),
      months,
      notes: [
        "flows: per Market, per '+ module.function' / '- module.function', the year's changes of marketTreasury.balance.",
        "start/end: balance and ruralGrainPayable per Market; end.balance - start.balance - sum(flows) is what the accessors miss (Markets created during the year, treasuries replaced on a copied Market)."
      ],
      years
    })}\n`
  );
} finally {
  host.dispose();
}
