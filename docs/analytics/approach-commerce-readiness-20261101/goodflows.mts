/** Yearly source/sink units by category for chosen goods, plus market stock and gate slots (golden, monthly steps). */
import { readFileSync } from "node:fs";
const R = "/Users/h-yamaguchi/Projects/fmg-2";
const names = (process.argv[3] ?? "Chicken,Fodder,Wood,Grain").split(",");
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const { getGoods, getMarkets, getApproachTraffic } = await import(`${R}/src/extensions/economy/economyContext`);
const { setGoodFlowObserver } = await import(`${R}/src/extensions/economy/generators/goodsBalanceLedger`);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2] ?? `${R}/tests/fixtures/sim-golden.fmg`)));
await host.prepare(); applyConflictAutonomyFromEnv();
const ids = new Map(getGoods().filter((g: any) => names.includes(g.name)).map((g: any) => [g.i, g.name]));
const stock = () => Object.fromEntries([...ids].map(([i, n]) => [n, Math.round(getMarkets().reduce((t: number, m: any) => t + (m.goods[i]?.stock ?? 0), 0))]));
const start = stock();
const flows: Record<string, number> = {};
setGoodFlowObserver((f: any) => { const n = ids.get(f.goodId); if (n) { const k = `${n} ${f.direction} ${f.category}`; flows[k] = (flows[k] ?? 0) + f.units; } });
for (let m = 0; m < 12; m++) await advanceWorld(host, { months: 1 });
setGoodFlowObserver(null);
const gate: Record<string, number> = {};
for (const r of getApproachTraffic() as any[]) for (const [id, v] of Object.entries(r.goodsSlots ?? {})) { const n = ids.get(+id); if (n) gate[n] = (gate[n] ?? 0) + (v as number); }
let pop = 0; for (const b of (host.world as any).pack.burgs) if (b?.i && !b.removed) pop += b.population ?? 0;
console.log(JSON.stringify({ burgPopulationPoints: Math.round(pop), stockStart: start, stockEnd: stock(), gateSlots: Object.fromEntries(Object.entries(gate).map(([k, v]) => [k, Math.round(v)])), flows: Object.fromEntries(Object.entries(flows).sort().map(([k, v]) => [k, Math.round(v)])) }, null, 1));
host.dispose();
