/** Traps writes of market 1's Salt price and records who sets it. */
import { readFileSync } from "node:fs";
import { getGoods, getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
const focus = Number(process.argv[3] ?? 1);
const writers = new Map<string, { n: number; last: number }>();
let trapped: object | null = null;
const trap = () => {
  const salt = getGoods().find(g => g.name === "Salt")!;
  const row = getMarkets().find(m => m.i === focus)?.goods[salt.i] as any;
  if (!row || row === trapped) return;
  let value = row.price;
  Object.defineProperty(row, "price", { configurable: true, enumerable: true, get: () => value, set: (v: number) => {
    const frame = (new Error().stack ?? "").split("\n").slice(2, 5).map(l => l.trim().replace(/\(.*\/src\//, "(")).join(" < ");
    const w = writers.get(frame) ?? { n: 0, last: 0 }; w.n++; w.last = v; writers.set(frame, w); value = v; } });
  trapped = row;
};
for (let m = 1; m <= 4; m++) {
  trap();
  await advanceWorld(host, { months: 1 });
  trap();
}
for (const [frame, w] of writers) console.log(`WRITER n=${w.n} last=${w.last.toFixed(3)} ${frame}`);
host.dispose();
