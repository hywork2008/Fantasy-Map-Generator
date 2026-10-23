/** Derives E0 comparisons from completed auditWoolSupply runs, without advancing a world. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const [output, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length) throw new Error("Usage: summarizeEconomyBaseline.mts output.json inputs.json...");
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const worlds = inputs.map(path => {
 const bytes = readFileSync(path);
 const run = JSON.parse(bytes.toString());
 if (run.samples.length !== 12 || run.schemaVersion !== 2) throw new Error(`Incomplete E0 run: ${path}`);
 const totals: Record<string, number> = {};
 const byMarket: Record<string, Record<string, number>> = {};
 const intervals = run.samples.map((sample: any) => {
  let ruralUnmet = 0, urbanUnmet = 0;
  for (const settlement of sample.foodSettlements) for (const market of settlement.markets) {
   const row = market.food?.monthlyConsumption;
   if (!row) continue;
   const local = byMarket[market.id] ??= {};
   for (const [key, value] of Object.entries(row)) if (key !== "month") {
    totals[key] = (totals[key] ?? 0) + Number(value);
    local[key] = (local[key] ?? 0) + Number(value);
   }
   for (const key of ["ruralPeople", "urbanPeople"]) {
    totals[`${key}Months`] = (totals[`${key}Months`] ?? 0) + market[key];
    local[`${key}Months`] = (local[`${key}Months`] ?? 0) + market[key];
   }
   ruralUnmet += Math.max(0, row.ruralNeed - row.ruralSupplied);
   urbanUnmet += Math.max(0, row.urbanNeed - row.urbanSupplied);
  }
  return {end: sample.date, settlements: sample.foodSettlements.length,
   ruralUnmetKg: ruralUnmet * run.foodLedgerKgPerUnit, urbanUnmetKg: urbanUnmet * run.foodLedgerKgPerUnit};
 });
 const flows: Record<string, Record<string, number>> = {};
 for (const sample of run.samples) for (const [name, entries] of Object.entries(sample.primaryFlows)) {
  const row = flows[name] ??= {};
  for (const [key, units] of Object.entries(entries as Record<string, number>)) row[key] = (row[key] ?? 0) + units;
 }
 const annualKg = (key: string, denominator: string) => totals[denominator] > 0
  ? totals[key] * run.foodLedgerKgPerUnit * 12 / totals[denominator] : null;
 return {path, sha256: hash(bytes), inputSha256: run.inputSha256, sourceTreeSha256: run.sourceTreeSha256,
  initialProfile: run.initialProfile, worldSettings: run.worldSettings, start: run.initial.date, end: run.samples.at(-1).date,
  foodLedgerKgPerUnit: run.foodLedgerKgPerUnit, foodTotals: totals, foodByMarket: byMarket, foodIntervals: intervals,
  foodKgPerResidentYear: {ruralNeed: annualKg("ruralNeed", "ruralPeopleMonths"),
   ruralSupplied: annualKg("ruralSupplied", "ruralPeopleMonths"), ruralHome: annualKg("ruralFromHousehold", "ruralPeopleMonths"),
   ruralMarket: annualKg("ruralFromMarket", "ruralPeopleMonths"), urbanNeed: annualKg("urbanNeed", "urbanPeopleMonths"),
   urbanSupplied: annualKg("urbanSupplied", "urbanPeopleMonths")},
  primaryFlows: flows,
  snapshots: [run.initial, run.samples.at(-1)].map((sample: any) => Object.fromEntries([
   "date", "ruralPeople", "urbanPeople", "ruralFoodUncoveredPeople", "ruralFoodStock", "cultivatedHa", "pastureHa", "heads",
   "aggregateOccupancy", "sheepPerResident", "annualWoolPotentialKg", "effectiveWoolLaborAndFeedCoverage", "woolStockKg", "feedTotals"
  ].map(key => [key, sample[key]]))),
  textileSnapshotTotals: Object.fromEntries(["householdWardrobeLedgerDemandLots", "householdWardrobeConsumptionLots",
   "householdBlanketLedgerDemandLots", "householdBlanketConsumptionLots", "householdWardrobeSpending", "householdBlanketSpending"]
   .map(key => [key, run.samples.reduce((sum: number, sample: any) => sum + sample[key], 0)]))};
});
writeFileSync(output, JSON.stringify({schemaVersion: 1, summarizerSha256: hash(readFileSync("scripts/summarizeEconomyBaseline.mts")),
 notes: ["Food totals include every actual settlement. Quantities are food-ledger units unless labelled kg; payments are cash.",
 "Rural unmet is measured per market per settlement, before aggregation; rounding excess is retained separately in supplied totals.",
 "Urban budget gap is the first binding constraint; stock gap is the remaining affordable but unavailable quantity, not a counterfactual attribution.",
 "Textile consumption flows are interval totals; textile demand/spending are endpoint snapshot sums and cannot establish exact annual fulfilment.",
 "Grain-equivalent mass is a model contract, not a historical or nutritional benchmark. Non-grain rural self-consumption is not measured."], worlds}, null, 2) + "\n");
