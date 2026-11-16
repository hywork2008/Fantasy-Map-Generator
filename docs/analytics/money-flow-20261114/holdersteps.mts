/**
 * Money of every main holder by simulation step (docs/analytics/money-flow-20261114.md): each month, the
 * change of each holder's summed money inside every measured tick step (tickProfiler.ts), net of its
 * nested steps, and the change outside any step. Market settings come from the JSON in FMG_SETTINGS.
 * Barilla is seeded as in barillaflow.mts so the runs match docs/analytics/barilla-20261108.md.
 *
 *   npx tsx docs/analytics/money-flow-20261114/holdersteps.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoodCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { getBurgMarketLedgers, getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { personalCashTotal, readPersonalCash } from "../../../src/extensions/economy/generators/personalCash";
import { getSimulationCharacters as getCharacters } from "../../../src/extensions/characters/charactersContext";
import { setMarketSettings } from "../../../src/simulation/marketSettings";
import { getGuildKnowledgeStocks } from "../../../src/extensions/economy/context/knowledge";
import { setTickStepObserver } from "../../../src/generators/tickProfiler";

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
const HOLDERS = ["rural", "market", "guild", "town", "burg", "people", "state"] as const;
type Holder = (typeof HOLDERS)[number];
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
const zero = () => HOLDERS.map(() => 0);
let bySteps: Record<string, number[]> = {};
const stack: { start: number[]; children: number[] }[] = [];
setTickStepObserver({
  enter() {
    stack.push({ start: holders(), children: zero() });
  },
  exit(label) {
    const frame = stack.pop();
    if (!frame) return;
    const now = holders();
    const row = (bySteps[label] ??= zero());
    const parent = stack[stack.length - 1];
    for (let i = 0; i < now.length; i++) {
      const delta = now[i] - frame.start[i];
      row[i] += delta - frame.children[i];
      if (parent) parent.children[i] += delta;
    }
  }
});
const r2 = (v: number) => Math.round(v * 100) / 100;
const snapshots = [];
for (let month = 1; month <= months; month++) {
  bySteps = {};
  const before = holders();
  await advanceWorld(host, { months: 1 });
  const after = holders();
  const outside = after.map((v, i) => v - before[i] - Object.values(bySteps).reduce((s, row) => s + row[i], 0));
  const steps: Record<string, Partial<Record<Holder, number>>> = {};
  for (const [label, row] of Object.entries(bySteps)) {
    const cells = Object.fromEntries(HOLDERS.map((h, i) => [h, r2(row[i])]).filter(([, v]) => v !== 0));
    if (Object.keys(cells).length) steps[label] = cells;
  }
  snapshots.push({ month, after: after.map(r2), outside: outside.map(r2), steps });
  writeFileSync(output, JSON.stringify({ input, settings, holders: HOLDERS, snapshots }));
  console.log(`[holders] ${input} month ${month}`);
}
process.exit(0);
