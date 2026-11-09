/**
 * Town purses by simulation step (docs/analytics/market-credit-20261109.md, from town-purse-20261109): each month, the change of
 * the towns' summed treasury inside every measured tick step (tickProfiler.ts), net of its nested
 * steps, and the change outside any step. Also the value at the market's price of each good's
 * recipe inputs (keyed by the good made) and of the goods the towns made, the markets' cash and
 * what they could lend, and what the towns owe them on book credit (craftCredit.ts). Barilla is seeded as in barillaflow.mts
 * (docs/analytics/barilla-20261108.md) so the runs match its maps.
 *
 *   npx tsx docs/analytics/market-credit-20261109/pursesteps.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getGoodCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getSimulationMonth } from "../../../src/extensions/economy/economyContext";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { setGoodFlowObserver } from "../../../src/extensions/economy/generators/goodsBalanceLedger";
import { getCraftCreditOwed, getMarketLendableCash } from "../../../src/extensions/economy/generators/craftCredit";
import { setTickStepObserver } from "../../../src/generators/tickProfiler";

const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
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
const purse = (): number => {
  let total = 0;
  for (const burg of pack.burgs) if (burg?.i && !burg.removed) total += burg.treasury ?? 0;
  return total;
};
const nameById = new Map(getGoods().map(good => [good.i, good.name]));
const marketById = new Map(getMarkets().map(market => [market.i, market]));
let inputValue: Record<string, number> = {};
let madeValue: Record<string, number> = {};
setGoodFlowObserver(flow => {
  const price = marketById.get(flow.marketId ?? -1)?.goods[flow.goodId]?.price ?? 0;
  if (flow.direction === "sink" && flow.category === "recipeInput" && flow.relatedGoodId != null) {
    const key = nameById.get(flow.relatedGoodId) ?? String(flow.relatedGoodId);
    inputValue[key] = (inputValue[key] ?? 0) + flow.units * price;
  } else if (flow.direction === "source" && flow.category === "burgCraft") {
    const key = nameById.get(flow.goodId) ?? String(flow.goodId);
    madeValue[key] = (madeValue[key] ?? 0) + flow.units * price;
  }
});
let bySteps: Record<string, number> = {};
const stack: { label: string; start: number; children: number }[] = [];
setTickStepObserver({
  enter(label) {
    stack.push({ label, start: purse(), children: 0 });
  },
  exit() {
    const frame = stack.pop();
    if (!frame) return;
    const delta = purse() - frame.start;
    bySteps[frame.label] = (bySteps[frame.label] ?? 0) + delta - frame.children;
    if (stack.length) stack[stack.length - 1].children += delta;
  }
});
const snapshots = [];
for (let month = 1; month <= months; month++) {
  bySteps = {};
  inputValue = {};
  madeValue = {};
  const before = purse();
  await advanceWorld(host, { months: 1 });
  const after = purse();
  const inSteps = Object.values(bySteps).reduce((sum, value) => sum + value, 0);
  let marketCash = 0;
  let lendable = 0;
  for (const market of getMarkets()) {
    marketCash += market.marketTreasury?.balance ?? 0;
    lendable += getMarketLendableCash(market);
  }
  let owed = 0;
  for (const burg of pack.burgs) if (burg?.i && !burg.removed) owed += getCraftCreditOwed(burg.i);
  snapshots.push({
    marketCash,
    lendable,
    owed, month, calendarMonth: getSimulationMonth(), before, after, outside: after - before - inSteps, bySteps, inputValue, madeValue });
  writeFileSync(output, JSON.stringify({ input, snapshots }));
  console.log(`[pursesteps] ${input} month ${month}`);
}
setTickStepObserver(null);
setGoodFlowObserver(null);
process.exit(0);
