/** Per town over N months: staple need/supplied/budget gap, household cash income and spending by path. */
import { readFileSync, writeFileSync } from "node:fs";
const R = process.env.ROOT ?? "/Users/h-yamaguchi/Projects/fmg-2";
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const { getHouseholdWealth, setHouseholdWealthFlowObserver } = await import(`${R}/src/extensions/economy/generators/burgMarketLedgers`);
const [input, output, months = "12"] = process.argv.slice(2);
const WALLET = new Set(["creditHouseholdWealth", "debitHouseholdWealth"]);
function channel(): string {
  for (const frame of (new Error().stack ?? "").split("\n").slice(1)) {
    const file = frame.match(/([A-Za-z0-9_-]+)\.m?ts/)?.[1];
    const fn = frame.match(/at (?:[A-Za-z0-9_$]+\.)?([A-Za-z0-9_$]+) /)?.[1];
    if (!file || file === "townpurse" || (fn && WALLET.has(fn))) continue;
    return fn ? `${file}.${fn}` : file;
  }
  return "unknown";
}
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare(); applyConflictAutonomyFromEnv();
const flows: Record<number, Record<string, number>> = {};
setHouseholdWealthFlowObserver((burgId: number, amount: number) => {
  const row = (flows[burgId] ??= {});
  const k = `${amount >= 0 ? "+" : "-"} ${channel()}`;
  row[k] = (row[k] ?? 0) + amount;
});
const burgs = () => ((host.world as any).pack.burgs as any[]).filter(b => b?.i && !b.removed);
const start = Object.fromEntries(burgs().map(b => [b.i, getHouseholdWealth(b.i)]));
for (let m = 0; m < Number(months); m++) await advanceWorld(host, { months: 1 });
setHouseholdWealthFlowObserver(null);
const rows = burgs().map(b => ({ burg: b.i, market: b.market, population: b.population, capital: !!b.capital, start: Math.round(start[b.i] ?? 0), end: Math.round(getHouseholdWealth(b.i)), flows: Object.fromEntries(Object.entries(flows[b.i] ?? {}).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).map(([k, v]) => [k, Math.round(v)])) }));
writeFileSync(output, JSON.stringify(rows, null, 1));
host.dispose();
