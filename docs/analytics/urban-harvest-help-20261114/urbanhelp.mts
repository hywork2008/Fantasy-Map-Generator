/**
 * Town harvest help (docs/analytics/urban-harvest-help-20261114.md): each month, the livestock feed ledger
 * summed over cells (herdfeed.mts of herd-feed-20261114), the town helper days booked for this month, the
 * town workshop workforce and the part it used (urbanCraftCapacity), town craft output by good (units and
 * units x base value), and the money of the main holders (holdersteps.mts of herd-offtake-spread-20261114).
 * Market settings come from the JSON in FMG_SETTINGS. Barilla is seeded as in barillaflow.mts.
 *
 *   npx tsx docs/analytics/urban-harvest-help-20261114/urbanhelp.mts <map.fmg> <out.json> <months>
 */
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
import { livestockFeedMonth } from "../../../src/extensions/economy/generators/livestockFeedState";

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
setGoodFlowObserver(flow => {
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
  await advanceWorld(host, { months: 1 });
  const feed = { requiredKg: 0, unmetKg: 0, purchasedKg: 0, hayKg: 0, cells: 0, shortCells: 0 };
  for (const row of Object.values(getOrCreateLivestockFeedTable() ?? {})) {
    if (!row || !(row.requiredKg > 0)) continue;
    feed.requiredKg += row.requiredKg;
    feed.unmetKg += row.unmetKg;
    feed.purchasedKg += row.purchasedKg ?? 0;
    feed.hayKg += row.hayKg;
    feed.cells++;
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
    made: Object.fromEntries(Object.entries(made).map(([k, v]) => [k, r2(v)])),
    holders: holders().map(r2)
  });
  writeFileSync(output, JSON.stringify({ input, settings, holders: HOLDERS, snapshots }));
  console.log(`[urbanhelp] ${input} month ${month}`);
}
process.exit(0);
