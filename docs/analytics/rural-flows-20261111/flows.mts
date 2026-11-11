/**
 * Rural household cash flows (docs/analytics/rural-flows-20261111.md). Read-only: every credit and
 * debit of a market's rural household wallet, tagged by the two calling functions (stack), summed
 * per month; plus the month's change of the wallets, so writes that bypass the observer show as a
 * residual. Barilla is seeded as in barillaflow.mts so the runs match docs/analytics/barilla-20261108.md.
 *
 *   npx tsx docs/analytics/rural-flows-20261111/flows.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGoodCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getSimulationMonth } from "../../../src/extensions/economy/economyContext";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { setRuralHouseholdWealthFlowObserver } from "../../../src/extensions/economy/generators/householdWealth";

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

Error.stackTraceLimit = 8;
const frameName = (line: string) => {
  const match = /at (?:async )?([^\s(]+)?\s*\(?([^():]+):\d+/.exec(line);
  if (!match) return "?";
  const file = (match[2] ?? "").split("/").pop()?.replace(/\.ts$/, "") ?? "?";
  return `${file}.${match[1] ?? "anon"}`;
};
let flows: Record<string, number> = {};
setRuralHouseholdWealthFlowObserver((_marketId, amount) => {
  const lines = (new Error().stack ?? "").split("\n").slice(1).map(frameName);
  const callers = lines.filter(name => !/RuralHouseholdWealth$|^flows\./.test(name) && !name.includes("node:"));
  const key = `${amount >= 0 ? "in" : "out"} ${callers.slice(0, 2).join(" < ")}`;
  flows[key] = (flows[key] ?? 0) + amount;
});
const wallets = () => getMarkets().reduce((sum, market) => sum + (market?.foodLedger?.ruralHouseholdWealth ?? 0), 0);
const r2 = (value: number) => Math.round(value * 100) / 100;
const snapshots = [];
for (let month = 1; month <= months; month++) {
  const before = wallets();
  flows = {};
  await advanceWorld(host, { months: 1 });
  const after = wallets();
  const observed = Object.values(flows).reduce((sum, value) => sum + value, 0);
  const rounded = Object.fromEntries(Object.entries(flows).map(([key, value]) => [key, r2(value)]));
  snapshots.push({
    month,
    calendarMonth: getSimulationMonth(),
    before: r2(before),
    after: r2(after),
    residual: r2(after - before - observed),
    flows: rounded
  });
  writeFileSync(output, JSON.stringify({ input, snapshots }));
  console.log(`[flows] ${input} month ${month}`);
}
process.exit(0);
