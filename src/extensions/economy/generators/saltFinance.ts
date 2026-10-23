import { getMarketCellColumn, getWorldContext } from "../economyContext";
import { creditHouseholdWealth, debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import { getMarketPriceLevel, getMoneyPriceLevelForMarket } from "./currencySufficiency";
import type { Good } from "./goods-generator";
import { debitRuralHouseholdWealth, getRuralHouseholdWealth } from "./householdWealth";
import type { Market } from "./marketTypes";
import type { Saltworks } from "./saltLogisticsTypes";
import { getSaltOwnerAccount } from "./saltOwnership";
import { getTransportCost } from "./tradeOpportunityEstimator";

/** Settle positive invoices in cents, never below the physical purchase's quoted value. */
export const saltInvoice = (value: number): number => (value > 0 ? Math.ceil(value * 100 - 1e-8) / 100 : 0);
const cents = (value: number): number => Math.round(value * 100) / 100;
export function saltMarketCash(market: Market, committed: ReadonlyMap<number, number>): number {
  const t = market.marketTreasury;
  return Math.max(
    0,
    (t?.balance ?? 0) -
      (t?.ruralGrainPayable ?? 0) -
      (committed.get(market.i) ?? 0) -
      Object.values(t?.tradePayables ?? {}).reduce((sum, value) => sum + Math.max(0, value), 0)
  );
}
function creditMarket(market: Market, amount: number): void {
  market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
  market.marketTreasury.balance += amount;
}
export function saltOwnerCash(operation: Saltworks): number {
  return Math.max(0, getSaltOwnerAccount(operation)?.balance ?? 0);
}

/** Owner pays only actual input purchases; every debit has an existing wallet as counterparty. */
export function paySaltInputs(
  operation: Saltworks,
  market: Market,
  wages: number,
  fuel: number,
  workers: readonly { burgId: number; share: number }[]
): void {
  const account = getSaltOwnerAccount(operation);
  if (!account || account.balance + 1e-8 < wages + fuel) throw new Error("Unfunded Salt production inputs");
  account.change(-wages - fuel);
  creditMarket(market, fuel);
  let paid = 0;
  workers.forEach((worker, index) => {
    const amount =
      index === workers.length - 1 ? cents(wages - paid) : Math.min(cents(wages - paid), cents(wages * worker.share));
    creditHouseholdWealth(worker.burgId, amount);
    paid = cents(paid + amount);
  });
  operation.monthlyWagesPaid = cents((operation.monthlyWagesPaid ?? 0) + wages);
  operation.monthlyFuelPaid = cents((operation.monthlyFuelPaid ?? 0) + fuel);
}

export function saltFreightPerBag(from: Market, to: Market, salt: Good): number {
  if (from.i === to.i) return 0;
  const world = getWorldContext();
  const a = world.pack.burgs[from.centerBurgId];
  const b = world.pack.burgs[to.centerBurgId];
  const distance = Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
  return getTransportCost(distance, Math.max(1, Math.hypot(world.graphWidth || 1000, world.graphHeight || 1000)), salt);
}

/** Cash-funded wholesale only. Legacy market stock belongs to that market, not to the works. */
export function paySaltWholesale(
  operation: Saltworks,
  from: Market,
  to: Market,
  importerId: number,
  bags: number,
  unitPrice: number,
  freightPerBag: number,
  fresh: boolean
): { goods: number; freight: number } {
  const goods = saltInvoice(bags * unitPrice);
  const freight = saltInvoice(bags * freightPerBag);
  if (from.i === to.i && !fresh) return { goods: 0, freight: 0 };
  const account = fresh ? getSaltOwnerAccount(operation) : null;
  if (fresh && !account) throw new Error("Invalid Salt seller ownership");
  creditMarket(to, -goods - freight);
  const states = getWorldContext().pack.states;
  const exporter = states[operation.stateId];
  // The retail market finances the importing state's purchase atomically; no new fiscal credit.
  if (importerId !== operation.stateId) {
    const importer = states[importerId];
    importer.treasury = (importer.treasury ?? 0) + goods + freight;
    importer.treasury -= goods + freight;
  }
  exporter.treasury = (exporter.treasury ?? 0) + goods + freight;
  if (!fresh) {
    exporter.treasury -= goods;
    creditMarket(from, goods);
    exporter.treasury -= freight;
  } else {
    exporter.treasury -= goods + freight;
    account!.change(goods + freight);
    account!.change(-freight);
    operation.monthlyWholesaleReceived = cents((operation.monthlyWholesaleReceived ?? 0) + goods);
  }
  // The explicit Salt carrier uses the same local-household recipient as ordinary freight.
  creditHouseholdWealth(from.centerBurgId, freight);
  operation.monthlyFreightPaid = cents((operation.monthlyFreightPaid ?? 0) + freight);
  return { goods, freight };
}

/** Actual household purchase. A state's share never spends another state's urban wallet. */
export function buyHouseholdSalt(
  market: Market,
  stateId: number,
  requested: number,
  stock: number,
  price: number
): { bags: number; paid: number } {
  const world = getWorldContext();
  const rate = Math.max(1, world.populationRate ?? 1);
  const column = getMarketCellColumn();
  let ruralPeople = 0;
  for (const id of world.pack.cells.i) {
    if (world.pack.cells.h[id] >= 20 && world.pack.cells.state[id] === stateId && column[id] === market.i)
      ruralPeople += world.pack.cells.pop[id] * rate;
  }
  const towns = world.pack.burgs.filter(b => b?.i && !b.removed && b.market === market.i && (b.state ?? 0) === stateId);
  const people = towns.reduce(
    (sum, b) => sum + (b.population ?? 0) * rate * Math.max(1, world.urbanization ?? 1),
    ruralPeople
  );
  if (!(people > 0) || !(price > 0)) return { bags: 0, paid: 0 };
  const limit = Math.min(requested, Math.max(0, stock));
  let bags = 0,
    paid = 0;
  const buy = (share: number, wallet: number, debit: (amount: number) => number) => {
    const quantity = Math.min(limit * share, Math.floor(wallet * 100) / 100 / price);
    const cost = saltInvoice(quantity * price);
    if (!(quantity > 0) || cost > wallet + 1e-8) return;
    const actual = debit(cost);
    paid = cents(paid + actual);
    bags += (quantity * actual) / cost;
  };
  for (const burg of towns)
    buy(
      ((burg.population ?? 0) * rate * Math.max(1, world.urbanization ?? 1)) / people,
      getHouseholdWealth(burg.i),
      amount => debitHouseholdWealth(burg.i, amount)
    );
  if (ruralPeople > 0)
    buy(ruralPeople / people, getRuralHouseholdWealth(market), amount => debitRuralHouseholdWealth(market, amount));
  creditMarket(market, paid);
  return { bags, paid };
}

/** Inelastic physical demand drives prices; inability to pay is not erased from that demand. */
export function priceSalt(market: Market, good: Good, monthlyNeed: number): void {
  market.goods[good.i] ??= { stock: 0, price: good.value };
  const stock = market.goods[good.i];
  const reference = Math.max(
    good.value * getMarketPriceLevel(market) * getMoneyPriceLevelForMarket(market),
    market.saltLandedUnitCost ?? 0
  );
  const pressure = Math.max(0.5, Math.min(4, (monthlyNeed * 3) / Math.max(monthlyNeed, stock.stock, 0.0001)));
  stock.price = Math.max(
    reference * 0.5,
    Math.min(reference * 4, (stock.price || reference) * 0.8 + reference * pressure * 0.2)
  );
}
