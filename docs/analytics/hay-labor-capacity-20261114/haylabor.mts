/**
 * Adult hands for haymaking (docs/analytics/hay-labor-capacity-20261114.md): after one month (the annual
 * occupation calendar stored), for every land cell with a herd and each month its hay plan for the
 * wintered herd (each species' larger of present and supported heads, docs/plan/hay-plan-herd.md)
 * cuts, the days that cut needs (HAY_WORK_DAYS_PER_TONNE_DM) against the adults' workable days less
 * what the last annual allocation gave field work, hunting, fishing and vineyards and the herd's care
 * (as scripts/auditFeedShortage.mts §7.58), and the husbandry days the calendar actually reserved.
 *
 *   npx tsx docs/analytics/hay-labor-capacity-20261114/haylabor.mts <map.fmg> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  getFishingRequiredWorkers,
  getFishingWorkers,
  getHuntingWorkers,
  getHouseholdTextileWorkers,
  getHusbandryMonthlyWorkDays,
  getViticultureWorkers
} from "../../../src/extensions/economy/context/agriculture";
import { getFaunaStockTable, getGoodCellColumn, getMarketCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getGoods } from "../../../src/extensions/economy/context/trade";
import { getMonthlyWorkDaysPerAdult, WORKABLE_DAYS_PER_ADULT } from "../../../src/extensions/economy/generators/agriculturalLandUse";
import { DevelopmentPotential } from "../../../src/extensions/economy/generators/developmentPotential";
import { calculateHusbandryDemand, getForageAreaHectares, getGrazedCarryingCapacity } from "../../../src/extensions/economy/generators/husbandry";
import { ANNUAL_FEED_DM_KG_PER_HEAD, getLivestockHayPlan, HAY_WORK_DAYS_PER_TONNE_DM } from "../../../src/extensions/economy/generators/livestockFeedPolicy";
import { getUrbanCraftCapacityRecords } from "../../../src/extensions/economy/generators/urbanCraftCapacity";
import { getPerennialMonthlyLaborWeights } from "../../../src/extensions/economy/generators/viticulture";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";

const [input, output] = process.argv.slice(2);
let cropDaysByMonth: Float32Array | undefined;
let minimumCropDaysByMonth: Float32Array | undefined;
const proto = DevelopmentPotential as unknown as { storeAgriculture(world: unknown, agriculture: { cropLaborDaysByMonth: Float32Array; minimumCropLaborDaysByMonth: Float32Array }): unknown };
const storeAgriculture = proto.storeAgriculture;
proto.storeAgriculture = function (world, agriculture) {
  cropDaysByMonth = agriculture.cropLaborDaysByMonth.slice();
  minimumCropDaysByMonth = agriculture.minimumCropLaborDaysByMonth.slice();
  return storeAgriculture.call(this, world, agriculture);
};
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
await advanceWorld(host, { months: 1 });
const world = getWorldContext();
const cells = world.pack.cells;
const rate = Math.max(1, world.populationRate || 1);
const goods = getGoods();
const stock = getFaunaStockTable() ?? {};
const fishGood = goods.find(good => good.name === "Fish");
const goodColumn = getGoodCellColumn();
const fishingByLandCell = new Map<number, number>();
for (const holder of cells.i) {
  if (!fishGood || goodColumn[holder] !== fishGood.i || !(getFishingRequiredWorkers()[holder] > 0)) continue;
  const land = cells.h[holder] >= 20 ? [holder] : (cells.c[holder] ?? []).filter((n: number) => cells.h[n] >= 20);
  for (const n of land) fishingByLandCell.set(n, (fishingByLandCell.get(n) ?? 0) + (getFishingWorkers()[holder] ?? 0) / land.length);
}
const calendar = getHusbandryMonthlyWorkDays();
const rows = [];
for (const cell of cells.i) {
  if (cells.h[cell] < 20 || !cropDaysByMonth) continue;
  let wintered = 0;
  let present = 0;
  for (const [name, kg] of Object.entries(ANNUAL_FEED_DM_KG_PER_HEAD)) {
    const herd = stock[`${cell}:${name}`];
    const heads = herd ? herd.young + herd.breeding + herd.old : 0;
    const good = goods.find(row => row.name === name);
    present += heads * kg;
    wintered += Math.max(heads, good ? getGrazedCarryingCapacity(cell, good) : 0) * kg;
  }
  if (!(wintered > 0)) continue;
  const plan = getLivestockHayPlan(world, cell, wintered, getForageAreaHectares(cell));
  const demand = calculateHusbandryDemand(world, cell);
  const adults = ((cells.maleAdults?.[cell] ?? 0) + (cells.femaleAdults?.[cell] ?? 0)) * rate;
  const perAdult = getMonthlyWorkDaysPerAdult(cropDaysByMonth, cell * 12);
  const vine = getPerennialMonthlyLaborWeights(world, cell);
  const months = [];
  for (let m = 0; m < 12; m++) {
    const hayKg = plan.rawHarvestKg * (plan.harvestWeights[m] ?? 0);
    if (!(hayKg > 0)) continue;
    const total = demand.requiredWorkers * WORKABLE_DAYS_PER_ADULT * (demand.monthlyLaborWeights?.[m] ?? 0);
    const hayNow = (demand.hayWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT * (demand.hayMonthlyLaborWeights?.[m] ?? 0);
    const care = Math.max(0, total - hayNow);
    const others =
      cropDaysByMonth[cell * 12 + m] +
      ((getHuntingWorkers()[cell] ?? 0) + (fishingByLandCell.get(cell) ?? 0)) * (WORKABLE_DAYS_PER_ADULT / 12) +
      (getViticultureWorkers()[cell] ?? 0) * WORKABLE_DAYS_PER_ADULT * (vine[m] ?? 0);
    months.push({
      m,
      needDays: (hayKg / 1000) * HAY_WORK_DAYS_PER_TONNE_DM,
      adultDays: adults * perAdult[m],
      otherDays: others,
      careDays: care,
      cropDays: cropDaysByMonth[cell * 12 + m],
      minimumCropDays: minimumCropDaysByMonth?.[cell * 12 + m] ?? 0,
      textileDays: (getHouseholdTextileWorkers()[cell] ?? 0) * (WORKABLE_DAYS_PER_ADULT / 12),
      reservedDays: calendar[cell * 12 + m] ?? 0
    });
  }
  rows.push({ cell, market: getMarketCellColumn()[cell] ?? 0, adults, children: (cells.children?.[cell] ?? 0) * rate, biome: world.biomesData.name[cells.biomeCode[cell]], present, wintered, rawHarvestKg: plan.rawHarvestKg, months });
}
const townAdultsByMarket: Record<number, number> = {};
for (const burg of world.pack.burgs ?? []) {
  if (!burg?.i || burg.removed || !burg.demographics || !burg.market) continue;
  const adults = (burg.demographics.maleAdults ?? 0) + (burg.demographics.femaleAdults ?? 0);
  townAdultsByMarket[burg.market] = (townAdultsByMarket[burg.market] ?? 0) + adults * rate * Math.max(0, world.urbanization ?? 1);
}
const craft: Record<number, [number, number]> = {};
for (const record of getUrbanCraftCapacityRecords()) craft[record.burgId] = [record.workforcePoints, record.chargedPoints];
const burgMarket = Object.fromEntries((world.pack.burgs ?? []).filter(b => b?.i && !b.removed).map(b => [b.i, b.market ?? 0]));
writeFileSync(output, JSON.stringify({ input, rows, townAdultsByMarket, craft, burgMarket, rate, urbanization: world.urbanization ?? 1 }));
process.exit(0);
