#!/usr/bin/env tsx
/** Continuous replay across the E0 year boundary; observes, never repairs, missing food ledgers. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost, advanceWorld } from "../src/simulation/adapters/node";
import { getMarkets } from "../src/extensions/economy/context/trade";
import { setTickStepObserver } from "../src/generators/tickProfiler";
import { createObserveViews } from "./lib/observeViews.mts";
const [input, reference, output] = process.argv.slice(2);
if (!input || !reference || !output) throw new Error("Usage: auditFoodLedgerTransition.mts input.fmg baseline.json output.json");
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const bytes = readFileSync(input);
const baseline = JSON.parse(readFileSync(reference, "utf8"));
if (baseline.inputSha256 !== hash(bytes) || baseline.schemaVersion !== 4 || baseline.samples.length !== 12)
  throw new Error("Expected the completed same-input E0 boundary baseline");
const paths = execFileSync("git", ["ls-files", "-z", "src", "scripts", "public", "package-lock.json"])
 .toString().split("\0").filter(path => path && !path.startsWith("src/city-generator/"));
paths.push("scripts/auditFoodLedgerTransition.mts", "src/extensions/economy/generators/foodObservation.ts");
const sourceHashes = Object.fromEntries([...new Set(paths)].sort().map(path => [path, hash(readFileSync(path))]));
const host = createNodeSimulationHost();
try {
 await host.loadArchive(new Uint8Array(bytes));
 await host.prepare();
 if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard settlement pattern");
 const sim = host.simulation as {worldSettings?: Record<string, string>};
 sim.worldSettings = {...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off"};
 const clock = () => ({year: host.simulation.currentYear, month: host.simulation.currentMonth,
  day: host.simulation.currentDay, tick: host.simulation.tickCount});
 const views = createObserveViews(() => host.world, clock);
 for (let month = 0; month < 12; month++) await advanceWorld(host, {months: 1});
 const capture = () => ({date: clock(), food: views.food(),
  foodLedgers: getMarkets().map(market => ({marketId: market.i, ledger: structuredClone(market.foodLedger ?? null)}))});
 const before = capture();
 if (JSON.stringify(before.food) !== JSON.stringify(baseline.samples.at(-1).food))
  throw new Error("Continuous replay did not reproduce the reference boundary");
 const events: {step: string; snapshot: ReturnType<typeof capture>}[] = [];
 setTickStepObserver({enter() {}, exit(step) {
  if (["food:consumption", "food:production", "production:foodConsumption"].includes(step))
   events.push({step, snapshot: capture()});
 }});
 await advanceWorld(host, {months: 1});
 writeFileSync(output, JSON.stringify({schemaVersion: 1, input, inputSha256: hash(bytes),
  reference, referenceSha256: hash(readFileSync(reference)), replayBoundaryMatches: true,
  sourceHashes, sourceTreeSha256: hash(JSON.stringify(sourceHashes)), worldSettings: sim.worldSettings,
  note: "Continuous 12 monthly advances followed by one observed month; no save/reload or bootstrap at the boundary.",
  before, events, after: capture()}, null, 2) + "\n");
} finally {setTickStepObserver(null); host.dispose();}
