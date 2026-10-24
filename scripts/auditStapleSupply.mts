/** Read-only physical staple supply audit. Food-ledger units, not total nutrition. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createNodeSimulationHost, advanceWorld } from "../src/simulation/adapters/node";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getMarkets } from "../src/extensions/economy/context/trade";
import { getMarketCellColumn } from "../src/extensions/economy/context/cellTables";
import {
  getCultivableArea,
  getCultivatedArea,
  getFoodPotential,
  getCropLaborCoverage,
  getRuralFoodCapacity,
  getRuralHouseholdFoodStock
} from "../src/extensions/economy/context/agriculture";
import { getRuralGrainDietShare } from "../src/extensions/economy/generators/ruralDiet";
import { GROSS_FOOD_NEED } from "../src/extensions/economy/generators/foodConstants";
import { WAIN_KG } from "../src/extensions/economy/generators/goodMeasureCatalog";
import { setTickStepObserver } from "../src/generators/tickProfiler";
const [input, output, length = "36"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1)
  throw new Error("Expected archive, output and months");
const host = createNodeSimulationHost();
const sum = (values: ArrayLike<number>) => Array.from(values).reduce((s, v) => s + Math.max(0, v), 0);
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const bytes = readFileSync(input);
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  if (host.world.options.initialSettlementPattern !== "standard") throw new Error("Expected Standard");
  (host.simulation as any).worldSettings = {
    ...(host.simulation as any).worldSettings,
    "fmg-long-distance-trade": "on",
    "fmg-caravan-raids": "off"
  };
  const records: unknown[] = [];
  const clock = () => [host.simulation.currentYear, host.simulation.currentMonth, host.simulation.currentDay];
  function supply() {
    const w = getWorldContext(),
      c = w.pack.cells,
      area = getCultivableArea(),
      used = getCultivatedArea(),
      potential = getFoodPotential(),
      coverage = getCropLaborCoverage();
    const rows = Array.from(c.i)
      .filter(id => c.h[id] >= 20)
      .map(id => {
        const land = area[id] > 0 ? Math.min(1, used[id] / area[id]) : 0;
        const beforeLabor = potential[id] * land;
        const need =
          Math.max(0, c.pop[id]) *
          w.populationRate *
          GROSS_FOOD_NEED *
          getRuralGrainDietShare(c, id, getRuralFoodCapacity());
        return {
          id,
          marketId: getMarketCellColumn()[id],
          fieldHa: used[id],
          annualNeed: need,
          annualBeforeLabor: beforeLabor,
          coverage: coverage[id] ?? 1,
          annualAfterLabor: beforeLabor * (coverage[id] ?? 1)
        };
      });
    return {
      date: clock(),
      householdStock: sum(getRuralHouseholdFoodStock()),
      fieldHa: sum(used),
      annualRuralNeed: rows.reduce((s, r) => s + r.annualNeed, 0),
      annualBeforeLabor: rows.reduce((s, r) => s + r.annualBeforeLabor, 0),
      annualAfterLabor: rows.reduce((s, r) => s + r.annualAfterLabor, 0),
      worstCells: rows
        .sort((a, b) => b.annualNeed - b.annualAfterLabor - (a.annualNeed - a.annualAfterLabor))
        .slice(0, 20)
    };
  }
  const initial = supply();
  let before = 0;
  setTickStepObserver({
    enter(label) {
      if (label === "food:production") before = sum(getRuralHouseholdFoodStock());
    },
    exit(label) {
      if (label === "food:production")
        records.push({
          stage: "production",
          ...supply(),
          retained: sum(getRuralHouseholdFoodStock()) - before,
          markets: getMarkets().map(m => ({
            id: m.i,
            produced: m.foodLedger?.foodProduced,
            unsold: m.foodLedger?.unsoldHarvest,
            imported: m.foodLedger?.satisfiedImport
          }))
        });
      if (label === "production:foodConsumption" || label === "food:consumption")
        records.push({
          stage: "consumption",
          date: clock(),
          householdStock: sum(getRuralHouseholdFoodStock()),
          markets: getMarkets().map(m => ({ id: m.i, consumption: m.foodLedger?.monthlyConsumption }))
        });
    }
  });
  for (let i = 0; i < months; i++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
  }
  writeFileSync(
    output,
    JSON.stringify(
      { schemaVersion: 1, inputSha256: hash(bytes), foodLedgerKgPerUnit: WAIN_KG, months, initial, records },
      null,
      2
    ) + "\n"
  );
} finally {
  setTickStepObserver(null);
  host.dispose();
}
