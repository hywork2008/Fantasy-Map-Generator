/**
 * E1 §7.46 audit: haymaking labor per month against the hay plan. Aggregates the second year by
 * calendar month and by month offset from each cell's main cut.
 * Usage: auditHayLabor.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { WORKABLE_DAYS_PER_ADULT } from "../src/extensions/economy/generators/agriculturalLandUse";
import { calculateHusbandryDemand, getForageAreaHectares } from "../src/extensions/economy/generators/husbandry";
import { getHusbandryLaborBudget } from "../src/extensions/economy/generators/husbandryLabor";
import { getLivestockHayPlan, HAY_WORK_DAYS_PER_TONNE_DM } from "../src/extensions/economy/generators/livestockFeedPolicy";
import { getLivestockMonthlyFeedNeedKg } from "../src/extensions/economy/generators/livestockFeed";
import { livestockFeedMonth, livestockFeedPeriod } from "../src/extensions/economy/generators/livestockFeedState";
import { setTickStepObserver } from "../src/generators/tickProfiler";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "24"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 12)
  throw new Error("Usage: auditHayLabor.mts <archive.fmg> <output.json> [months>=12]");
const empty = () => ({
  cells: 0,
  reservedDays: 0,
  careRequiredDays: 0,
  plannedHayDays: 0,
  hayCapacityDays: 0,
  cuttableKg: 0,
  harvestedKg: 0,
  unharvestedKg: 0,
  standingOutKg: 0,
  workerMonths: 0
});
type Row = ReturnType<typeof empty>;
const byMonth = Array.from({ length: 12 }, empty);
const byOffset = Array.from({ length: 12 }, empty);
const bytes = readFileSync(input);
const host = createNodeSimulationHost();
let recording = false;
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  setTickStepObserver({
    enter() {},
    exit(label) {
      if (label !== "production:forageHarvest" || !recording) return;
      const world = getWorldContext();
      const table = getOrCreateLivestockFeedTable() ?? {};
      const period = livestockFeedPeriod();
      const month = livestockFeedMonth() - 1;
      for (const [key, row] of Object.entries(table)) {
        const cell = Number(key);
        if (row.harvestPeriod !== period) continue;
        const demand = calculateHusbandryDemand(world, cell);
        const budget = getHusbandryLaborBudget(cell, month, demand);
        const plan = getLivestockHayPlan(world, cell, getLivestockMonthlyFeedNeedKg(cell) * 12, getForageAreaHectares(cell));
        const planned = (demand.hayWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT * (demand.hayMonthlyLaborWeights?.[month] ?? 0);
        const mainCut = plan.shutUpMonth >= 0 ? (plan.shutUpMonth + 1) % 12 : -1;
        const add = (target: Row) => {
          target.cells++;
          target.reservedDays += budget.reservedDays;
          target.careRequiredDays += budget.careRequiredDays;
          target.plannedHayDays += planned;
          target.hayCapacityDays += budget.hayCapacityDays;
          target.cuttableKg += row.pastureGrownKg - row.grazingReservedKg + (row.standingInKg ?? 0);
          target.harvestedKg += row.harvestedKg;
          target.unharvestedKg += row.unharvestedKg;
          target.standingOutKg += row.standingKg ?? 0;
          target.workerMonths += budget.workerMonths;
        };
        add(byMonth[month]);
        if (mainCut >= 0) add(byOffset[(month - mainCut + 12) % 12]);
      }
    }
  });
  for (let month = 1; month <= months; month++) {
    recording = month > months - 12;
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    console.error(`[hay-labor] ${month}/${months}`);
  }
  const finish = (rows: Row[]) =>
    rows.map((row, index) => ({
      index,
      ...row,
      capacityKg: (row.hayCapacityDays / HAY_WORK_DAYS_PER_TONNE_DM) * 1000,
      plannedKg: (row.plannedHayDays / HAY_WORK_DAYS_PER_TONNE_DM) * 1000
    }));
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        notes: [
          "Last 12 months. byOffset counts months after each cell's main cut (0 = main cut); cells without one are excluded.",
          "harvestedKg includes hay sold as Fodder; capacityKg is labor-limited cutting at HAY_WORK_DAYS_PER_TONNE_DM."
        ],
        byMonth: finish(byMonth),
        byOffset: finish(byOffset)
      },
      null,
      2
    )}\n`
  );
} finally {
  setTickStepObserver(null);
  host.dispose();
}
