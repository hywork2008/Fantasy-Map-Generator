/**
 * Livestock and household salt shortfall by cause, from temporary globalThis.__saltDiag hooks in saltLogistics.ts /
 * saltProduction.ts: unmarketed herds, buyer money, market stock; and the production gap behind short stock by its
 * tightest limit (capacity, buyer cash, owner cash, labour, fuel). Per year, per month of year, per state.
 * Usage: saltcap.mts <archive.fmg> <out.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getSaltworks } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/industry";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const [input, output, length = "84"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();

type Acc = Record<string, number>;
const add = (a: Acc, k: string, v: number) => {
  if (v > 1e-9) a[k] = (a[k] ?? 0) + v;
};
let month = 0;
const byYear: Record<number, Acc> = {};
const byMonthOfYear: Record<number, Acc> = {};
const byState: Record<number, Acc> = {};
let order: any = null;
const byMarket: Record<string, Acc> = {};
const purse: Record<number, Acc> = {};
function record(stateId: number, key: string, v: number) {
  const year = Math.floor((month - 1) / 12);
  add((byYear[year] ??= {}), key, v);
  add((byMonthOfYear[((month - 1) % 12) + 1] ??= {}), key, v);
  if (month > (Number(length) - 24)) add((byState[stateId] ??= {}), key, v);
}
(globalThis as any).__saltDiag = (r: any) => {
  if (r.kind === "unmarketed") {
    record(r.stateId, "livestock:unmarketed", r.livestock);
    record(r.stateId, "household:unmarketed", r.household);
  } else if (r.kind === "order") order = r;
  else if (r.kind === "produce") {
    const o = order;
    order = null;
    if (!o) return;
    const limits: Record<string, number> = {
      capacity: o.remainingCapacity,
      buyerCash: o.buyerCash,
      ownerCash: r.cashLimit,
      labour: r.labour,
      fuel: r.fuel
    };
    const gap = Math.max(0, o.remaining - r.output);
    const [bind] = Object.entries(limits).sort((a, b) => a[1] - b[1]);
    record(o.stateId, "production:output", r.output);
    if (gap > 1e-6) record(o.stateId, `production:gap:${bind[0]}`, gap);
  } else if (r.kind === "livestock") {
    record(r.stateId, "livestock:need", r.need);
    record(r.stateId, "household:need", r.householdNeed);
    record(r.stateId, "household:short", r.householdNeed - r.householdSold);
    const short = Math.max(0, r.need - r.supplied);
    if (!(short > 1e-9)) return;
    const cause =
      r.money < r.need && r.money <= r.stockAvail
        ? "money"
        : r.hasSupplier === 0
          ? "stock:noSupplier"
          : r.remainingOrder > 1e-6
            ? "stock:orderUnfilled"
            : "stock:inTransitOrReserve";
    record(r.stateId, `livestock:short:${cause}`, short);
    if (month > Number(length) - 24) {
      const m = (byMarket[`${r.stateId}:${r.market}`] ??= {});
      add(m, `short:${cause}`, short);
      add(m, "need", r.need);
      add(m, "moneyLimit", r.money);
    }
  }
};

const capacity: Record<number, number> = {};
for (month = 1; month <= Number(length); month++) {
  await advanceWorld(host, { months: 1 });
  const year = Math.floor((month - 1) / 12);
  for (const w of getSaltworks() as any[]) {
    add((byYear[year] ??= {}), "works:capacity", w.monthlyCapacityBags ?? 0);
    add((byYear[year] ??= {}), "works:output", w.monthlyOutputBags ?? 0);
    add((byMonthOfYear[((month - 1) % 12) + 1] ??= {}), "works:capacity", w.monthlyCapacityBags ?? 0);
    add((byMonthOfYear[((month - 1) % 12) + 1] ??= {}), "works:output", w.monthlyOutputBags ?? 0);
    if (month > Number(length) - 24) capacity[w.stateId] = (capacity[w.stateId] ?? 0) + (w.monthlyCapacityBags ?? 0);
  }
  if (month > Number(length) - 24)
    for (const m of (await import("/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade")).getMarkets() as any[]) {
      const p = (purse[m.i] ??= {});
      add(p, "ruralPurse", (m.foodLedger?.ruralHouseholdWealth ?? 0) / 24);
      add(p, "receivable", (m.marketTreasury?.ruralSaltReceivable ?? 0) / 24);
      add(p, "price", (m.goods?.[(await import("/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade")).getGoods().find((g: any) => g.name === "Salt").i]?.price ?? 0) / 24);
      add(p, "hasFoodLedger", m.foodLedger ? 1 / 24 : 0);
    }
  process.stderr.write(`[saltcap] ${month}/${length}\n`);
}
const round = (a: Acc) => Object.fromEntries(Object.entries(a).sort().map(([k, v]) => [k, Math.round(v)]));
writeFileSync(
  output,
  JSON.stringify({
    months: Number(length),
    byYear: Object.fromEntries(Object.entries(byYear).map(([k, v]) => [1300 + Number(k), round(v)])),
    byMonthOfYear: Object.fromEntries(Object.entries(byMonthOfYear).map(([k, v]) => [k, round(v)])),
    lastTwoYearsByMarket: Object.fromEntries(Object.entries(byMarket).map(([k, v]) => [k, { ...round(v), ...Object.fromEntries(Object.entries(purse[+k.split(":")[1]] ?? {}).map(([a, b]) => [a, +b.toFixed(3)])) }])),
    lastTwoYearsByState: Object.fromEntries(
      Object.entries(byState).map(([k, v]) => [k, { ...round(v), worksCapacity: Math.round(capacity[+k] ?? 0) }])
    )
  })
);
host.dispose();
