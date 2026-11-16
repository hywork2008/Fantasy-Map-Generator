/**
 * Lean stock (docs/analytics/livestock-lean-condition-20261116.md): workyear.mts of rural-work-year-20261115 with,
 * after every month, the cells' lean deficit and spare grass eaten back, the markets' carcass factors, and the
 * Meat and Tallow credited at slaughter, the Fodder value, stock and mean market price (added for fodder-value-20261116), and (§3) the cells selling unfed stock or losing stock to hunger, in
 * heads of feed need (monthly need x share).
 *
 *   npx tsx docs/analytics/livestock-lean-condition-20261116/leanprobe.mts <map.fmg> <out.json> <months>
 */
import { getHouseholdTextileWorkers, getHusbandryWorkers } from "../../../src/extensions/economy/context/agriculture";
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoodCellColumn, getOrCreateLivestockFeedTable } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getSimulationMonth } from "../../../src/extensions/economy/economyContext";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { getBurgMarketLedgers, getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { personalCashTotal, readPersonalCash } from "../../../src/extensions/economy/generators/personalCash";
import { getSimulationCharacters as getCharacters } from "../../../src/extensions/characters/charactersContext";
import { setMarketSettings } from "../../../src/simulation/marketSettings";
import { getGuildKnowledgeStocks } from "../../../src/extensions/economy/context/knowledge";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";
import { getTownHarvestHelperDays } from "../../../src/extensions/economy/context/agriculture";
import { getUrbanCraftCapacityRecords } from "../../../src/extensions/economy/generators/urbanCraftCapacity";
import { getMarketLeanCarcassFactors, livestockFeedMonth } from "../../../src/extensions/economy/generators/livestockFeedState";

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
const byId = new Map(getGoods().map(g => [g.i, g]));
let made: Record<string, number> = {};
let carcass: Record<string, number> = {};
setGoodFlowObserver(flow => {
  const good = byId.get(flow.goodId)?.name;
  if (flow.direction === "source" && (good === "Meat" || good === "Tallow") && flow.units > 0)
    carcass[`${good}:${flow.category}`] = (carcass[`${good}:${flow.category}`] ?? 0) + flow.units;
  if (flow.direction !== "source" || flow.category !== "burgCraft" || !(flow.units > 0)) return;
  const name = byId.get(flow.goodId)?.name;
  if (name) made[name] = (made[name] ?? 0) + flow.units;
});
const HOLDERS = ["rural", "market", "guild", "town", "burg", "people", "state"];
function holders(): number[] {
  let rural = 0;
  let market = 0;
  for (const m of getMarkets()) {
    if (!m) continue;
    rural += m.foodLedger?.ruralHouseholdWealth ?? 0;
    market += m.marketTreasury?.balance ?? 0;
  }
  let burg = 0;
  for (const b of pack.burgs ?? []) if (b?.i && !b.removed) burg += b.treasury ?? 0;
  let state = 0;
  for (const s of pack.states ?? []) if (s?.i && !s.removed) state += s.treasury ?? 0;
  return [
    rural,
    market,
    getGuildKnowledgeStocks().reduce((sum, g) => sum + (g.treasury ?? 0), 0),
    getBurgMarketLedgers().reduce((sum, l) => sum + (l.householdWealth ?? 0), 0),
    burg,
    readPersonalCash() ? personalCashTotal() : getCharacters().reduce((sum, c) => sum + (c?.wealth ?? 0), 0),
    state
  ];
}
const r2 = (v: number) => Math.round(v * 100) / 100;
const snapshots = [];
for (let month = 1; month <= months; month++) {
  made = {};
  carcass = {};
  await advanceWorld(host, { months: 1 });
  const feed = { cullCells: 0, cullNeedKg: 0, deathCells: 0, deathNeedKg: 0, leanDeficitKg: 0, refedKg: 0, leanCells: 0, requiredKg: 0, unmetKg: 0, purchasedKg: 0, hayKg: 0, grainFeedKg: 0, ownGrainFeedKg: 0, cells: 0, shortCells: 0 };
  for (const row of Object.values(getOrCreateLivestockFeedTable() ?? {})) {
    if (!row || !(row.requiredKg > 0)) continue;
    feed.requiredKg += row.requiredKg;
    feed.unmetKg += row.unmetKg;
    feed.purchasedKg += row.purchasedKg ?? 0;
    feed.hayKg += row.hayKg;
    feed.grainFeedKg += (row as { grainFeedKg?: number }).grainFeedKg ?? 0;
    feed.ownGrainFeedKg += (row as { ownGrainFeedKg?: number }).ownGrainFeedKg ?? 0;
    feed.cells++;
    feed.leanDeficitKg += row.leanDeficitKg ?? 0;
    feed.refedKg += row.refedKg ?? 0;
    if ((row.leanCullShare ?? 0) > 0) {
      feed.cullCells++;
      feed.cullNeedKg += row.requiredKg * (row.leanCullShare ?? 0);
    }
    if ((row.leanDeathShare ?? 0) > 0) {
      feed.deathCells++;
      feed.deathNeedKg += row.requiredKg * (row.leanDeathShare ?? 0);
    }
    if ((row.leanDeficitKg ?? 0) > 0.01 * row.requiredKg) feed.leanCells++;
    if (row.unmetKg > 0.01 * row.requiredKg) feed.shortCells++;
  }
  const helperDays = getTownHarvestHelperDays();
  const m0 = livestockFeedMonth() - 1;
  let helpers = 0;
  let helperTowns = 0;
  for (let b = 0; b * 12 < helperDays.length; b++) {
    const d = helperDays[b * 12 + m0] ?? 0;
    helpers += d;
    if (d > 0) helperTowns++;
  }
  const craft = { workforce: 0, charged: 0, towns: 0, fullTowns: 0 };
  for (const row of getUrbanCraftCapacityRecords()) {
    craft.workforce += row.workforcePoints;
    craft.charged += row.chargedPoints;
    craft.towns++;
    if (row.chargedPoints >= 0.99 * row.workforcePoints) craft.fullTowns++;
  }
  let madeValue = 0;
  for (const [name, units] of Object.entries(made)) madeValue += units * (getGoods().find(g => g.name === name)?.value ?? 0);
  snapshots.push({
    month,
    calendarMonth: getSimulationMonth(),
    feed: Object.fromEntries(Object.entries(feed).map(([k, v]) => [k, Math.round(v)])),
    helperDays: Math.round(helpers),
    helperTowns,
    craft: Object.fromEntries(Object.entries(craft).map(([k, v]) => [k, r2(v)])),
    madeValue: r2(madeValue),
    carcass: Object.fromEntries(Object.entries(carcass).map(([k, v]) => [k, r2(v)])),
    leanFactors: Object.fromEntries([...getMarketLeanCarcassFactors()].map(([k, v]) => [k, Math.round(v * 1e4) / 1e4])),
    made: Object.fromEntries(Object.entries(made).map(([k, v]) => [k, r2(v)])),
    holders: holders().map(r2),
    fodder: (() => {
      const g = getGoods().find(x => x.name === "Fodder");
      let stock = 0, priced = 0, n = 0;
      for (const m of getMarkets()) {
        const row = g && m?.goods[g.i];
        if (!row) continue;
        stock += row.stock;
        priced += row.price;
        n++;
      }
      return { value: g?.value ?? null, stock: r2(stock), meanPrice: n ? Math.round((priced / n) * 1e4) / 1e4 : null };
    })(),
    textileWorkers: r2(getHouseholdTextileWorkers().reduce((sum, v) => sum + v, 0)),
    husbandryWorkers: r2(getHusbandryWorkers().reduce((sum, v) => sum + v, 0)),
    ruralPop: r2(Array.from(pack.cells.pop as ArrayLike<number>).reduce((sum, v, c) => sum + (pack.cells.h[c] >= 20 ? v : 0), 0)),
    burgPop: r2((pack.burgs ?? []).reduce((sum, b) => sum + (b?.i && !b.removed ? (b.population ?? 0) : 0), 0))
  });
  writeFileSync(output, JSON.stringify({ input, settings, holders: HOLDERS, snapshots }));
  console.log(`[leanprobe] ${input} month ${month}`);
}
process.exit(0);
