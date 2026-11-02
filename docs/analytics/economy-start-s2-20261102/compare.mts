/**
 * S2 comparison (docs/plan/urban-craft-staffing.md §10.2): craft workers and recipe output before
 * and after the uncalibrated labor table, from two sets of economystart.mts outputs.
 *
 *   npx tsx docs/analytics/economy-start-s2-20261102/compare.mts <out.json> <beforeDir> <afterDir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [out, beforeDir, afterDir] = process.argv.slice(2);
const seeds = (process.env.SEEDS ?? "2101,2102,2103,2104").split(",").map(Number);
const r1 = (v: number) => Math.round(v * 10) / 10;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = xs.toSorted((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const band = (p: number) => (p >= 10000 ? "10k+" : p >= 3000 ? "3k-10k" : p >= 1000 ? "1k-3k" : "<1k");
const KEY_GOODS = [
  "Preserved food",
  "Beer",
  "Cheese",
  "Wine",
  "Candles",
  "Soap",
  "Vinegar",
  "Stockfish",
  "Tar",
  "Boots",
  "Barrels",
  "Tools",
  "Ceramics",
  "Garments",
  "Cloth"
];

/** Recipe goods a burg made this month ("*" marks recipe output in economystart.mts). */
const recipeGoods = (b: any) =>
  Object.entries(b.production as Record<string, number>)
    .filter(([k, v]) => k.endsWith("*") && v > 0)
    .map(([k]) => k.slice(0, -1));

function summarize(dir: string) {
  const result: Record<string, any> = {};
  for (const seed of seeds) {
    const data = JSON.parse(readFileSync(join(dir, `obs-${seed}.json`), "utf8"));
    result[seed] = (data.snapshots as any[]).map(s => {
      const B = (s.burgs as any[]).filter(b => b.people > 0);
      const people = sum(B.map(b => b.people));
      const craft = sum(B.map(b => b.employment?.craft ?? 0));
      const bands: Record<string, any> = {};
      for (const name of ["10k+", "3k-10k", "1k-3k", "<1k"]) {
        const inBand = B.filter(b => band(b.people) === name);
        const bandPeople = sum(inBand.map(b => b.people)) || 1;
        const domains: Record<string, number> = {};
        for (const b of inBand)
          for (const g of b.guilds) domains[g.domain] = (domains[g.domain] ?? 0) + g.people;
        bands[name] = {
          n: inBand.length,
          craftPer1000: r1((sum(inBand.map(b => b.employment?.craft ?? 0)) / bandPeople) * 1000),
          guildPer1000: Object.fromEntries(
            Object.entries(domains)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => [k, r1((v / bandPeople) * 1000)])
          )
        };
      }
      // Towns whose only recipe output this month is Preserved food.
      const preservedOnly = B.filter(b => {
        const goods = recipeGoods(b);
        return goods.length === 1 && goods[0] === "Preserved food";
      });
      const output: Record<string, number> = {};
      for (const name of KEY_GOODS) output[name] = r1(sum(B.map(b => b.production[`${name}*`] ?? 0)));
      return {
        month: s.month,
        urbanPeople: people,
        craftPer1000: r1((craft / people) * 1000),
        bands,
        preservedOnly: {
          n: preservedOnly.length,
          medianCraftPer1000: r1(median(preservedOnly.map(b => ((b.employment?.craft ?? 0) / b.people) * 1000))),
          medianLots: r1(median(preservedOnly.map(b => b.production["Preserved food*"]))),
          medianPeople: median(preservedOnly.map(b => b.people))
        },
        recipeGoodsPerBurg: r1(median(B.map(b => recipeGoods(b).length))),
        output
      };
    });
  }
  return result;
}

writeFileSync(out, JSON.stringify({ before: summarize(beforeDir), after: summarize(afterDir) }, null, 1));
