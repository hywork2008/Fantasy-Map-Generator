/**
 * Feed still short with hay at its historical value (docs/analytics/fodder-residual-20261116.md): grainprobe.mts of
 * livestock-feed-shortfall-20261115 with, per short market, the Fodder price, the farms' spending on feed this month
 * and the hay they bought, and the cost of the remaining shortage in hay at that price.
 *
 *   npx tsx docs/analytics/fodder-residual-20261116/residualprobe.mts <map.fmg> <out.json> <months>
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
  snapshots.push({ month, calendarMonth: getSimulationMonth(), rows });
  console.log(`[residualprobe] ${input} month ${month}`);
}
writeFileSync(output, JSON.stringify({ input, settings, snapshots }));
process.exit(0);
