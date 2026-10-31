/**
 * Production gap by buying market and tightest limit (temporary __saltDiag hooks), and each market's
 * salt cash components monthly: treasury balance, grain IOU, trade payables, salt payables, salt credit room.
 * Usage: saltcash.mts <archive.fmg> <out.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { saltPayable } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/saltFinance";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const [input, output, length = "30"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
let order: any = null;
let gaps: Record<number, Record<string, number>> = {};
(globalThis as any).__saltDiag = (r: any) => {
  if (r.kind === "order") order = r;
  else if (r.kind === "produce" && order) {
    const o = order;
    order = null;
    const limits: Record<string, number> = { capacity: o.remainingCapacity, buyerCash: o.buyerCash, ownerCash: r.cashLimit, labour: r.labour, fuel: r.fuel };
    const [bind] = Object.entries(limits).sort((a, b) => a[1] - b[1]);
    const g = (gaps[o.market] ??= {});
    g.remaining = (g.remaining ?? 0) + o.remaining;
    g.output = (g.output ?? 0) + r.output;
    const gap = Math.max(0, o.remaining - r.output);
    if (gap > 1e-6) g[bind[0]] = (g[bind[0]] ?? 0) + gap;
  }
};
const months: unknown[] = [];
for (let m = 1; m <= Number(length); m++) {
  gaps = {};
  await advanceWorld(host, { months: 1 });
  const cash: Record<number, unknown> = {};
  for (const x of getMarkets() as any[]) {
    const t = x.marketTreasury ?? {};
    cash[x.i] = {
      balance: Math.round(t.balance ?? 0),
      grainPayable: Math.round(t.ruralGrainPayable ?? 0),
      tradePayables: Math.round(Object.values(t.tradePayables ?? {}).reduce((a: number, v: any) => a + Math.max(0, v), 0)),
      saltPayable: Math.round(saltPayable(x))
    };
  }
  const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
  months.push({ month: m, gaps: Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, round(v)])), cash });
  process.stderr.write(`[saltcash] ${m}/${length}\n`);
}
writeFileSync(output, JSON.stringify(months));
host.dispose();
