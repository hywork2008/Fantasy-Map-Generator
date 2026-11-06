/**
 * Yearly totals of grainflowprobe.mts output, all markets summed (urban-craft-staffing.md §10.12).
 *   npx tsx docs/analytics/grain-outflow-20261105/flowsum.mts <flow.json> [label]
 */
import { readFileSync } from "node:fs";

const [file, label = file] = process.argv.slice(2);
const data = JSON.parse(readFileSync(file, "utf8")) as { snapshots: { month: number; markets: any[] }[] };
const k = (v: number) => `${(v / 1000).toFixed(0)}k`;
const cols = ["bought", "imported", "eaten", "recipe", "beerIn", "mill", "export", "caravan", "spoiled", "stockEnd"];
console.log(`${label}\nyear ${cols.join(" ")}`);
for (let year = 1; year <= Math.ceil(data.snapshots.length / 12); year++) {
  const t: Record<string, number> = Object.fromEntries(cols.map(c => [c, 0]));
  const months = data.snapshots.filter(s => Math.ceil(s.month / 12) === year);
  for (const s of months)
    for (const m of s.markets) {
      t.bought += m.bought;
      t.imported += m.imported;
      t.eaten += m.draws["food:eaten"] ?? 0;
      t.recipe += m.draws["tradeable:recipe"] ?? 0;
      t.beerIn += m.recipes.Beer ?? 0;
      t.mill += m.draws["tradeable:mill"] ?? 0;
      t.export += m.draws["transport:export"] ?? 0;
      t.caravan += m.draws["transport:caravan"] ?? 0;
      if (s.month % 3 === 0) t.spoiled += m.spoiledQuarter;
    }
  t.stockEnd = months.at(-1)!.markets.reduce((sum, m) => sum + m.stockAfter, 0);
  console.log(`${year} ${cols.map(c => k(t[c])).join(" ")}`);
}
