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
  if (run.schemaVersion !== 6 || ![12, 13, 36].includes(run.samples.length))
    throw new Error(`Expected a completed 12/13/36-month schema 6 replay: ${path}`);
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
  const foodImports: Record<string, {
    outcomes: Record<string, number>; loaded: number; deliveredBeforeRounding: number;
    produced: number; imported: number; productionPasses: number; minBalance: number; maxBalance: number
  }> = {};
  const importRow = (id: number) => foodImports[id] ??= {
    outcomes: {}, loaded: 0, deliveredBeforeRounding: 0, produced: 0, imported: 0,
    productionPasses: 0, minBalance: Infinity, maxBalance: -Infinity
  };
  for (const sample of annual) {
    for (const settlement of sample.foodImportSettlements ?? []) {
      for (const market of settlement.markets) {
        const row = importRow(market.id);
        row.produced += market.food?.produced ?? 0;
        row.imported += market.food?.imported ?? 0;
        row.productionPasses++;
        row.minBalance = Math.min(row.minBalance, market.balance);
        row.maxBalance = Math.max(row.maxBalance, market.balance);
      }
      for (const attempt of settlement.attempts) {
        const row = importRow(attempt.toMarketId);
        row.outcomes[attempt.outcome] = (row.outcomes[attempt.outcome] ?? 0) + 1;
        row.loaded += attempt.loaded ?? 0;
        row.deliveredBeforeRounding += attempt.delivered ?? 0;
      }
    }
  }
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
  const feedYears = [];
  for (let start = 0; start + 12 <= run.samples.length; start += 12) {
    const intervals = run.samples.slice(start, start + 12);
    const events = intervals.flatMap((sample: any) => sample.livestockFeedSettlements ?? []);
    const totals: Record<string, number> = {};
    const byMarket: Record<string, any> = {};
    const fields = ["requiredKg", "pastureGrownKg", "pastureConsumedKg", "harvestedKg", "harvestLossKg",
      "storageLossKg", "hayConsumedKg", "unharvestedKg", "purchasedKg", "soldKg", "unmetKg", "spending", "revenue", "referenceHarvestCapacityKg"];
    for (const event of events) for (const market of event.markets) {
      const row = byMarket[market.marketId] ??= { totals: {}, minRuralCash: null, minMarketCash: null, peakMarketFodderKg: 0 };
      for (const name of fields) {
        totals[name] = (totals[name] ?? 0) + (market.totals[name] ?? 0);
        row.totals[name] = (row.totals[name] ?? 0) + (market.totals[name] ?? 0);
      }
      for (const [source, target] of [["ruralCash", "minRuralCash"], ["marketCash", "minMarketCash"]])
        if (market[source] != null) row[target] = row[target] == null ? market[source] : Math.min(row[target], market[source]);
      row.peakMarketFodderKg = Math.max(row.peakMarketFodderKg, market.marketFodderKg ?? 0);
      row.end = { hayKg: market.totals.hayKg, marketFodderKg: market.marketFodderKg,
        ruralCash: market.ruralCash, marketCash: market.marketCash,
        assignedWorkers: market.totals.assignedWorkers, requiredWorkers: market.totals.requiredWorkers,
        seasonalGapKg: market.totals.seasonalGapKg,
        annualPlannedRawHayKg: market.totals.annualPlannedRawHayKg ?? null };
    }
    const foodUnmet = { rural: 0, urban: 0 };
    for (const sample of intervals) for (const event of sample.foodSettlements) for (const market of event.markets) {
      const row = market.food?.monthlyConsumption;
      if (row) {
        foodUnmet.rural += Math.max(0, row.ruralNeed - row.ruralSupplied);
        foodUnmet.urban += Math.max(0, row.urbanNeed - row.urbanSupplied);
      }
    }
    feedYears.push({ year: start / 12 + 1, end: point(intervals.at(-1)), settlementCount: events.length,
      periods: events.map((event: any) => event.period),
      settlements: events.map((event: any) => ({ date: event.date, period: event.period, month: event.month,
        totals: Object.fromEntries(fields.map(name => [name, event.markets.reduce((sum: number, market: any) => sum + (market.totals[name] ?? 0), 0)])) })), totals,
      unmetShare: totals.requiredKg > 0 ? totals.unmetKg / totals.requiredKg : null,
      byMarket, foodUnmetLedgerUnits: foodUnmet,
      garmentDeliveriesLots: intervals.reduce((sum: number, row: any) => sum + row.householdWardrobeConsumptionLots, 0),
      blanketDeliveriesLots: intervals.reduce((sum: number, row: any) => sum + row.householdBlanketConsumptionLots, 0),
      woolMarketInflowKg: intervals.reduce((sum: number, row: any) => sum + (row.primaryFlows.Wool?.["source:ruralHarvest"] ?? 0) * run.woolKgPerLot, 0)
    });
  }
  return {
    path,
    feedYears,
    bytes: bytes.length,
    sha256: hash(bytes),
    inputSha256: run.inputSha256,
    sourceTreeSha256: run.sourceTreeSha256,
    relevantSourceHashes: Object.fromEntries(
      Object.entries(run.sourceHashes).filter(([name]) =>
        /\/(developmentPotential|foodLedgerConsumption|foodProduction|husbandry|livestockFeed|livestockFeedPolicy|livestockFeedState|livestockFeedSchedule|production-generator|simulation|cadencePhases)\.ts$/.test(name)
      )
    ),
    initial: point(run.initial),
    yearEnd: point(final),
    annual: {
      foodLedgerKgPerUnit: run.foodLedgerKgPerUnit,
      foodTotals,
      foodByMarket: food,
      foodImports,
      feedRequiredKg: feedRequired,
      feedUnmetKg: feedUnmet,
      feedUnmetShare: feedRequired > 0 ? feedUnmet / feedRequired : null,
      maxMonthlyFeedUnmetKg: Math.max(...annual.map((row: any) => row.feedTotals.unmetKg)),
      goods,
      woolMarketInflowKg: (goods.Wool["source:ruralHarvest"] ?? 0) * run.woolKgPerLot,
      garmentDeliveriesLots: annual.reduce((sum: number, row: any) => sum + row.householdWardrobeConsumptionLots, 0),
      blanketDeliveriesLots: annual.reduce((sum: number, row: any) => sum + row.householdBlanketConsumptionLots, 0)
    },
    extraMonth: run.samples.length === 13 && run.samples[12]
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
    "feedYears uses distinct actual feed settlements in each 12 calendar intervals; missing periods are not assumed fed. Forecast fields in market end are not summed actual flows.",
    "Annual totals use exactly the first 12 intervals; the 13th month is a separate transition check.",
    "Food is ledger units unless labelled kg; feed is dry-matter kg. Goods flows retain catalog units.",
    "Feed totals are endpoint samples, not a tick-exact feeding history. Wool is actual market inflow.",
    "World aggregate pasture occupancy cannot rule out individual-cell or seasonal shortages.",
    "Inputs are independent source variants labelled by their paths; compare recorded source hashes and experimental notes.",
    "foodImports is empty for older audits without import observations, not evidence of zero imports.",
    "Import outcomes count evaluated supplier opportunities, not people. DeliveredBeforeRounding is not the rounded inventory credit.",
    "A ledger created at consumption time does not transfer public stocks from the former market."
  ],
  worlds
}, null, 2)}\n`);
