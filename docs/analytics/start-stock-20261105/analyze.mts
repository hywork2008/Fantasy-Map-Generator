/**
 * Per-good start-stock lines from stockprobe outputs (docs/plan/start-provisioning.md §6.2).
 * Years 3-5 (months 25-60): months of stock = closing stock / units used that month, per market and
 * month; use per 1,000 market residents per month. Markets are split by whether the good had a
 * local source there in those years. Also the start: stock at month 0 and price/value in months 1-3.
 *
 *   npx tsx docs/analytics/start-stock-20261105/analyze.mts <out.json> <stock-*.json>...
 */
import { readFileSync, writeFileSync } from "node:fs";

const [output, ...inputs] = process.argv.slice(2);
type Row = [stock: number, use: number, loss: number, local: number, imported: number, price: number];
interface Snapshot {
  month: number;
  markets: { i: number; urban: number; rural: number; goods: Record<string, Row> }[];
}
interface Probe {
  input: string;
  goods: { i: number; name: string; value: number; tags: string[]; crop: boolean }[];
  snapshots: Snapshot[];
}

const FIRST = 25;
const LAST = 60;
const quantile = (values: number[], q: number) => {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (at - lo);
};
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const sig = (v: number | null) => (v == null ? null : Number(v.toPrecision(3)));

interface Acc {
  months: number[];
  usePerK: number[];
  marketMonths: number;
  usedMarketMonths: number;
}
/** Per good: world use summed by month, and price/value per used market-month in years 3-5. */
const worldUse = new Map<string, number[]>();
const steadyPrice = new Map<string, number[]>();
const acc = (map: Map<string, Acc>, key: string) => {
  let a = map.get(key);
  if (!a) map.set(key, (a = { months: [], usePerK: [], marketMonths: 0, usedMarketMonths: 0 }));
  return a;
};

const lines = new Map<string, Acc>();
const startByGood = new Map<string, { stock0: number; use1: number; spikeMarkets: number; markets: number; maxRatio: number[] }>();
const goodMeta = new Map<string, { name: string; value: number; tags: string[]; crop: boolean }>();

for (const file of inputs) {
  const probe = JSON.parse(readFileSync(file, "utf8")) as Probe;
  for (const g of probe.goods) goodMeta.set(String(g.i), g);
  const window = probe.snapshots.filter(s => s.month >= FIRST && s.month <= LAST);
  // Local producer present in years 3-5, per market and good.
  const local = new Set<string>();
  for (const s of window)
    for (const m of s.markets) for (const [g, row] of Object.entries(m.goods)) if (row[3] > 0) local.add(`${m.i}:${g}`);
  for (const s of window)
    for (const m of s.markets) {
      const people = m.urban + m.rural;
      if (people <= 0) continue;
      for (const g of goodMeta.keys()) {
        const row = m.goods[g];
        const a = acc(lines, `${g}|${local.has(`${m.i}:${g}`) ? "local" : "none"}`);
        a.marketMonths++;
        const use = row?.[1] ?? 0;
        a.usePerK.push((use * 1000) / people);
        if (use > 0) {
          const value = goodMeta.get(g)!.value;
          if (row[5] > 0 && value > 0) {
            const list = steadyPrice.get(g) ?? [];
            list.push(row[5] / value);
            steadyPrice.set(g, list);
          }
          a.usedMarketMonths++;
          a.months.push((row?.[0] ?? 0) / use);
        }
      }
    }
  for (const s of probe.snapshots)
    for (const m of s.markets)
      for (const [g, row] of Object.entries(m.goods)) {
        const list = worldUse.get(g) ?? [];
        list[s.month] = (list[s.month] ?? 0) + row[1];
        worldUse.set(g, list);
      }
  const s0 = probe.snapshots.find(s => s.month === 0);
  for (const g of goodMeta.keys()) {
    const start = startByGood.get(g) ?? { stock0: 0, use1: 0, spikeMarkets: 0, markets: 0, maxRatio: [] };
    const value = goodMeta.get(g)!.value;
    for (const m of s0?.markets ?? []) start.stock0 += m.goods[g]?.[0] ?? 0;
    for (const m of probe.snapshots.find(s => s.month === 1)?.markets ?? []) start.use1 += m.goods[g]?.[1] ?? 0;
    for (const m of s0?.markets ?? []) {
      let max = 0;
      for (const s of probe.snapshots.filter(s => s.month >= 1 && s.month <= 3)) {
        const row = s.markets.find(x => x.i === m.i)?.goods[g];
        if (row && row[5] > 0 && value > 0) max = Math.max(max, row[5] / value);
      }
      if (!max) continue;
      start.markets++;
      start.maxRatio.push(max);
      if (max > 1.3) start.spikeMarkets++;
    }
    startByGood.set(g, start);
  }
}

const rows = [...goodMeta.entries()].map(([g, meta]) => {
  const side = (kind: "local" | "none") => {
    const a = lines.get(`${g}|${kind}`);
    if (!a || !a.marketMonths) return null;
    return {
      marketMonths: a.marketMonths,
      usedShare: r2(a.usedMarketMonths / a.marketMonths),
      monthsP10: r2(quantile(a.months, 0.1)),
      monthsMedian: r2(quantile(a.months, 0.5)),
      monthsP90: r2(quantile(a.months, 0.9)),
      usePerKMedian: sig(quantile(a.usePerK, 0.5)),
      usePerKP90: sig(quantile(a.usePerK, 0.9))
    };
  };
  const start = startByGood.get(g)!;
  const use = worldUse.get(g) ?? [];
  const steady = use.slice(FIRST, LAST + 1);
  const steadyMean = steady.reduce((sum, v) => sum + (v ?? 0), 0) / (LAST - FIRST + 1);
  return {
    i: Number(g),
    name: meta.name,
    tags: meta.tags,
    crop: meta.crop,
    local: side("local"),
    none: side("none"),
    worldUse: {
      steadyMonthly: sig(steadyMean),
      month1: sig(use[1] ?? 0),
      month2: sig(use[2] ?? 0),
      month3: sig(use[3] ?? 0)
    },
    steadyPriceToValue: {
      p10: r2(quantile(steadyPrice.get(g) ?? [], 0.1)),
      median: r2(quantile(steadyPrice.get(g) ?? [], 0.5)),
      p90: r2(quantile(steadyPrice.get(g) ?? [], 0.9))
    },
    start: {
      stock0: Math.round(start.stock0),
      use1: Math.round(start.use1),
      marketsPriced: start.markets,
      marketsOver13: start.spikeMarkets,
      priceToValueMedian: r2(quantile(start.maxRatio, 0.5))
    }
  };
});
writeFileSync(output, JSON.stringify({ inputs, window: [FIRST, LAST], rows }, null, 1));
