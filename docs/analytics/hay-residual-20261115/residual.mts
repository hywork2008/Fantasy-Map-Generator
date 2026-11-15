/**
 * What limits the hay of the cells still short in winter with the hay catch-up (docs/analytics/hay-residual-20261115.md).
 * After every month, for every cell with livestock or forage: grass grown, grazing, cuttable grass (standing in +
 * surplus), the hay hands of this month in kg (hay capacity days / 3 days per t), the reserve target after the
 * month, hay cut kept, drying and storage loss, hay in the barn, required, unmet, crop residue fed, bought,
 * sold, the catch-up days given to the month and the household textile workers (x1000, added for
 * docs/analytics/rural-work-year-20261115.md).
 *
 *   npx tsx docs/analytics/hay-residual-20261115/residual.mts <map.fmg> <out.json> <months>
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
import { ANNUAL_FEED_DM_KG_PER_HEAD, getLivestockHayPlan, HAY_WORK_DAYS_PER_TONNE_DM } from "../../../src/extensions/economy/generators/livestockFeedPolicy";
import { getHayCatchUpDays, getHouseholdTextileWorkers } from "../../../src/extensions/economy/context/agriculture";
import { getForageAreaHectares, getGrazedCarryingCapacity } from "../../../src/extensions/economy/generators/husbandry";
import { getFaunaStockTable } from "../../../src/extensions/economy/context/cellTables";

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
const goods = getGoods();
function getWinteredHerdAnnualNeedKg(cell: number): number {
  const table = getFaunaStockTable();
  return Object.entries(ANNUAL_FEED_DM_KG_PER_HEAD).reduce((sum, [name, kg]) => {
    const herd = table?.[`${cell}:${name}`];
    const heads = herd ? Math.max(0, herd.young) + Math.max(0, herd.breeding) + Math.max(0, herd.old) : 0;
    const good = goods.find(row => row.name === name);
    return sum + Math.max(heads, good ? getGrazedCarryingCapacity(cell, good) : 0) * kg;
  }, 0);
}
const fields = ["grown", "grazing", "cuttable", "laborKg", "reserveTarget", "cutKept", "harvestLoss", "storageLoss", "hay", "required", "unmet", "residue", "bought", "sold", "catchUpDays", "textileWorkers"];
const snapshots = [];
const r0 = (v: number) => Math.round(v ?? 0);
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const m0 = livestockFeedMonth() - 1;
  const table = getOrCreateLivestockFeedTable();
  const catchUp = getHayCatchUpDays();
  const cells: Record<string, number[]> = {};
  for (const cell of pack.cells.i) {
    const row = table?.[cell];
    if (!row || !(row.requiredKg > 0 || row.hayKg > 0 || row.pastureGrownKg > 0)) continue;
    const budget = getHusbandryLaborBudget(cell, m0, calculateHusbandryDemand(world, cell));
    cells[cell] = [
      row.pastureGrownKg, row.grazingReservedKg, (row.standingInKg ?? 0) + Math.max(0, row.pastureGrownKg - row.grazingReservedKg),
      (budget.hayCapacityDays / HAY_WORK_DAYS_PER_TONNE_DM) * 1000, getLivestockHayPlan(world, cell, getWinteredHerdAnnualNeedKg(cell), getForageAreaHectares(cell)).reserveAfterMonthKg[m0],
      row.harvestedKg - row.harvestLossKg, row.harvestLossKg, row.storageLossKg, row.hayKg, row.requiredKg, row.unmetKg,
      row.cropResidueFeedKg ?? 0, row.purchasedKg, row.soldKg, catchUp[cell * 12 + m0] ?? 0,
      (getHouseholdTextileWorkers()[cell] ?? 0) * 1000
    ].map(r0);
  }
  snapshots.push({ month, calendarMonth: getSimulationMonth(), m0, cells });
  console.log(`[residual] ${input} month ${month}`);
}
writeFileSync(output, JSON.stringify({ input, settings, fields, snapshots }));
process.exit(0);
