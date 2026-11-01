import { readFileSync } from "node:fs";
const R = "/Users/h-yamaguchi/Projects/fmg-2";
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const { getGoods, getApproachTraffic, getMarkets } = await import(`${R}/src/extensions/economy/economyContext`);
const { getGoodCargoSlotsPerUnit } = await import(`${R}/src/extensions/economy/generators/tradeCargo`);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(`${R}/tests/fixtures/sim-golden.fmg`)));
await host.prepare(); applyConflictAutonomyFromEnv();
if (process.env.VIEWS) { const { createObserveViews } = await import(`${R}/scripts/lib/observeViews.mts`); createObserveViews(() => host.world, () => ({ year: 0, month: 0, day: 0, tick: 0 })); }
if (process.env.STEP) for (let m = 0; m < 12; m++) await advanceWorld(host, { months: 1 }); else await advanceWorld(host, { months: 12 });
const rows: any = getApproachTraffic();
const slots: Record<number, number> = {}; let n = 0;
for (const r of Object.values(rows) as any[]) { n++; for (const [id, v] of Object.entries(r.goodsSlots ?? {})) slots[+id] = (slots[+id] ?? 0) + (v as number); }
let pop = 0; for (const b of (host.world as any).pack.burgs) if (b?.i && !b.removed) pop += b.population ?? 0; console.log("rows", n, "burgPop", Math.round(pop));
for (const g of getGoods()) if (["Grain","Tallow","Fodder","Wood","Chicken","Meat","Beef","Pork","Mutton"].includes(g.name)) console.log(g.i, g.name, g.unit, getGoodCargoSlotsPerUnit(g), Math.round(slots[g.i] ?? 0), "units", Math.round((slots[g.i] ?? 0) / getGoodCargoSlotsPerUnit(g)));
const all = getGoods(); for (const [id, v] of Object.entries(slots).sort((a, b) => b[1] - a[1]).slice(0, 6)) { const gs = all.filter(g => g.i === +id); console.log("top", id, gs.map(g => g.name + "/" + g.unit + "/" + getGoodCargoSlotsPerUnit(g)), Math.round(v)); }
let sup = 0; for (const m of getMarkets() as any[]) sup += m.foodLedger?.observation?.urbanSupplied ?? 0; console.log("urbanSupplied(last)", sup);
const tal = (Object.values(rows) as any[]).filter(r => r.goodsSlots?.["142"] > 0).sort((a, b) => b.goodsSlots["142"] - a.goodsSlots["142"]).slice(0, 6);
for (const r of tal) console.log("tal", r.approachId, Math.round(r.goodsSlots["142"]), "in", Math.round(r.inbound.cargoSlots), "out", Math.round(r.outbound.cargoSlots), "partners", JSON.stringify(r.partners).slice(0, 200));
for (const m of getMarkets() as any[]) console.log("mkt", m.i, m.centerBurgId, "tallowStock", Math.round(m.goods[142]?.stock ?? 0), "price", m.goods[142]?.price);
host.dispose();
