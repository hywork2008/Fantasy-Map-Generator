/**
 * Urban and rural household money by Market and channel (docs/plan/unsold-harvest-household-store.md §4): every
 * credit and debit of a Burg's household wallet, classified by the module that made it, summed per
 * Market and year, with the change in wallets and the part not seen by the hook (direct writes).
 * Read-only apart from the audit hook. Usage: auditUrbanMoneyFlows.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getHouseholdWealth, setHouseholdWealthFlowObserver } from "../src/extensions/economy/generators/burgMarketLedgers";
import { setRuralHouseholdWealthFlowObserver } from "../src/extensions/economy/generators/householdWealth";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "./lib/conflictAutonomyFromEnv.mts";

const [input, output, length = "84"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 12)
  throw new Error("Usage: auditUrbanMoneyFlows.mts <archive.fmg> <output.json> [months>=12]");

const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const years: unknown[] = [];
let flows: Record<number, Record<string, number>> = {};
let ruralFlows: Record<number, Record<string, number>> = {};
const marketOfBurg = new Map<number, number>();

const WALLET_FUNCTIONS = new Set([
  "creditHouseholdWealth",
  "debitHouseholdWealth",
  "creditRuralHouseholdWealth",
  "debitRuralHouseholdWealth"
]);

function channel(): string {
  const frames = (new Error().stack ?? "").split("\n").slice(1);
  for (const frame of frames) {
    const file = frame.match(/([A-Za-z0-9_-]+)\.m?ts/)?.[1];
    const fn = frame.match(/at (?:[A-Za-z0-9_$]+\.)?([A-Za-z0-9_$]+) /)?.[1];
    if (!file || file === "auditUrbanMoneyFlows" || (fn && WALLET_FUNCTIONS.has(fn))) continue;
    return fn ? `${file}.${fn}` : file;
  }
  return "unknown";
}

function wallets(): Record<number, number> {
  const world = getWorldContext();
  const byMarket: Record<number, number> = {};
  marketOfBurg.clear();
  for (const burg of world.pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    marketOfBurg.set(burg.i, burg.market ?? 0);
    byMarket[burg.market ?? 0] = (byMarket[burg.market ?? 0] ?? 0) + getHouseholdWealth(burg.i);
  }
  return byMarket;
}

function urbanPeople(): Record<number, number> {
  const world = getWorldContext();
  const rate = world.populationRate || 1;
  const people: Record<number, number> = {};
  for (const burg of world.pack.burgs ?? [])
    if (burg?.i && !burg.removed)
      people[burg.market ?? 0] = (people[burg.market ?? 0] ?? 0) + (burg.population ?? 0) * rate * (world.urbanization ?? 1);
  return people;
}

try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  applyConflictAutonomyFromEnv();
  let start = wallets();
  setHouseholdWealthFlowObserver((burgId, amount) => {
    const market = marketOfBurg.get(burgId) ?? getWorldContext().pack.burgs?.[burgId]?.market ?? 0;
    const row = (flows[market] ??= {});
    const key = `${amount >= 0 ? "+" : "-"} ${channel()}`;
    row[key] = (row[key] ?? 0) + amount;
  });
  setRuralHouseholdWealthFlowObserver((marketId, amount) => {
    const row = (ruralFlows[marketId] ??= {});
    const key = `${amount >= 0 ? "+" : "-"} ${channel()}`;
    row[key] = (row[key] ?? 0) + amount;
  });
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    if (m % 12 === 0) {
      const end = wallets();
      years.push({ date: [host.simulation.currentYear, host.simulation.currentMonth], start, end, people: urbanPeople(), flows, ruralFlows });
      start = end;
      flows = {};
      ruralFlows = {};
    }
    console.error(`[urban-money] ${m}/${months}`);
  }
  writeFileSync(
    output,
    `${JSON.stringify({
      schemaVersion: 1,
      inputSha256: createHash("sha256").update(bytes).digest("hex"),
      months,
      notes: [
        "ruralFlows: the same for each Market's rural household wallet.",
        "flows: per Market, per '+ module.function' / '- module.function', the household wallet credits and debits in the year.",
        "start/end: summed Burg household wallets per Market; end - start - sum(flows) is what the hook does not see (direct writes such as minting.ts, personalCash.ts) and Burgs changing Market."
      ],
      years
    })}\n`
  );
} finally {
  setHouseholdWealthFlowObserver(null);
  setRuralHouseholdWealthFlowObserver(null);
  host.dispose();
}
