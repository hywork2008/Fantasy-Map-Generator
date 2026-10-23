import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { getOrCreateFaunaStockTable, getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { getWinterSlaughterState } from "../src/extensions/economy/context/winterSlaughter";
import { livestockFeedPeriod } from "../src/extensions/economy/generators/livestockFeedState";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { observeWinterSlaughter } from "../src/extensions/economy/generators/winterSlaughterObservation";
import { WINTER_SLAUGHTER_POLICY, EXPERIMENTAL_CARCASS_PROFILES } from "../src/extensions/economy/generators/winterSlaughterPolicy";
import { setTickStepObserver } from "../src/generators/tickProfiler";

const [input, output, rawOutput, length = "36"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !rawOutput || !Number.isSafeInteger(months) || months < 12) throw new Error("Expected input, summary, raw output and at least 12 months");
const bytes = readFileSync(input);
const paths = [...new Set([
  ...execFileSync("git", ["ls-files", "-z", "src", "scripts", "public", "package-lock.json"]).toString().split("\0"),
  ...execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z", "src", "scripts"]).toString().split("\0")
].filter(path => path && !path.startsWith("src/city-generator/")))].sort();
const sourceHashes = Object.fromEntries(paths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
const runs = [];
for (const mode of ["off", "experimental-temperate"] as const) {
  const host = createNodeSimulationHost();
  const samples: unknown[] = [];
  const feedSamples: Record<string, number>[] = [];
  const seen = new Set<string>();
  const seenFeedPeriods = new Set<number>();
  try {
    await host.loadArchive(new Uint8Array(bytes));
    host.world.options.winterLivestockSlaughter = mode;
    await host.prepare();
    if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlements");
    host.simulation.worldSettings = { ...host.simulation.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
    const snapshots = [];
    const snapshot = (month: number) => {
      const heads: Record<string, number> = {};
      const breeding: Record<string, number> = {};
      for (const [key, herd] of Object.entries(getOrCreateFaunaStockTable() ?? {})) {
        const species = key.slice(key.indexOf(":") + 1);
        heads[species] = (heads[species] ?? 0) + herd.young + herd.breeding + herd.old;
        breeding[species] = (breeding[species] ?? 0) + herd.breeding;
      }
      return { month, date: [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay],
        heads, breeding, meat: observeWinterSlaughter(getWinterSlaughterState()),
        markets: getMarkets().map(market => ({ id: market.i, ruralCash: market.foodLedger?.ruralHouseholdWealth,
          cash: market.marketTreasury?.balance, urbanFoodShortage: market.foodLedger?.monthlyConsumption ? Math.max(0, market.foodLedger.monthlyConsumption.urbanNeed - market.foodLedger.monthlyConsumption.urbanSupplied) : null,
          ruralFoodShortage: market.foodLedger?.monthlyConsumption ? Math.max(0, market.foodLedger.monthlyConsumption.ruralNeed - market.foodLedger.monthlyConsumption.ruralSupplied) : null,
          goods: Object.fromEntries(getGoods().filter(good => ["Salt", "Wood", "Preserved food", "Tallow", "Leather"].includes(good.name)).map(good => [good.name, market.goods[good.i]?.stock ?? 0])) })) };
    };
    setTickStepObserver({ enter() {}, exit(label) {
      if (label === "production:winterSlaughter") {
        for (const row of getWinterSlaughterState()?.samples ?? []) {
          const key = `${row.period}:${row.cellId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          samples.push(structuredClone(row));
        }
      }
      if (label === "production:livestockFeed") {
        const period = livestockFeedPeriod();
        if (seenFeedPeriods.has(period)) return;
        seenFeedPeriods.add(period);
        const rows = Object.values(getOrCreateLivestockFeedTable() ?? {}).filter(row => row.feedPeriod === period);
        feedSamples.push(Object.fromEntries(["requiredKg", "pastureConsumedKg", "hayConsumedKg", "unmetKg", "purchasedKg"].map(key => [key, rows.reduce((sum, row) => sum + Number(row[key as keyof typeof row] ?? 0), 0)])));
      }
    } });
    snapshots.push(snapshot(0));
    for (let month = 1; month <= months; month++) {
      await advanceWorld(host, { months: 1 });
      if (month === 12 || month === months) snapshots.push(snapshot(month));
      if (month % 6 === 0) process.stderr.write(`[winter-slaughter] ${mode} ${month}/${months}\n`);
    }
    const fields = ["carcassKg", "edibleRecoveredKg", "nonFoodKg", "preservationInputKg", "completedKg", "processingLossKg", "freshConsumedKg", "preservedConsumedKg", "spoilageKg", "saltKg", "woodKg", "spending", "workDays"];
    const totals = Object.fromEntries(fields.map(key => [key, (samples as Record<string, unknown>[]).reduce((sum, row) => sum + Number(row[key] ?? 0), 0)]));
    runs.push({ mode, snapshots, totals,
      feedTotals: Object.fromEntries(["requiredKg", "pastureConsumedKg", "hayConsumedKg", "unmetKg", "purchasedKg"].map(key => [key, feedSamples.reduce((sum, row) => sum + row[key], 0)])),
      sampleCount: samples.length, samples, feedSamples });
  } finally { setTickStepObserver(null); host.dispose(); }
}
const raw = JSON.stringify({ inputSha256: createHash("sha256").update(bytes).digest("hex"), sourceHashes, policy: WINTER_SLAUGHTER_POLICY, profiles: EXPERIMENTAL_CARCASS_PROFILES, runs });
writeFileSync(rawOutput, raw);
writeFileSync(output, JSON.stringify({ schemaVersion: 1, input, inputSha256: createHash("sha256").update(bytes).digest("hex"), months,
  sourceTreeSha256: createHash("sha256").update(JSON.stringify(sourceHashes)).digest("hex"),
  rawOutput, rawSha256: createHash("sha256").update(raw).digest("hex"),
  runs: runs.map(({ samples, feedSamples, snapshots, ...run }) => ({ ...run, snapshots: snapshots.map(({ meat, ...snapshot }) => ({ ...snapshot, meat: meat ? { ...meat, samples: undefined } : null })) }))
}, null, 2) + "\n");
