/**
 * Hay plan of the April-short cells of 2102 (docs/analytics/urban-harvest-help-20261114.md §10): the cells
 * listed in cells-2102.json (month 15, unmet above 1% of need). After every month, per cell the wintered hay
 * plan as the cut uses it (getLivestockHayPlan with each species' max of heads and supported herd and the
 * forage area): raw harvest, harvest weights and reserve after each month; the planned hay days and the
 * hay days left of the husbandry budget this month; and the ledger's hay, harvest and grass.
 *
 *   npx tsx docs/analytics/urban-harvest-help-20261114/planread.mts <map.fmg> <cells.json> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getFaunaStockTable, getGoodCellColumn, getOrCreateLivestockFeedTable } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getSimulationMonth } from "../../../src/extensions/economy/economyContext";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { getGoods } from "../../../src/extensions/economy/context/trade";
import { setMarketSettings } from "../../../src/simulation/marketSettings";
import { calculateHusbandryDemand, getForageAreaHectares, getGrazedCarryingCapacity } from "../../../src/extensions/economy/generators/husbandry";
import { getHusbandryLaborBudget } from "../../../src/extensions/economy/generators/husbandryLabor";
import { livestockFeedMonth } from "../../../src/extensions/economy/generators/livestockFeedState";
import { WORKABLE_DAYS_PER_ADULT } from "../../../src/extensions/economy/generators/agriculturalLandUse";
import { ANNUAL_FEED_DM_KG_PER_HEAD, getLivestockHayPlan, HAY_WORK_DAYS_PER_TONNE_DM } from "../../../src/extensions/economy/generators/livestockFeedPolicy";

const [input, cellsJson, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const settings = JSON.parse(process.env.FMG_SETTINGS ?? "{}");
setMarketSettings(settings);
const world = getWorldContext();
const { pack } = world;
const ruleHolds = (rule: string, cellId: number) => {
  const methods = Goods.getMethods(cellId);
  return Boolean(new Function(`{${Object.keys(methods).join(", ")}}`, `return ${rule}`)(methods));
};
const barilla = getGoods().find(good => good.name === "Barilla");
if (barilla?.distribution && barilla.chance) {
  const goodColumn = getGoodCellColumn();
  const random = Alea(`barilla-${world.seed}`);
  const cap = Math.ceil((200 * pack.cells.i.length) / 5000);
  let placed = 0;
  for (const cellId of pack.cells.i) {
    if (pack.cells.h[cellId] < 20 || goodColumn[cellId] === barilla.i) continue;
    if (!ruleHolds(barilla.distribution, cellId)) continue;
    if (goodColumn[cellId] || placed >= cap || random() * 100 > barilla.chance) continue;
    goodColumn[cellId] = barilla.i;
    placed++;
  }
}
const ref = JSON.parse(readFileSync(cellsJson, "utf8"));
const ix = Object.fromEntries(ref.fields.map((f: string, i: number) => [f, i]));
const april = ref.snapshots.find((row: { month: number }) => row.month === 15);
const cells = Object.entries(april.cells as Record<string, number[]>)
  .filter(([, v]) => v[ix.unmetKg] > 0.01 * v[ix.requiredKg])
  .map(([c]) => Number(c));
const goods = getGoods();
function winteredNeed(cell: number): number {
  const table = getFaunaStockTable();
  return Object.entries(ANNUAL_FEED_DM_KG_PER_HEAD).reduce((sum, [name, kg]) => {
    const herd = table?.[`${cell}:${name}`];
    const heads = herd ? Math.max(0, herd.young) + Math.max(0, herd.breeding) + Math.max(0, herd.old) : 0;
    const good = goods.find(row => row.name === name);
    return sum + Math.max(heads, good ? getGrazedCarryingCapacity(cell, good) : 0) * kg;
  }, 0);
}
const r0 = (v: number) => Math.round(v);
const snapshots = [];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const m0 = livestockFeedMonth() - 1;
  const rows: Record<string, unknown> = {};
  for (const cell of cells) {
    const row = getOrCreateLivestockFeedTable()?.[cell];
    const need = winteredNeed(cell);
    const plan = getLivestockHayPlan(world, cell, need, getForageAreaHectares(cell));
    const demand = calculateHusbandryDemand(world, cell);
    const budget = getHusbandryLaborBudget(cell, m0, demand);
    const plannedDays = (demand.hayWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT * (demand.hayMonthlyLaborWeights?.[m0] ?? 0);
    rows[cell] = {
      need: r0(need),
      rawHarvest: r0(plan.rawHarvestKg),
      weights: plan.harvestWeights.map(w => Math.round(w * 1000) / 1000),
      reserve: plan.reserveAfterMonthKg.map(r0),
      plannedKg: r0((plannedDays / HAY_WORK_DAYS_PER_TONNE_DM) * 1000),
      laborKg: r0((Math.max(0, budget.reservedDays - budget.careDays) / HAY_WORK_DAYS_PER_TONNE_DM) * 1000),
      hay: r0(row?.hayKg ?? 0),
      harvested: r0(row?.harvestedKg ?? 0),
      grown: r0(row?.pastureGrownKg ?? 0),
      required: r0(row?.requiredKg ?? 0)
    };
  }
  snapshots.push({ month, calendarMonth: getSimulationMonth(), m0, rows });
  writeFileSync(output, JSON.stringify({ input, settings, cells, snapshots }));
  console.log(`[planread] ${input} month ${month}`);
}
process.exit(0);
