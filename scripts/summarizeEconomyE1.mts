/** Read-only, compact comparisons of completed E1 food/occupation replays. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [output, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length) throw new Error("Usage: summarizeEconomyE1.mts output.json audits.json...");
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sourceHash = hash(readFileSync("scripts/summarizeEconomyE1.mts"));
const worlds = inputs.map(path => {
  const bytes = readFileSync(path);
  const run = JSON.parse(bytes.toString());
  if (run.schemaVersion !== 6 || ![12, 13].includes(run.samples.length))
    throw new Error(`Expected a completed 12/13-month schema 6 replay: ${path}`);
  const annual = run.samples.slice(0, 12);
  const final = annual.at(-1);
  const food: Record<string, Record<string, number>> = {};
  for (const sample of annual) {
    for (const settlement of sample.foodSettlements) {
      for (const market of settlement.markets) {
        const row = market.food?.monthlyConsumption;
        if (!row) continue;
        const totals = (food[market.id] ??= {});
        for (const [key, value] of Object.entries(row)) {
          if (key !== "month") totals[key] = (totals[key] ?? 0) + Number(value);
        }
        totals.ruralUnmet = (totals.ruralUnmet ?? 0) + Math.max(0, row.ruralNeed - row.ruralSupplied);
        totals.urbanUnmet = (totals.urbanUnmet ?? 0) + Math.max(0, row.urbanNeed - row.urbanSupplied);
      }
    }
  }
  const foodTotals: Record<string, number> = {};
  for (const row of Object.values(food)) {
    for (const [key, value] of Object.entries(row)) foodTotals[key] = (foodTotals[key] ?? 0) + value;
  }
  const feedRequired = annual.reduce((sum: number, row: any) => sum + row.feedTotals.requiredKg, 0);
  const feedUnmet = annual.reduce((sum: number, row: any) => sum + row.feedTotals.unmetKg, 0);
  const goods: Record<string, Record<string, number>> = {};
  for (const name of ["Wool", "Milk", "Cheese", "Leather", "Fodder"]) {
    const flows: Record<string, number> = {};
    for (const sample of annual) {
      for (const [key, value] of Object.entries(sample.primaryFlows[name] ?? {})) {
        flows[key] = (flows[key] ?? 0) + Number(value);
      }
    }
    goods[name] = flows;
  }
  const point = (sample: any) => ({
    date: sample.date,
    ruralPeople: sample.ruralPeople,
    urbanPeople: sample.urbanPeople,
    heads: sample.heads,
    cultivatedHa: sample.cultivatedHa,
    pastureHa: sample.pastureHa,
    aggregateOccupancy: sample.aggregateOccupancy,
    cellsOverModelFootprint: sample.cellsOverModelFootprint,
    annualWoolPotentialKg: sample.annualWoolPotentialKg,
    effectiveWoolLaborAndFeedCoverage: sample.effectiveWoolLaborAndFeedCoverage,
    woolStockKg: sample.woolStockKg,
    wealth: sample.wealth.totals
  });
  return {
    path,
    bytes: bytes.length,
    sha256: hash(bytes),
    inputSha256: run.inputSha256,
    sourceTreeSha256: run.sourceTreeSha256,
    relevantSourceHashes: Object.fromEntries(
      Object.entries(run.sourceHashes).filter(([name]) =>
        /\/(developmentPotential|foodLedgerConsumption|foodProduction|husbandry)\.ts$/.test(name)
      )
    ),
    initial: point(run.initial),
    yearEnd: point(final),
    annual: {
      foodLedgerKgPerUnit: run.foodLedgerKgPerUnit,
      foodTotals,
      foodByMarket: food,
      feedRequiredKg: feedRequired,
      feedUnmetKg: feedUnmet,
      feedUnmetShare: feedRequired > 0 ? feedUnmet / feedRequired : null,
      maxMonthlyFeedUnmetKg: Math.max(...annual.map((row: any) => row.feedTotals.unmetKg)),
      goods,
      woolMarketInflowKg: (goods.Wool["source:ruralHarvest"] ?? 0) * run.woolKgPerLot,
      garmentDeliveriesLots: annual.reduce((sum: number, row: any) => sum + row.householdWardrobeConsumptionLots, 0),
      blanketDeliveriesLots: annual.reduce((sum: number, row: any) => sum + row.householdBlanketConsumptionLots, 0)
    },
    extraMonth: run.samples[12]
      ? {
          end: point(run.samples[12]),
          foodSettlements: run.samples[12].foodSettlements.map((settlement: any) => ({
            date: settlement.date,
            uncoveredRural: settlement.food.coverage.rural.uncovered,
            uncoveredUrban: settlement.food.coverage.urban.uncovered,
            markets: settlement.markets.map((market: any) => ({
              marketId: market.id,
              consumption: market.food?.monthlyConsumption ?? null
            }))
          }))
        }
      : null
  };
});
writeFileSync(output, `${JSON.stringify({
  schemaVersion: 1,
  summarizerSha256: sourceHash,
  notes: [
    "Annual totals use exactly the first 12 intervals; the 13th month is a separate transition check.",
    "Food is ledger units unless labelled kg; feed is dry-matter kg. Goods flows retain catalog units.",
    "Feed totals are endpoint samples, not a tick-exact feeding history. Wool is actual market inflow.",
    "World aggregate pasture occupancy cannot rule out individual-cell or seasonal shortages.",
    "Before/food-only/food-plus-occupation/final are distinct source variants. Load repair 8 recomputes saved columns once.",
    "A ledger created at consumption time does not transfer public stocks from the former market."
  ],
  worlds
}, null, 2)}\n`);
