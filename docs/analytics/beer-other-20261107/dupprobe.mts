/**
 * How much a town's haul to its market adds to that market's stock on arrival, all goods, by value
 * (docs/analytics/beer-other-20261107.md). Read-only: the burgCraft and importArrival flows
 * (goodsBalanceLedger observer) and the cargo of town-seller caravans at the end of each month.
 *
 *   FMG_CONFLICT_AUTONOMY=peace npx tsx docs/analytics/beer-other-20261107/dupprobe.mts <map.fmg> [months=3]
 */
import { readFileSync } from "node:fs";
const { advanceWorld, createNodeSimulationHost } = await import(`../../../src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`../../../scripts/lib/conflictAutonomyFromEnv.mts`);
const { getCaravans, getGoods } = await import(`../../../src/extensions/economy/context/trade`);
const { setGoodFlowObserver } = await import(`../../../src/extensions/economy/generators/goodsBalanceLedger`);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
applyConflictAutonomyFromEnv();
(host.simulation as any).worldSettings = { ...(host.simulation as any).worldSettings, "fmg-caravan-raids": "off" };
const goods = getGoods();
const value = new Map(goods.map((g: any) => [g.i, g.value]));
let craft = new Map<number, number>(), arrive = new Map<number, number>();
setGoodFlowObserver((f: any) => {
  const m = f.category === "burgCraft" && f.direction === "source" ? craft : f.category === "importArrival" ? arrive : null;
  if (m) m.set(f.goodId, (m.get(f.goodId) ?? 0) + f.units);
});
const months = Number(process.argv[3] ?? 3);
for (let month = 1; month <= months; month++) {
  // burg-seller cargo in loading/transit before the month: arrives during it
  const burgCargo = new Map<number, number>();
  for (const c of getCaravans() as any[]) if (c.sellerType === "burg") for (const it of c.payload) burgCargo.set(it.goodId, (burgCargo.get(it.goodId) ?? 0) + it.units);
  craft = new Map(); arrive = new Map();
  await advanceWorld(host, { months: 1 });
  let cv = 0, av = 0, bv = 0;
  for (const [g, u] of craft) cv += u * (value.get(g) ?? 0);
  for (const [g, u] of arrive) av += u * (value.get(g) ?? 0);
  const transit = new Map<number, number>();
  for (const c of getCaravans() as any[]) if (c.sellerType === "burg") for (const it of c.payload) transit.set(it.goodId, (transit.get(it.goodId) ?? 0) + it.units);
  for (const [g, u] of transit) bv += u * (value.get(g) ?? 0);
  const top = [...transit].map(([g, u]) => [goods.find((x: any) => x.i === g)?.name, Math.round(u), Math.round(u * (value.get(g) ?? 0))]).sort((a: any, b: any) => b[2] - a[2]).slice(0, 8);
  console.log(JSON.stringify({ month, burgCraftValue: Math.round(cv), importArrivalValue: Math.round(av), burgSellerCargoAtMonthEndValue: Math.round(bv), top }));
}
process.exit(0);
