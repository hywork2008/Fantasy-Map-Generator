/**
 * V2/V3 (docs/plan/salt-untaxed-value.md §4): monthly world salt (output, demand, unmet, price against landed cost,
 * payables), purses, state treasuries, meat, urban staple; yearly household and rural money by Market and
 * channel (as scripts/auditUrbanMoneyFlows.mts). ROOT=<repo> picks the code.
 * Usage: saltv2.mts <archive.fmg> <monthly.jsonl> <money.json> [months]
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const R = process.env.ROOT ?? "/Users/h-yamaguchi/Projects/fmg-2";
const { getMarkets, getGoods } = await import(`${R}/src/extensions/economy/context/trade`);
const { getStateSaltLedgers, getSaltworks } = await import(`${R}/src/extensions/economy/context/industry`);
const { getWorldContext } = await import(`${R}/src/extensions/economy/context/economyApi`);
const { getHouseholdWealth, setHouseholdWealthFlowObserver } = await import(
  `${R}/src/extensions/economy/generators/burgMarketLedgers`
);
const { setRuralHouseholdWealthFlowObserver } = await import(`${R}/src/extensions/economy/generators/householdWealth`);
const { setGoodFlowObserver } = await import(`${R}/src/extensions/economy/generators/goodsBalanceLedger`);
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const [input, monthlyOut, moneyOut, length = "84"] = process.argv.slice(2);
writeFileSync(monthlyOut, "");
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();

const WALLET = new Set(["creditHouseholdWealth", "debitHouseholdWealth", "creditRuralHouseholdWealth", "debitRuralHouseholdWealth"]);
function channel(): string {
  for (const frame of (new Error().stack ?? "").split("\n").slice(1)) {
    const file = frame.match(/([A-Za-z0-9_-]+)\.m?ts/)?.[1];
    const fn = frame.match(/at (?:[A-Za-z0-9_$]+\.)?([A-Za-z0-9_$]+) /)?.[1];
    if (!file || file === "saltv2" || (fn && WALLET.has(fn))) continue;
    return fn ? `${file}.${fn}` : file;
  }
  return "unknown";
}
const marketOfBurg = new Map<number, number>();
let flows: Record<number, Record<string, number>> = {};
let ruralFlows: Record<number, Record<string, number>> = {};
const add = (rows: Record<number, Record<string, number>>, m: number, amount: number) => {
  const row = (rows[m] ??= {});
  const k = `${amount >= 0 ? "+" : "-"} ${channel()}`;
  row[k] = (row[k] ?? 0) + amount;
};
setHouseholdWealthFlowObserver((burgId: number, amount: number) =>
  add(flows, marketOfBurg.get(burgId) ?? getWorldContext().pack.burgs?.[burgId]?.market ?? 0, amount)
);
setRuralHouseholdWealthFlowObserver((marketId: number, amount: number) => add(ruralFlows, marketId, amount));

let meatTown: Record<number, number> = {};
let meatHome = 0;
setGoodFlowObserver((f: any) => {
  if (f.direction !== "sink" || f.category !== "householdFood") return;
  if (getGoods().find((x: any) => x.i === f.goodId)?.name !== "Meat") return;
  if (f.burgId) {
    const m = marketOfBurg.get(f.burgId) ?? 0;
    meatTown[m] = (meatTown[m] ?? 0) + f.units;
  } else meatHome += f.units;
});

function townWallets() {
  const w = getWorldContext();
  const rate = Math.max(1, w.populationRate ?? 1);
  const urb = Math.max(1, w.urbanization ?? 1);
  const wallet: Record<number, number> = {};
  const people: Record<number, number> = {};
  marketOfBurg.clear();
  for (const b of w.pack.burgs ?? []) {
    if (!b?.i || b.removed) continue;
    const m = b.market ?? 0;
    marketOfBurg.set(b.i, m);
    wallet[m] = (wallet[m] ?? 0) + getHouseholdWealth(b.i);
    people[m] = (people[m] ?? 0) + (b.population ?? 0) * rate * urb;
  }
  return { wallet, people };
}

const months = Number(length);
const years: unknown[] = [];
let start = townWallets().wallet;
let yearMeat: Record<number, number> = {};
const r = (v: number) => Math.round(v);
for (let month = 1; month <= months; month++) {
  meatTown = {};
  meatHome = 0;
  await advanceWorld(host, { months: 1 });
  const w = getWorldContext();
  const mk = getMarkets() as any[];
  const led = getStateSaltLedgers() as any[];
  const salt = getGoods().find((g: any) => g.name === "Salt");
  const sum = (f: (x: any) => number) => mk.reduce((a, x) => a + (f(x) || 0), 0);
  const lsum = (k: string) => led.reduce((a, l) => a + (l[k] ?? 0), 0);
  const { wallet, people } = townWallets();
  const urbanPeople = Object.values(people).reduce((a, v) => a + v, 0);
  for (const [m, v] of Object.entries(meatTown)) yearMeat[+m] = (yearMeat[+m] ?? 0) + v;
  const priced = mk.filter(x => x.goods?.[salt.i]?.price > 0);
  const prices = priced.map(x => x.goods[salt.i].price).sort((a, b) => a - b);
  const landed = priced.filter(x => x.saltLandedUnitCost > 0).map(x => x.goods[salt.i].price / x.saltLandedUnitCost);
  const states = w.pack.states.filter((s: any) => s?.i && !s.removed);
  appendFileSync(
    monthlyOut,
    `${JSON.stringify({
      month,
      saltValue: salt.value,
      output: r(lsum("monthlyOutputBags")),
      householdDemand: r(lsum("monthlyHouseholdDemandBags")),
      livestockDemand: r(lsum("monthlyLivestockDemandBags")),
      unmetHousehold: r(lsum("monthlyUnmetHouseholdBags")),
      unmetLivestock: r(lsum("monthlyUnmetLivestockBags")),
      priceMedian: +(prices[Math.floor(prices.length / 2)] ?? 0).toFixed(4),
      priceMax: +(prices[prices.length - 1] ?? 0).toFixed(4),
      priceOverLandedMedian: +(landed.sort((a, b) => a - b)[Math.floor(landed.length / 2)] ?? 0).toFixed(3),
      saltPayables: r(sum(x => Object.values(x.marketTreasury?.saltPayables ?? {}).reduce((a: number, v: any) => a + Math.max(0, v), 0))),
      ruralSaltReceivable: r(sum(x => x.marketTreasury?.ruralSaltReceivable)),
      treasury: r(sum(x => x.marketTreasury?.balance)),
      stateTreasury: r(states.reduce((a: number, s: any) => a + (s.treasury ?? 0), 0)),
      negativeStates: states.filter((s: any) => (s.treasury ?? 0) < 0).length,
      ruralPurse: r(sum(x => x.foodLedger?.ruralHouseholdWealth)),
      urbanPurse: r(Object.values(wallet).reduce((a, v) => a + v, 0)),
      urbanPeople: r(urbanPeople),
      meatTown: r(Object.values(meatTown).reduce((a, v) => a + v, 0)),
      meatHome: r(meatHome),
      meatDemand: r((urbanPeople * 25) / 12 / (200 / 0.43)),
      urbanNeed: r(sum(x => x.foodLedger?.monthlyConsumption?.urbanNeed)),
      urbanSupplied: r(sum(x => x.foodLedger?.monthlyConsumption?.urbanSupplied)),
      budgetGap: r(sum(x => x.foodLedger?.monthlyConsumption?.urbanBudgetGap)),
      unmetByState: Object.fromEntries(
        led
          .map(l => [l.stateId, r((l.monthlyUnmetLivestockBags ?? 0) + (l.monthlyUnmetHouseholdBags ?? 0))])
          .filter(([, v]) => v > 0)
      ),
      worksCapacity: r((getSaltworks() as any[]).reduce((a, w) => a + (w.monthlyCapacityBags ?? 0), 0)),
      wagesPaid: r((getSaltworks() as any[]).reduce((a, w) => a + (w.monthlyWagesPaid ?? 0), 0))
    })}\n`
  );
  if (month % 12 === 0 || month === months) {
    years.push({ month, start, end: wallet, people, meatBought: yearMeat, flows, ruralFlows });
    flows = {};
    ruralFlows = {};
    yearMeat = {};
    start = wallet;
  }
}
writeFileSync(moneyOut, JSON.stringify({ months, years }));
host.dispose();
