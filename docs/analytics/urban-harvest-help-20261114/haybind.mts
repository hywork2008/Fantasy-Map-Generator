/**
 * What stops each hay cut (docs/analytics/urban-harvest-help-20261114.md §6): after every month, per land
 * cell with a hay cut, the grass that could be cut (standing in + growth above grazing), the planned hay
 * days of the husbandry demand (hayWorkers) and the hay days left of the assigned husbandry days after care,
 * each as kg of raw cut (3 days per tonne DM), and the cut kept (up to the reserve target). Sums kg and
 * cells by the limit that bound. Market settings come from the JSON in FMG_SETTINGS. Barilla as barillaflow.mts.
 *
 *   npx tsx docs/analytics/urban-harvest-help-20261114/haybind.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoodCellColumn, getOrCreateLivestockFeedTable } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getSimulationMonth } from "../../../src/extensions/economy/economyContext";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { getGoods } from "../../../src/extensions/economy/context/trade";
import { setMarketSettings } from "../../../src/simulation/marketSettings";
import { calculateHusbandryDemand } from "../../../src/extensions/economy/generators/husbandry";
import { getHusbandryLaborBudget } from "../../../src/extensions/economy/generators/husbandryLabor";
import { livestockFeedMonth } from "../../../src/extensions/economy/generators/livestockFeedState";
import { WORKABLE_DAYS_PER_ADULT } from "../../../src/extensions/economy/generators/agriculturalLandUse";
import { HAY_WORK_DAYS_PER_TONNE_DM } from "../../../src/extensions/economy/generators/livestockFeedPolicy";

const [input, output, monthsArg] = process.argv.slice(2);
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
const kgOfDays = (days: number) => (Math.max(0, days) / HAY_WORK_DAYS_PER_TONNE_DM) * 1000;
const snapshots = [];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const m0 = livestockFeedMonth() - 1;
  const sums = { plannedKg: 0, grassKg: 0, laborKg: 0, cutKg: 0, keptKg: 0, cells: 0 };
  const bound: Record<string, { cells: number; plannedKg: number; keptKg: number }> = {};
  for (const [key, row] of Object.entries(getOrCreateLivestockFeedTable() ?? {})) {
    if (!row) continue;
    const cell = Number(key);
    const demand = calculateHusbandryDemand(world, cell);
    const budget = getHusbandryLaborBudget(cell, m0, demand);
    const plannedDays = (demand.hayWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT * (demand.hayMonthlyLaborWeights?.[m0] ?? 0);
    if (!(plannedDays > 0)) continue;
    const planned = kgOfDays(plannedDays);
    const labor = kgOfDays(budget.reservedDays - budget.careDays);
    const grass = Math.max(0, row.standingInKg ?? 0) + Math.max(0, (row.pastureGrownKg ?? 0) - (row.grazingReservedKg ?? 0));
    const cut = Math.min(grass, planned, labor);
    const kept = Math.max(0, row.harvestedKg ?? 0);
    const limit = kept < 0.99 * cut ? "target" : cut === planned ? "planned" : cut === grass ? "grass" : "labor";
    sums.plannedKg += planned;
    sums.grassKg += Math.min(grass, planned);
    sums.laborKg += Math.min(labor, planned);
    sums.cutKg += cut;
    sums.keptKg += kept;
    sums.cells++;
    const b = (bound[limit] ??= { cells: 0, plannedKg: 0, keptKg: 0 });
    b.cells++;
    b.plannedKg += planned;
    b.keptKg += kept;
  }
  const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v / 1000)]));
  snapshots.push({
    month,
    calendarMonth: getSimulationMonth(),
    tonnes: round(sums),
    cells: sums.cells,
    bound: Object.fromEntries(Object.entries(bound).map(([k, v]) => [k, { cells: v.cells, ...round({ plannedKg: v.plannedKg, keptKg: v.keptKg }) }]))
  });
  writeFileSync(output, JSON.stringify({ input, settings, snapshots }));
  console.log(`[haybind] ${input} month ${month}`);
}
process.exit(0);
