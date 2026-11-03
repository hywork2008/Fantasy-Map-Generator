/**
 * Monthly rural staple supply, mobile adults and town population (docs/plan/urban-craft-staffing.md
 * §10.8). Read-only; run on the same map with and without a change to compare where towns grow from.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/economy-start-brewgrain-20261104/migrationprobe.mts <map.fmg> <out.json> [months=24]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getMarkets } from "../../../src/extensions/economy/context/trade";
import { getMobileAdultCohorts } from "../../../src/extensions/economy/context/population";

const [input, output, monthsArg = "24"] = process.argv.slice(2);
const r0 = (v: number) => Math.round(v);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();

function snapshot(month: number) {
  const world = getWorldContext();
  const rate = Math.max(1, world.populationRate || 1);
  const burgs = (world.pack.burgs as any[]).filter(b => b?.i && !b.removed);
  const urbanPeople = burgs.reduce((s, b) => s + (b.population ?? 0), 0) * rate * (world.urbanization ?? 1);
  const pop = world.pack.cells.pop as ArrayLike<number>;
  let ruralPeople = 0;
  for (let i = 0; i < pop.length; i++) ruralPeople += pop[i] ?? 0;
  ruralPeople *= rate;
  let ruralNeed = 0;
  let ruralSupplied = 0;
  let ruralFromMarket = 0;
  let unsoldHarvest = 0;
  let foodProduced = 0;
  let stock = 0;
  let payable = 0;
  for (const market of getMarkets()) {
    const ledger = market.foodLedger;
    const c = ledger?.monthlyConsumption;
    ruralNeed += c?.ruralNeed ?? 0;
    ruralSupplied += c?.ruralSupplied ?? 0;
    ruralFromMarket += c?.ruralFromMarket ?? 0;
    unsoldHarvest += ledger?.unsoldHarvest ?? 0;
    foodProduced += ledger?.foodProduced ?? 0;
    stock += (ledger?.foodStockAge0 ?? 0) + (ledger?.foodStockAge1 ?? 0) + (ledger?.foodStockAge2 ?? 0);
    payable += market.marketTreasury?.ruralGrainPayable ?? 0;
  }
  const mobileAdults = (getMobileAdultCohorts() ?? []).reduce(
    (s: number, c: any) => s + (c.maleAdults ?? 0) + (c.femaleAdults ?? 0),
    0
  );
  // Town-side drivers of urban mortality and births (demography-simulator.ts), people-weighted.
  let weight = 0;
  let cold = 0;
  let fed = 0;
  let water = 0;
  let room = 0;
  for (const b of burgs) {
    const people = b.population ?? 0;
    weight += people;
    cold += people * (b.coldExposure ?? 0);
    fed += people * (b.foodSecurity ?? 1);
    water += people * (b.waterSecurity ?? 1);
    const capacity = b.demographics?.effectiveCapacity ?? b.demographics?.capacity ?? 0;
    room += capacity - people;
  }
  return {
    month,
    coldExposure: weight > 0 ? r3(cold / weight) : 0,
    foodSecurity: weight > 0 ? r3(fed / weight) : 0,
    waterSecurity: weight > 0 ? r3(water / weight) : 0,
    roomForGrowth: r0(room * rate),
    urbanPeople: r0(urbanPeople),
    ruralPeople: r0(ruralPeople),
    ruralFedShare: ruralNeed > 0 ? r3(ruralSupplied / ruralNeed) : 0,
    ruralFromMarket: r0(ruralFromMarket),
    marketFoodProduced: r0(foodProduced),
    unsoldHarvest: r0(unsoldHarvest),
    marketStock: r0(stock),
    ruralGrainPayable: r0(payable),
    mobileAdults: r0(mobileAdults)
  };
}

const months = Number(monthsArg);
const snapshots = [snapshot(0)];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  snapshots.push(snapshot(month));
}
writeFileSync(output, JSON.stringify({ input, snapshots }, null, 1));
