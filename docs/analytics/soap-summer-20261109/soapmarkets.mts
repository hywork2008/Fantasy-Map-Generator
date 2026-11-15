/**
 * Town soap by market (docs/analytics/soap-summer-20261109.md): each month, every market's flows of
 * the soft soap and its ingredients by direction and category, its month-end stocks and prices, its
 * hearth ash ledger, its towns' soap need, the money its towns hold, and its towns' production
 * diagnostics (the reasons each guard gave) for the soft soap and potash. Barilla is seeded as in
 * barillaflow.mts (docs/analytics/barilla-20261108.md) so the runs match its maps.
 *
 *   npx tsx docs/analytics/soap-summer-20261109/soapmarkets.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getGoodCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";
import { getSimulationMonth } from "../../../src/extensions/economy/economyContext";
import { getUrbanCraftCapacityRecords } from "../../../src/extensions/economy/generators/urbanCraftCapacity";
import { getWoodSupplyMonthKey } from "../../../src/extensions/economy/generators/heating";
import { getMonthlyTownSoapDemand } from "../../../src/extensions/economy/generators/townSoap";

const NAMES = ["Soap", "Potash", "Ash", "Tallow", "Wood"];
const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 24);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
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
const nameById = new Map(getGoods().map(good => [good.i, good.name]));
const byName = new Map(getGoods().map(good => [good.name, good]));
let flows: Record<number, Record<string, number>> = {};
setGoodFlowObserver(flow => {
  const name = nameById.get(flow.goodId) ?? "";
  if (!NAMES.includes(name)) return;
  const related = flow.category === "recipeInput" && flow.relatedGoodId ? `>${nameById.get(flow.relatedGoodId)}` : "";
  const key = `${name}:${flow.direction}:${flow.category}${related}`;
  const row = (flows[flow.marketId ?? 0] ??= {});
  row[key] = (row[key] ?? 0) + flow.units;
});
const snapshots = [];
for (let month = 1; month <= months; month++) {
  flows = {};
  await advanceWorld(host, { months: 1 });
  const diagnostics: Record<number, Record<string, number>> = {};
  const watched = new Map([...byName].filter(([name]) => name === "Soap" || name === "Potash").map(([n, g]) => [g.i, n]));
  for (const record of getUrbanCraftCapacityRecords()) {
    const row = (diagnostics[record.marketId] ??= {});
    for (const d of record.productionDiagnostics?.rows ?? []) {
      const name = d.goodId == null ? undefined : watched.get(d.goodId);
      if (!name) continue;
      const key = `${name}:${d.stage}:${d.constraints.join(",") || "ok"}`;
      row[key] = (row[key] ?? 0) + d.count;
      if (d.outputLots) row[`${key}:lots`] = (row[`${key}:lots`] ?? 0) + d.outputLots;
    }
  }
  const markets: Record<number, unknown> = {};
  for (const market of getMarkets()) {
    const stocks: Record<string, [number, number]> = {};
    for (const name of NAMES) {
      const row = market.goods[byName.get(name)?.i ?? -1];
      if (row) stocks[name] = [row.stock, row.price];
    }
    let treasury = 0;
    for (const burg of pack.burgs) if (burg.i && !burg.removed && burg.market === market.i) treasury += burg.treasury ?? 0;
    markets[market.i] = {
      flows: flows[market.i] ?? {},
      stocks,
      ashLedger: market.hearthAshLedger ?? null,
      softNeed: getMonthlyTownSoapDemand(market, "Soap"),
      whiteNeed: getMonthlyTownSoapDemand(market, "Castile Soap"),
      treasury,
      diagnostics: diagnostics[market.i] ?? {}
    };
  }
  snapshots.push({ month, monthKey: getWoodSupplyMonthKey(), calendarMonth: getSimulationMonth(), markets });
  writeFileSync(output, JSON.stringify({ input, snapshots }));
  console.log(`[soapmarkets] ${input} month ${month}`);
}
setGoodFlowObserver(null);
process.exit(0);
