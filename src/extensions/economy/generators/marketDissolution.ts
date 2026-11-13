/**
 * A market whose countryside has no cash is dissolved into the market that takes over its centre
 * (docs/plan/market-founding-viability.md §3.2). Its money, debts and stock move with it; nothing
 * is created or destroyed. Its own towns' deliveries go to the absorbing market. Cargo between it and
 * other markets either winds down first (no new bookings) or is handed over (world setting).
 */

import { rn } from "../../hostUtils";
import {
  getCaravans,
  getExportStagingLots,
  getMarketShipments,
  getMarkets,
  getMerchantOrganizations,
  getMerchantTransportLedgers,
  getOverseasExpeditions,
  getSaltShipments,
  getStrategicLaborMarkets,
  getTransportAssetOrders,
  getTransportReservations,
  getWorldContext,
  setMerchantTransportLedgers,
  setStrategicLaborMarkets
} from "../economyContext";
import type { Caravan, Market, MarketTreasury } from "./marketTypes";
import { transferStapleCropShare } from "./stapleCropInventory";

/** Rural purse per rural population point. */
function ruralWealthPerHead(market: Market, ruralPopulation: ReadonlyMap<number, number>): number | null {
  const people = ruralPopulation.get(market.i) ?? 0;
  const wallet = market.foodLedger?.ruralHouseholdWealth;
  if (!(people > 0) || wallet === undefined) return null;
  return Math.max(0, wallet) / people;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Counts each market's consecutive months below `share` of the median rural purse per head and
 * returns those that reached `months`. A state capital's market is never returned.
 */
export function updateLowRuralWealthMonths(
  ruralPopulation: ReadonlyMap<number, number>,
  share: number,
  months: number
): Market[] {
  const markets = getMarkets();
  const perHead = new Map<number, number>();
  for (const market of markets) {
    const value = ruralWealthPerHead(market, ruralPopulation);
    if (value !== null) perHead.set(market.i, value);
  }
  const threshold = median([...perHead.values()]) * share;
  const burgs = getWorldContext().pack.burgs;
  const due: Market[] = [];
  for (const market of markets) {
    const value = perHead.get(market.i);
    if (value === undefined || !(value < threshold)) {
      delete market.lowRuralWealthMonths;
      delete market.dissolving;
      continue;
    }
    market.lowRuralWealthMonths = (market.lowRuralWealthMonths ?? 0) + 1;
    if (market.lowRuralWealthMonths >= months && !burgs[market.centerBurgId]?.capital) due.push(market);
  }
  return due;
}

/**
 * Trade with other markets still on the way: cargo, bookings, transport and expeditions. The
 * market's own deliveries are not counted (they are handed over). Merchant ships stay with their
 * market in Shipbuilding, so a market owning any is never dissolved. Null when nothing.
 */
export function marketTrafficInFlight(market: Market): string | null {
  const id = market.i;
  const ledger = getMerchantTransportLedgers().find(entry => entry.marketId === id);
  if (ledger?.waterAssets.length) return "merchantShips";
  const treasury = market.marketTreasury;
  if ((treasury?.tradeEscrow ?? 0) > 0) return "tradeEscrow";
  if ((treasury?.tradeCapitalLocked ?? 0) > 0) return "tradeCapitalLocked";
  if (getCaravans().some(caravan => isLive(caravan) && caravanNamesMarket(caravan, id))) return "caravan";
  if (getExportStagingLots().some(lot => lot.marketId === id || lot.destinationMarketId === id)) return "exportStaging";
  if (
    getTransportReservations().some(
      reservation =>
        reservation.dispatcherMarketId === id && (reservation.state === "reserved" || reservation.state === "inTransit")
    )
  )
    return "transportReservation";
  if (getOverseasExpeditions().some(expedition => expedition.portMarketId === id && !expedition.outcome))
    return "overseasExpedition";
  if (ledger && [...ledger.landAssets, ...ledger.riverAssets].some(asset => asset.reserved > 0 || asset.inTransit > 0))
    return "transportInUse";
  return null;
}

const isLive = (caravan: Caravan) => caravan.state !== "arrived" && caravan.state !== "lost";
const caravanNamesMarket = (caravan: Caravan, id: number) =>
  (caravan.sellerType === "market" && caravan.seller === id) ||
  (caravan.buyerType === "market" && caravan.buyer === id) ||
  caravan.transportDispatcherMarketId === id;

/** Re-addresses the market's own towns' deliveries and its transport build orders. */
export function handOverLocalDeliveries(from: Market, into: Market): void {
  for (const shipment of getMarketShipments()) if (shipment.marketId === from.i) shipment.marketId = into.i;
  for (const shipment of getSaltShipments()) {
    if (shipment.fromMarketId === from.i) shipment.fromMarketId = into.i;
    if (shipment.toMarketId === from.i) shipment.toMarketId = into.i;
  }
  for (const order of getTransportAssetOrders()) if (order.marketId === from.i) order.marketId = into.i;
}

/** Re-addresses trade with other markets that is still on the way (the `handOver` setting). */
export function handOverTrade(from: Market, into: Market): void {
  for (const caravan of getCaravans()) {
    if (!isLive(caravan)) continue;
    if (caravan.sellerType === "market" && caravan.seller === from.i) caravan.seller = into.i;
    if (caravan.buyerType === "market" && caravan.buyer === from.i) caravan.buyer = into.i;
    if (caravan.transportDispatcherMarketId === from.i) caravan.transportDispatcherMarketId = into.i;
  }
  for (const lot of getExportStagingLots()) {
    if (lot.marketId === from.i) lot.marketId = into.i;
    if (lot.destinationMarketId === from.i) lot.destinationMarketId = into.i;
  }
  for (const reservation of getTransportReservations())
    if (reservation.dispatcherMarketId === from.i) reservation.dispatcherMarketId = into.i;
  for (const expedition of getOverseasExpeditions())
    if (expedition.portMarketId === from.i) expedition.portMarketId = into.i;
}

export function hasMarketTrafficInFlight(market: Market): boolean {
  return marketTrafficInFlight(market) !== null;
}

const addRecord = (into: Record<string, number>, from: Record<string, number> | undefined) => {
  for (const [key, value] of Object.entries(from ?? {})) into[key] = rn((into[key] ?? 0) + value, 2);
};

function mergeTreasury(from: MarketTreasury, into: Market): void {
  into.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
  const target = into.marketTreasury;
  target.balance = rn(target.balance + from.balance, 2);
  target.ruralGrainPayable = rn(target.ruralGrainPayable + from.ruralGrainPayable, 2);
  if (from.ruralHayPayable) target.ruralHayPayable = rn((target.ruralHayPayable ?? 0) + from.ruralHayPayable, 2);
  if (from.ruralHayConsignedLots)
    target.ruralHayConsignedLots = (target.ruralHayConsignedLots ?? 0) + from.ruralHayConsignedLots;
  // The absorbing market holds the dissolved one's consigned town goods and owes what it owed.
  for (const key of ["craftConsigned", "craftPayables"] as const) {
    const source = from[key];
    if (!source) continue;
    const table = target[key] ?? {};
    target[key] = table;
    for (const [outer, rows] of Object.entries(source)) {
      const into = table[+outer] ?? {};
      table[+outer] = into;
      for (const [inner, row] of Object.entries(rows)) {
        const held = into[+inner] ?? [0, 0];
        into[+inner] = [held[0] + row[0], rn(held[1] + row[1], 2)];
      }
    }
  }
  if (from.tradeWorkingCapital)
    target.tradeWorkingCapital = rn((target.tradeWorkingCapital ?? 0) + from.tradeWorkingCapital, 2);
  if (from.tradeEscrow) target.tradeEscrow = rn((target.tradeEscrow ?? 0) + from.tradeEscrow, 2);
  if (from.tradeCapitalLocked) {
    target.tradeCapitalLocked = rn((target.tradeCapitalLocked ?? 0) + from.tradeCapitalLocked, 2);
    target.tradeCapitalPaid ||= from.tradeCapitalPaid;
  }
  if (from.ruralSaltReceivable)
    target.ruralSaltReceivable = rn((target.ruralSaltReceivable ?? 0) + from.ruralSaltReceivable, 2);
  if (from.saltPayables) {
    target.saltPayables ??= {};
    addRecord(target.saltPayables, from.saltPayables);
  }
  if (from.tradePayables) {
    target.tradePayables ??= {};
    addRecord(target.tradePayables, from.tradePayables);
  }
  const account = from.tradeCapitalAccount;
  if (account) {
    target.tradeCapitalAccount ??= {
      marketPrincipal: 0,
      characterPrincipal: {},
      shortfall: 0,
      wanted: 0,
      bookedThisMonth: 0,
      demandMonthly: 0,
      demandMonths: 0
    };
    const merged = target.tradeCapitalAccount;
    merged.marketPrincipal = rn(merged.marketPrincipal + account.marketPrincipal, 2);
    addRecord(merged.characterPrincipal, account.characterPrincipal);
  }
}

const STOCK_FIELDS = [
  "agTechStock",
  "fertilizerStock",
  "nitrogenFertilizerStock",
  "potashFertilizerStock",
  "electricityStock"
] as const;

/**
 * Moves everything `from` owns or owes to `into`: treasury, debts both ways, goods, stored crops,
 * the rural purse left over, merchant transport and the houses based there.
 */
export function absorbMarketHoldings(from: Market, into: Market): void {
  if (from.marketTreasury) mergeTreasury(from.marketTreasury, into);
  // What `into` and `from` owed each other is now owed to itself.
  delete into.marketTreasury?.tradePayables?.[String(from.i)];
  delete into.marketTreasury?.tradePayables?.[String(into.i)];
  for (const market of getMarkets()) {
    const payables = market.marketTreasury?.tradePayables;
    const owed = payables?.[String(from.i)];
    if (!payables || market === from || market === into || owed === undefined) continue;
    payables[String(into.i)] = rn((payables[String(into.i)] ?? 0) + owed, 2);
    delete payables[String(from.i)];
  }

  for (const [goodId, row] of Object.entries(from.goods)) {
    const target = into.goods[Number(goodId)];
    if (!target) {
      into.goods[Number(goodId)] = { ...row };
      continue;
    }
    const stock = target.stock + row.stock;
    if (row.costBasis !== undefined && stock > 0)
      target.costBasis = rn(
        ((target.costBasis ?? row.costBasis) * target.stock + row.costBasis * row.stock) / stock,
        4
      );
    target.stock = rn(stock, 4);
  }
  for (const [goodId, ages] of Object.entries(from.weaponStockAge ?? {})) {
    into.weaponStockAge ??= {};
    into.weaponStockAge[Number(goodId)] ??= [];
    const target = into.weaponStockAge[Number(goodId)];
    ages.forEach((units, age) => {
      target[age] = (target[age] ?? 0) + units;
    });
  }
  for (const field of STOCK_FIELDS) if (from[field]) into[field] = (into[field] ?? 0) + (from[field] ?? 0);

  if (from.foodLedger) {
    if (into.foodLedger) transferStapleCropShare(from.foodLedger, into.foodLedger, 1);
    else into.foodLedger = from.foodLedger;
    const wallet = from.foodLedger.ruralHouseholdWealth ?? 0;
    if (into.foodLedger !== from.foodLedger && wallet > 0) {
      into.foodLedger.ruralHouseholdWealth = rn((into.foodLedger.ruralHouseholdWealth ?? 0) + wallet, 2);
      from.foodLedger.ruralHouseholdWealth = 0;
    }
  }

  const ledgers = getMerchantTransportLedgers();
  const fromLedger = ledgers.find(entry => entry.marketId === from.i);
  if (fromLedger) {
    const intoLedger = ledgers.find(entry => entry.marketId === into.i);
    if (!intoLedger) fromLedger.marketId = into.i;
    else {
      for (const asset of [...fromLedger.landAssets, ...fromLedger.riverAssets]) {
        const target = [...intoLedger.landAssets, ...intoLedger.riverAssets].find(
          entry => entry.assetId === asset.assetId
        );
        if (!target) {
          if (asset.assetId === "river-barge") intoLedger.riverAssets.push({ ...asset });
          else intoLedger.landAssets.push({ ...asset });
          continue;
        }
        target.available += asset.available;
        target.reserved += asset.reserved;
        target.inTransit += asset.inTransit;
        target.maintenance += asset.maintenance;
        target.recoveryDays = Math.max(target.recoveryDays, asset.recoveryDays);
      }
      setMerchantTransportLedgers(ledgers.filter(entry => entry !== fromLedger));
    }
  }
  for (const organization of getMerchantOrganizations())
    if (organization.homeMarketId === from.i) organization.homeMarketId = into.i;
  // Recomputed from the market's towns every cycle.
  setStrategicLaborMarkets(getStrategicLaborMarkets().filter(entry => entry.marketId !== from.i));
}
