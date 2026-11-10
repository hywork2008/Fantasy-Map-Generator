/** Top goods through all gates (slots and value) after N months, with their cargo class. */
import { readFileSync, writeFileSync } from "node:fs";
const R = "/Users/h-yamaguchi/Projects/fmg-2";
const { createObserveViews } = await import(`${R}/scripts/lib/observeViews.mts`);
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const [input, output, months = "12"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
const views = createObserveViews(() => host.world, () => ({ year: host.simulation.currentYear, month: host.simulation.currentMonth, day: host.simulation.currentDay, tick: host.simulation.tickCount }));
for (let m = 0; m < Number(months); m++) await advanceWorld(host, { months: 1 });
const goods = new Map(views.goods().map((g: any) => [String(g.id), g]));
const slots: Record<string, number> = {}, value: Record<string, number> = {};
for (const row of views.approaches() as any[]) {
  for (const [id, v] of Object.entries(row.goodsSlots ?? {})) slots[id] = (slots[id] ?? 0) + (v as number);
  for (const [id, v] of Object.entries(row.goodsValue ?? {})) value[id] = (value[id] ?? 0) + (v as number);
}
const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, v]) => ({ good: (goods.get(id) as any)?.name, cls: (goods.get(id) as any)?.cargoClass, share: Math.round((v / total(o)) * 1000) / 1000 }));
writeFileSync(output, JSON.stringify({ slots: top(slots), value: top(value) }, null, 1));
console.log(JSON.stringify({ slots: top(slots), value: top(value) }));
host.dispose();
