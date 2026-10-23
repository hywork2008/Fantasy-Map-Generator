/** Derives E0 comparisons from completed auditWoolSupply runs, without advancing a world. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const [output, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length) throw new Error("Usage: summarizeEconomyBaseline.mts output.json inputs.json...");
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const worlds = inputs.map(path => {
 const bytes = readFileSync(path);
 const run = JSON.parse(bytes.toString());
 if (run.samples.length !== 12 || ![2, 3, 4].includes(run.schemaVersion)) throw new Error(`Incomplete E0 run: ${path}`);
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
 const textileByMarket: Record<string, any> = {};
 let textileSettlementCount = 0;
 for (const sample of run.samples) for (const settlement of sample.textileSettlements ?? []) {
  textileSettlementCount++;
  for (const market of settlement.textiles.markets) {
   const local = textileByMarket[market.marketId] ??= {garments: {}, blankets: {}, production: {rows: []}};
   for (const category of ["garments", "blankets"]) {
    const ledger = market[category];
    if (!ledger?.settlementDiagnostics) continue;
    const totals = local[category];
    for (const row of ledger.settlementDiagnostics.buyers) {
     const sector = row.rural ? "rural" : "urban";
     const target = totals[sector] ??= {};
     const flags = target.constraintBuyerSettlements ??= {};
     for (const reason of row.constraints) flags[reason] = (flags[reason] ?? 0) + 1;
     for (const key of ["need", "supplied", "marketSupplied", "marketPaid", "unmet", "priorityGap", "budgetGap",
       "stockGap", "allocationOrRoundingGap", "noPricedRouteGap"])
      target[key] = (target[key] ?? 0) + row[key];
    }
    for (const key of ["ruralHomeProduction", "commissionDeliveries", "householdSpending"])
     totals[key] = (totals[key] ?? 0) + (ledger[key] ?? 0);
   }
  }
  for (const commission of Object.values(settlement.textiles.commissions ?? {}) as any[]) {
   const local = textileByMarket[commission.marketId] ??= {garments: {}, blankets: {}, production: {rows: []}};
   const target = local.commissions ??= {};
   // Same-calendar guards can retain the prior ledger. Only capture jobs from this exact settlement's deliveries.
   const current = settlement.textiles.markets.find((market: any) => market.marketId === commission.marketId);
   if ((current?.garments?.commissionDeliveries ?? 0) + (current?.blankets?.commissionDeliveries ?? 0) <= 0) continue;
   for (const key of ["garments", "blankets", "materialSpending", "serviceSpending"])
    target[key] = (target[key] ?? 0) + commission[key];
  }
  for (const market of settlement.textiles.production) {
   const local = textileByMarket[market.marketId] ??= {garments: {}, blankets: {}, production: {rows: []}};
   const target = local.production;
   for (const key of ["steps", "maxSteps", "workforcePoints", "chargedPoints", "unusedPoints"])
    target[key] = (target[key] ?? 0) + market[key];
   for (const row of market.rows) {
    let merged = target.rows.find((other: any) => other.stage === row.stage && other.goodId === row.goodId
      && other.constraints.join(",") === row.constraints.join(","));
    if (!merged) {merged = {...row, count: 0, outputLots: 0, laborPoints: 0, wagesPaid: 0, materialCost: 0}; target.rows.push(merged);}
    for (const key of ["count", "outputLots", "laborPoints", "wagesPaid", "materialCost"])
     merged[key] += row[key] ?? 0;
   }
  }
 }
 const initialSource = run.initial.food?.cellFoodFlows;
 const finalSource = run.samples.at(-1).food?.cellFoodFlows;
 const sourceDelta = (closing: number | undefined, opening: number | undefined) =>
  typeof closing === "number" && closing >= (opening ?? 0) ? closing - (opening ?? 0) : null;
 const sourceFoodChanges = initialSource && finalSource ? finalSource.map((row: any) => {
  const opening = initialSource.find((old: any) => old.goodId === row.goodId);
  return {goodId: row.goodId, name: row.name,
   harvested: sourceDelta(row.harvested, opening?.harvested), processed: sourceDelta(row.processed, opening?.processed),
   privateReserveOutput: sourceDelta(row.privateReserveOutput, opening?.privateReserveOutput)};
 }) : null;
 const foodSettlementCoverage = run.samples.flatMap((sample: any) => sample.foodSettlements)
  .filter((event: any) => event.food).map((event: any) => ({date: event.date,
   rural: event.food.coverage.rural, urban: event.food.coverage.urban, byReason: event.food.coverage.byReason,
   uncoveredCells: event.food.coverage.uncoveredCells, uncoveredBurgs: event.food.coverage.uncoveredBurgs}));
 const foodCoverage = [run.initial, ...run.samples].filter((sample: any) => sample.food)
  .map((sample: any) => ({date: sample.date, ...sample.food.coverage}));
 const annualKg = (key: string, denominator: string) => totals[denominator] > 0
  ? totals[key] * run.foodLedgerKgPerUnit * 12 / totals[denominator] : null;
 return {path, sha256: hash(bytes), inputSha256: run.inputSha256, sourceTreeSha256: run.sourceTreeSha256,
  initialProfile: run.initialProfile, worldSettings: run.worldSettings, start: run.initial.date, end: run.samples.at(-1).date,
  foodLedgerKgPerUnit: run.foodLedgerKgPerUnit, foodTotals: totals, foodByMarket: byMarket, foodIntervals: intervals,
  foodKgPerResidentYear: {ruralNeed: annualKg("ruralNeed", "ruralPeopleMonths"),
   ruralSupplied: annualKg("ruralSupplied", "ruralPeopleMonths"), ruralHome: annualKg("ruralFromHousehold", "ruralPeopleMonths"),
   ruralMarket: annualKg("ruralFromMarket", "ruralPeopleMonths"), urbanNeed: annualKg("urbanNeed", "urbanPeopleMonths"),
   urbanSupplied: annualKg("urbanSupplied", "urbanPeopleMonths")},
  primaryFlows: flows, sourceFoodChanges, foodCoverage, foodSettlementCoverage, textileSettlementCount, textileByMarket,
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
 "Schema 3 textileByMarket uses every actual household textile settlement. textileSnapshotTotals remains the old endpoint-only series and is not an exact demand denominator.",
 "Source food counters cover source-planner harvest, not chilled additions. Recorded processing is incomplete for goods outside foodProcessingLedger tracking; zero counters do not prove zero processing.",
 "Grain-equivalent mass is a model contract, not a historical or nutritional benchmark. Non-grain rural self-consumption is not measured."], worlds}, null, 2) + "\n");
