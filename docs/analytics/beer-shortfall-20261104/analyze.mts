/**
 * Summaries of beerprobe.mts output (docs/plan/urban-craft-staffing.md §12 item 15).
 *
 *   npx tsx docs/analytics/beer-shortfall-20261104/analyze.mts <beer-*.json>... [--months 1,6,12,24,36,48,60] [--market <i>]
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const files = args.filter(a => a.endsWith(".json"));
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const months = (opt("--months") ?? "1,6,12,24,36,48,60").split(",").map(Number);
const marketFilter = opt("--market");
const r0 = (v: number) => Math.round(v);
const r2 = (v: number) => Math.round(v * 100) / 100;

for (const file of files) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  console.log(`\n## ${file}`);
  for (const snap of data.snapshots) {
    if (!months.includes(snap.month)) continue;
    let demand = 0, made = 0, drunk = 0, barrels = 0, exportable = 0, barrelStock = 0, noGrain = 0, noGrainDemand = 0;
    const reasons: Record<string, number> = {};
    for (const m of snap.markets) {
      demand += m.aleDemand;
      made += m.made.Beer ?? 0;
      drunk += m.beerLedger?.drunk ?? 0;
      barrels += m.made.Barrels ?? 0;
      exportable += m.food?.exportable ?? 0;
      barrelStock += m.barrels.stock;
      if ((m.food?.exportable ?? 0) < m.aleDemand) { noGrain++; noGrainDemand += m.aleDemand; }
      for (const [k, v] of Object.entries(m.diagnostics.Beer ?? {})) if (!k.endsWith("outputLots")) reasons[k] = (reasons[k] ?? 0) + (v as number);
    }
    console.log(
      `month ${snap.month}: ale demand ${r0(demand)}, Beer made ${r0(made)} (${r2(made / demand)}), Barrels made ${r0(barrels)} stock ${r0(barrelStock)}, exportable grain ${r0(exportable)}, markets with exportable < ale demand ${noGrain}/${snap.markets.length} (${r2(noGrainDemand / demand)} of demand)` + (args.includes('--guards') ? `; Beer guards ${JSON.stringify(reasons)}` : '')
    );
    const rows = snap.markets
      .filter((m: any) => !marketFilter || String(m.i) === marketFilter)
      .map((m: any) => ({
        i: m.i,
        dem: r0(m.aleDemand),
        made: r0(m.made.Beer ?? 0),
        fill: r2((m.beerLedger?.drunk ?? 0) / Math.max(1, m.aleDemand)),
        beerSt: r0(m.beer.stock),
        beerP: m.beer.price,
        barMade: r0(m.made.Barrels ?? 0),
        barSt: r0(m.barrels.stock),
        barP: m.barrels.price,
        barley: `${r0(m.grains.Barley?.stock ?? 0)}@${m.grains.Barley?.price}`,
        wheat: `${r0(m.grains.Wheat?.stock ?? 0)}@${m.grains.Wheat?.price}`,
        rye: r0(m.grains.Rye?.stock ?? 0),
        oats: r0(m.grains.Oats?.stock ?? 0),
        exp: r0(m.food?.exportable ?? 0),
        brewRes: r0(m.food?.brewingReserve ?? 0),
        brewers: `${m.brewers?.producing}/${m.brewers?.burgs}`,
        brewPpl: m.brewingPeople,
        unusedLab: r2(m.labor?.unused ?? 0),
        lab: r2(m.labor?.workforce ?? 0),
        guards: Object.entries(m.diagnostics.Beer ?? {})
          .filter(([k]) => !k.endsWith("outputLots"))
          .map(([k, v]) => `${k.replace("planning:", "p:").replace("execution:", "x:")}=${v}`)
          .join(" ")
      }));
    if (marketFilter || args.includes("--rows")) console.table(rows);
  }
}

/**
 * Binding constraint per market-month, weighted by the shortfall (ale demand − Beer made):
 * grain   — the market's Barley+Wheat+Rye+Oats rows (the brewable share of the exportable staple) hold
 *           less than half a month of ale demand;
 * casks   — Barrels stock under 5% of the month's Beer need and its price above twice the floor;
 * other   — neither (profit, labour, ranking, headroom).
 * Pass --classify to print it per year.
 */
if (args.includes("--classify")) {
  const BARRELS_PER_TUN = 0.4;
  for (const file of files) {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const byYear = new Map<number, Record<string, number>>();
    for (const snap of data.snapshots) {
      const year = Math.ceil(snap.month / 12);
      const row = byYear.get(year) ?? { demand: 0, made: 0, grain: 0, casks: 0, other: 0 };
      for (const m of snap.markets) {
        const made = m.made.Beer ?? 0;
        const shortfall = Math.max(0, m.aleDemand - made);
        row.demand += m.aleDemand;
        row.made += made;
        const brewable = Object.values(m.grains).reduce((t: number, g: any) => t + (g?.stock ?? 0), 0);
        const grain = brewable < 0.5 * m.aleDemand;
        const casks = m.barrels.stock < 0.05 * m.aleDemand * BARRELS_PER_TUN && m.barrels.price > 1;
        row[grain ? "grain" : casks ? "casks" : "other"] += shortfall;
      }
      byYear.set(year, row);
    }
    console.log(`\n## ${file} — shortfall by binding constraint (share of the year's ale demand)`);
    for (const [year, r] of byYear)
      console.log(
        `year ${year}: made ${r2(r.made / r.demand)}, short by grain ${r2(r.grain / r.demand)}, casks ${r2(r.casks / r.demand)}, other ${r2(r.other / r.demand)}`
      );
  }
}
