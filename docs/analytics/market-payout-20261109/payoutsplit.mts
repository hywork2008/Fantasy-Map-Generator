/**
 * The parts of the market payout step (docs/analytics/market-payout-20261109.md): around
 * `production:marketPayout` each month, the drop of the markets' grain, hay and trade payables, the
 * rise of their houses' working capital and the rest of the cash that left, the surplus paid out.
 * Otherwise as market-cash-20261109/cashsteps.mts: each month, the change of
 * the markets' summed cash (`marketTreasury.balance`) and of the towns' summed treasury inside every
 * measured tick step (tickProfiler.ts), net of its nested steps, and the change outside any step. Also the value at the market's price of each good's
 * recipe inputs (keyed by the good made) and of the goods the towns made, the markets' cash and
 * what they could lend, and what the towns owe them on book credit (craftCredit.ts). Barilla is seeded as in barillaflow.mts
 * (docs/analytics/barilla-20261108.md) so the runs match its maps.
 *
 *   npx tsx docs/analytics/market-payout-20261109/payoutsplit.mts <map.fmg> <out.json> <months>
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
const cash = (): number => {
  let total = 0;
  for (const market of getMarkets()) total += market.marketTreasury?.balance ?? 0;
  return total;
};
type Owed = { grain: number; hay: number; trade: number; house: number; cash: number };
const owedNow = (): Owed => {
  const owed = { grain: 0, hay: 0, trade: 0, house: 0, cash: 0 };
  for (const market of getMarkets()) {
    const treasury = market.marketTreasury;
    if (!treasury) continue;
    owed.grain += Math.max(0, treasury.ruralGrainPayable ?? 0);
    owed.hay += Math.max(0, treasury.ruralHayPayable ?? 0);
    owed.trade += Object.values(treasury.tradePayables ?? {}).reduce((sum, value) => sum + Math.max(0, value), 0);
    owed.house += treasury.tradeWorkingCapital ?? 0;
    owed.cash += treasury.balance ?? 0;
  }
  return owed;
};
let payoutStart: Owed | null = null;
let payout = { grain: 0, hay: 0, trade: 0, invested: 0, surplus: 0 };
let bySteps: Record<string, number> = {};
let cashBySteps: Record<string, number> = {};
const stack: { label: string; start: number; children: number; cashStart: number; cashChildren: number }[] = [];
setTickStepObserver({
  enter(label) {
    if (label === "production:marketPayout") payoutStart = owedNow();
    stack.push({ label, start: purse(), children: 0, cashStart: cash(), cashChildren: 0 });
  },
  exit() {
    const frame = stack.pop();
    if (!frame) return;
    if (frame.label === "production:marketPayout" && payoutStart) {
      const end = owedNow();
      const grain = payoutStart.grain - end.grain;
      const hay = payoutStart.hay - end.hay;
      const trade = payoutStart.trade - end.trade;
      // Payables repaid to other markets raise their house capital; only the market's own investment counts.
      const invested = end.house - payoutStart.house - trade;
      const left = payoutStart.cash - end.cash;
      payout.grain += grain;
      payout.hay += hay;
      payout.trade += trade;
      payout.invested += invested;
      payout.surplus += left - grain - hay - trade - invested;
      payoutStart = null;
    }
    const delta = purse() - frame.start;
    const cashDelta = cash() - frame.cashStart;
    bySteps[frame.label] = (bySteps[frame.label] ?? 0) + delta - frame.children;
    cashBySteps[frame.label] = (cashBySteps[frame.label] ?? 0) + cashDelta - frame.cashChildren;
    if (stack.length) {
      stack[stack.length - 1].children += delta;
      stack[stack.length - 1].cashChildren += cashDelta;
    }
  }
});
const snapshots = [];
for (let month = 1; month <= months; month++) {
  bySteps = {};
  cashBySteps = {};
  payout = { grain: 0, hay: 0, trade: 0, invested: 0, surplus: 0 };
  const owedBefore = owedNow();
  const cashBefore = cash();
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
    owed, owedBefore, payout, month, calendarMonth: getSimulationMonth(), before, after, outside: after - before - inSteps, bySteps, cashBefore, cashBySteps, inputValue, madeValue });
  writeFileSync(output, JSON.stringify({ input, snapshots }));
  console.log(`[payoutsplit] ${input} month ${month}`);
}
setTickStepObserver(null);
setGoodFlowObserver(null);
process.exit(0);
