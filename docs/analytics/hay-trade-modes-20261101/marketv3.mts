/**
 * V2/V3 (docs/plan/salt-untaxed-value.md §4): monthly world salt (output, demand, unmet, price against landed cost,
 * payables), purses, state treasuries, meat, urban staple; yearly household and rural money by Market and
 * channel (as scripts/auditUrbanMoneyFlows.mts). ROOT=<repo> picks the code.
 * Market founding and dissolution (docs/plan/market-founding-viability.md M3): also writes each founded or
 * dissolved market and the last month's markets (towns, rural people, rural purse) to <markets.json>.
 * Usage: marketv1.mts <archive.fmg> <monthly.jsonl> <money.json> <markets.json> [months]
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
const [input, monthlyOut, moneyOut, marketsOut, length = "84"] = process.argv.slice(2);
writeFileSync(monthlyOut, "");
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
{
  const { setMarketSettings, getMarketSettings } = await import(`${R}/src/simulation/marketSettings`);
  if (process.env.FMG_HAY_TRADE) setMarketSettings({ hayTrade: process.env.FMG_HAY_TRADE });
  if (process.env.FMG_SURPLUS_RESERVE_FACTOR) setMarketSettings({ surplusReserveFactor: Number(process.env.FMG_SURPLUS_RESERVE_FACTOR) });
  if (process.env.FMG_SURPLUS_RURAL_WEIGHT) setMarketSettings({ surplusRuralWeight: Number(process.env.FMG_SURPLUS_RURAL_WEIGHT) });
  console.log("settings", JSON.stringify(getMarketSettings()));
}

const { getCaravans, getExportStagingLots } = await import(`${R}/src/extensions/economy/context/trade`);
const { marketTrafficInFlight } = await import(`${R}/src/extensions/economy/generators/marketDissolution`);
const { Markets } = await import(`${R}/src/extensions/economy/generators/markets-generator`);
const { getMarketCellColumn } = await import(`${R}/src/extensions/economy/context/cellTables`);
let probeMonth = 0;
const marketEvents: any[] = [];
const originalAdd = Markets.addMarket.bind(Markets);
Markets.addMarket = (burgId: number, options?: { spaced?: boolean }) => {
  const result = originalAdd(burgId, options);
  const burg = (getWorldContext().pack.burgs as any[])[burgId];
  marketEvents.push({ month: probeMonth, kind: result ? "add" : "joined", burg: burgId, pop: burg?.population, market: result?.i ?? burg?.market });
  return result;
};
if (process.env.FMG_MARKET_DISSOLVE_CARGO) {
  const { setMarketSettings } = await import(`${R}/src/simulation/marketSettings`);
  setMarketSettings({ dissolveCargo: process.env.FMG_MARKET_DISSOLVE_CARGO });
}
const moneyOfMarkets = () => {
  let cash = 0, debt = 0, claims = 0;
  for (const m of getMarkets() as any[]) {
    const t = m.marketTreasury ?? {};
    cash += (t.balance ?? 0) + (t.tradeEscrow ?? 0) + (t.tradeWorkingCapital ?? 0) + (m.foodLedger?.ruralHouseholdWealth ?? 0);
    debt += (t.ruralGrainPayable ?? 0) + Object.values(t.saltPayables ?? {}).reduce((a: number, b: any) => a + b, 0) + Object.values(t.tradePayables ?? {}).reduce((a: number, b: any) => a + b, 0);
    claims += t.ruralSaltReceivable ?? 0;
  }
  return { cash, debt, claims };
};
const originalDissolve = Markets.dissolveUnviableMarkets.bind(Markets);
Markets.dissolveUnviableMarkets = () => {
  const before = new Map(getMarkets().map((m: any) => [m.i, m]));
  const moneyBefore = moneyOfMarkets();
  const dissolved = originalDissolve();
  const moneyAfter = moneyOfMarkets();
  for (const id of dissolved) {
    const center = (getWorldContext().pack.burgs as any[])[before.get(id)?.centerBurgId];
    marketEvents.push({ month: probeMonth, kind: "dissolve", market: id, into: center?.market, cashChange: +(moneyAfter.cash - moneyBefore.cash).toFixed(2), debtChange: +(moneyAfter.debt - moneyBefore.debt).toFixed(2), claimsChange: +(moneyAfter.claims - moneyBefore.claims).toFixed(2) });
  }
  for (const m of getMarkets() as any[])
    if (m.dissolving) {
      const caravans = getCaravans().filter((c: any) => c.state !== "arrived" && c.state !== "lost" && c.buyerType === "market" && c.buyer === m.i);
      const lots = getExportStagingLots().filter((l: any) => l.destinationMarketId === m.i);
      marketEvents.push({
        month: probeMonth, kind: "windingDown", market: m.i, low: m.lowRuralWealthMonths, reason: marketTrafficInFlight(m),
        escrow: m.marketTreasury?.tradeEscrow ?? 0, locked: m.marketTreasury?.tradeCapitalLocked ?? 0,
        escrowInCaravans: +caravans.reduce((sum: number, c: any) => sum + c.payload.reduce((a: number, p: any) => a + (p.escrowAmount ?? 0), 0), 0).toFixed(2),
        escrowInLots: +lots.reduce((sum: number, l: any) => sum + (l.escrowAmount ?? 0), 0).toFixed(2),
        caravansAsSeller: getCaravans().filter((c: any) => c.state !== "arrived" && c.state !== "lost" && c.sellerType === "market" && c.seller === m.i).length,
        lotsAsSeller: getExportStagingLots().filter((l: any) => l.marketId === m.i).length
      });
    }
  return dissolved;
};

const WALLET = new Set(["creditHouseholdWealth", "debitHouseholdWealth", "creditRuralHouseholdWealth", "debitRuralHouseholdWealth"]);
function channel(): string {
  for (const frame of (new Error().stack ?? "").split("\n").slice(1)) {
    const file = frame.match(/([A-Za-z0-9_-]+)\.m?ts/)?.[1];
    const fn = frame.match(/at (?:[A-Za-z0-9_$]+\.)?([A-Za-z0-9_$]+) /)?.[1];
    if (!file || file === "marketv3" || (fn && WALLET.has(fn))) continue;
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
  probeMonth++;
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

{
  const world = getWorldContext();
  const column = getMarketCellColumn();
  const rate = Math.max(1, world.populationRate ?? 1);
  const rural: Record<number, number> = {};
  for (let id = 0; id < column.length; id++) if (world.pack.cells.h[id] >= 20) rural[column[id]] = (rural[column[id]] ?? 0) + world.pack.cells.pop[id] * rate;
  const burgs = world.pack.burgs as any[];
  const end = getMarkets().map((m: any) => {
    const towns = burgs.filter(b => b?.i && !b.removed && b.market === m.i);
    return { i: m.i, center: m.centerBurgId, towns: towns.length, townPop: +towns.reduce((sum, b) => sum + (b.population ?? 0), 0).toFixed(2), ruralPeople: Math.round(rural[m.i] ?? 0), ruralPurse: +(m.foodLedger?.ruralHouseholdWealth ?? 0).toFixed(1), lowMonths: m.lowRuralWealthMonths ?? 0 };
  });
  writeFileSync(marketsOut, JSON.stringify({ events: marketEvents, end }, null, 1));
}
host.dispose();
