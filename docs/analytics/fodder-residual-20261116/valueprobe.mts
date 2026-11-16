/**
 * Why the worth rule bought little (docs/analytics/fodder-residual-20261116.md §4): residualprobe.mts with, for every
 * cell short of feed, its herds by species, the unfed value per kg split into meat, milk and wool, and the hay price
 * per kg in its market.
 *
 *   npx tsx docs/analytics/fodder-residual-20261116/valueprobe.mts <map.fmg> <out.json> <months>
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
const markets = (await import("../../../src/extensions/economy/context/trade")).getMarkets;
const { getTradeableStapleCropUnits } = await import("../../../src/extensions/economy/generators/stapleCropInventory");
const { getRuralHouseholdWealth } = await import("../../../src/extensions/economy/generators/householdWealth");
const { getMarketCellColumn } = await import("../../../src/extensions/economy/context/cellTables");
const { getUnfedValuePerKg, getLivestockMonthlyFeedNeedKg } = await import("../../../src/extensions/economy/generators/livestockFeed");
const { getMilkOutput } = await import("../../../src/extensions/economy/generators/dairy");
const { getWoolOutput } = await import("../../../src/extensions/economy/generators/woolProduction");
const { getFaunaStockTable } = await import("../../../src/extensions/economy/context/cellTables");
const { getMarketSettings } = await import("../../../src/simulation/marketSettings");
const names = ["Oats", "Barley", "Peas", "Broad Beans", "Wheat", "Rye"];
const snapshots = [];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const table = getOrCreateLivestockFeedTable() ?? {};
  const marketCells = getMarketCellColumn();
  const short = new Map<number, { cells: number; unmetKg: number; grainKg: number; spending: number; purchasedKg: number; requiredKg: number }>();
  for (const [cell, row] of Object.entries(table)) {
    if (!row || !(row.unmetKg > 0.01 * row.requiredKg)) continue;
    const m = marketCells[Number(cell)] ?? 0;
    const e = short.get(m) ?? { cells: 0, unmetKg: 0, grainKg: 0, spending: 0, purchasedKg: 0, requiredKg: 0 };
    e.cells++;
    e.unmetKg += row.unmetKg;
    e.grainKg += (row as { grainFeedKg?: number }).grainFeedKg ?? 0;
    e.requiredKg += row.requiredKg;
    short.set(m, e);
  }
  const spent = new Map<number, { spending: number; purchasedKg: number }>();
  for (const [cell, row] of Object.entries(table)) {
    if (!row) continue;
    const m = marketCells[Number(cell)] ?? 0;
    const e = spent.get(m) ?? { spending: 0, purchasedKg: 0 };
    e.spending += row.spending ?? 0;
    e.purchasedKg += row.purchasedKg ?? 0;
    spent.set(m, e);
  }
  const rows = [];
  for (const market of markets()) {
    const e = market && short.get(market.i);
    if (!e || !market.foodLedger) continue;
    const ledger = market.foodLedger;
    const grains: Record<string, unknown> = {};
    for (const name of names) {
      const good = getGoods().find(g => g.name === name);
      if (!good) continue;
      const inv = ledger.stapleCropInventories?.[good.i];
      grains[name] = {
        stored: inv ? Math.round(inv.age0 + inv.age1 + inv.age2 + (inv.age3 ?? 0)) : null,
        tradeable: getTradeableStapleCropUnits(ledger, good.i),
        price: market.goods[good.i]?.price ?? null
      };
    }
    rows.push({
      market: market.i,
      ...e,
      wealth: Math.round(getRuralHouseholdWealth(market)),
      exportable: Math.round(ledger.exportable ?? 0),
      overflow: Math.round(ledger.storageOverflow ?? 0),
      fodderStock: market.goods[getGoods().find(g => g.name === "Fodder")?.i ?? -1]?.stock ?? null,
      fodderPrice: market.goods[getGoods().find(g => g.name === "Fodder")?.i ?? -1]?.price ?? null,
      marketSpending: Math.round((spent.get(market.i)?.spending ?? 0) * 100) / 100,
      marketPurchasedKg: Math.round(spent.get(market.i)?.purchasedKg ?? 0),
      grains
    });
  }
  const cellRows = [];
  const priceOf = (market: (ReturnType<typeof markets>)[number], name: string) => {
    const g = getGoods().find(x => x.name === name);
    return g ? (market.goods[g.i]?.price ?? g.value) : 0;
  };
  for (const [cell, row] of Object.entries(table)) {
    if (!row || !(row.unmetKg > 0.01 * row.requiredKg)) continue;
    const c = Number(cell);
    const market = markets().find(m => m && m.i === (marketCells[c] ?? 0));
    if (!market) continue;
    const herds: Record<string, number> = {};
    for (const name of ["Cattle", "Sheep", "Goats", "Horses", "Camels"]) {
      const h = getFaunaStockTable()?.[`${c}:${name}`];
      if (h) herds[name] = Math.round(h.young + h.breeding + h.old);
    }
    const s = getMarketSettings();
    const need = getLivestockMonthlyFeedNeedKg(c);
    const milkMonth = getMilkOutput(c) * priceOf(market, "Milk");
    const woolMonth = getWoolOutput(c) * priceOf(market, "Wool");
    cellRows.push({
      cell: c,
      market: market.i,
      herds,
      requiredKg: Math.round(row.requiredKg),
      unmetKg: Math.round(row.unmetKg),
      needKg: Math.round(need),
      value: getUnfedValuePerKg(market, c, row.requiredKg),
      milkPerKg: milkMonth / row.requiredKg + (s.leanMilkLoss * milkMonth * (0.5 / s.leanRefeedShare)) / (s.leanReserveMonths * need),
      woolPerKg: woolMonth / row.requiredKg,
      meatPrice: priceOf(market, "Meat"),
      milkPrice: priceOf(market, "Milk"),
      hayPerKg: priceOf(market, "Fodder") / 170
    });
  }
  snapshots.push({ month, calendarMonth: getSimulationMonth(), rows, cells: cellRows });
  console.log(`[valueprobe] ${input} month ${month}`);
}
writeFileSync(output, JSON.stringify({ input, settings, snapshots }));
process.exit(0);
