/**
 * Trade working capital for market merchant companies (Phase D).
 * Caps export-warehouse booking. With `fmg-long-distance-trade` on, booking pays for the cargo and
 * the importing market pays for it on arrival (docs/plan/long-distance-merchant-reach-capital.md
 * §5.1); otherwise capital is only reserved and arrival credits a soft profit.
 *
 * @see docs/plan/merchant-logistics-warehouses.md Phase D
 */

import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getCaravans, getExportStagingLots, getMarkets, getWorldContext } from "../economyContext";
import { creditHouseholdWealth } from "./burgMarketLedgers";
import { getMoneyTradeCapacityFactorForMarket } from "./currencySufficiency";
import { getEconomyStartProfile } from "./economyStartMode";
import { isLongDistanceTradeEnabled } from "./longDistanceTradeSettings";
import type { Market, MarketTreasury, TradeCapitalAccount } from "./marketTypes";

export { isLongDistanceTradeEnabled, LONG_DISTANCE_TRADE_SETTING } from "./longDistanceTradeSettings";

/** What a booking pays out besides the taxes, which the deal carries to the treasuries (§5.1). */
export type TradeBookingPayments = {
  /** Exporter price of the goods, paid to the exporting market's cash. */
  goods: number;
  /** Carriage, paid as wages to the households of the exporting market's centre town. */
  freight: number;
};

/** Running totals of inter-market cargo settlement (§7.2), read and reset by diagnostics. */
export type TradeSettlementStats = {
  /** Value of arrived cargo at the price the importer pays. */
  saleValue: number;
  /** Paid in cash on arrival. */
  paidOnArrival: number;
  /** Left owed by importers that were short of cash. */
  payableCreated: number;
  /** Owed purchases paid later. */
  payableRepaid: number;
  /** Importers' cash put up at booking under escrow terms. */
  escrowPutUp: number;
  /** Arrived cargo value sold on escrow terms, and the part of it left owed (escrow short at booking). */
  escrowSaleValue: number;
  escrowPayableCreated: number;
  /** Warehouse lots cancelled for never loading. */
  staleLotsCancelled: number;
  staleCapitalReleased: number;
  /**
   * Cargo that waited in port past its limit and was sold there at a discount, its cost and what it
   * fetched (port-freight-queue-and-warehouses.md §4.4, §10.20).
   */
  staleSoldAtPort: number;
  staleSaleCost: number;
  staleSaleValue: number;
  /** Warehouse rent paid by cargo waiting in port for a ship, and the part the houses could not pay. */
  portStorageFees: number;
  portStorageUnpaid: number;
  /** The part of the rent paid to the houses that built the warehouses (§5.2). */
  portStorageToHouses: number;
  /** Paid by houses to build port warehouses (§5.2). */
  portWarehouseBuilt: number;
  /** Capital bookings could not get (§5.2). */
  capitalShortfall: number;
  /** Put into the houses by their markets' payouts and by their merchants (§5.2). */
  investedByMarkets: number;
  investedByCharacters: number;
  /** Idle capital given back: principal, and the profit to the investors and to the house's merchants. */
  returnedPrincipal: number;
  profitToInvestors: number;
  profitToMembers: number;
};

function emptyStats(): TradeSettlementStats {
  return {
    saleValue: 0,
    paidOnArrival: 0,
    payableCreated: 0,
    payableRepaid: 0,
    escrowPutUp: 0,
    escrowSaleValue: 0,
    escrowPayableCreated: 0,
    staleLotsCancelled: 0,
    staleCapitalReleased: 0,
    staleSoldAtPort: 0,
    staleSaleCost: 0,
    staleSaleValue: 0,
    portStorageFees: 0,
    portStorageUnpaid: 0,
    portStorageToHouses: 0,
    portWarehouseBuilt: 0,
    capitalShortfall: 0,
    investedByMarkets: 0,
    investedByCharacters: 0,
    returnedPrincipal: 0,
    profitToInvestors: 0,
    profitToMembers: 0
  };
}

let settlementStats = emptyStats();

/** Settlement since the previous call. */
export function takeTradeSettlementStats(): TradeSettlementStats {
  const stats = settlementStats;
  settlementStats = emptyStats();
  return stats;
}

export function recordStaleLotCancelled(capital: number): void {
  settlementStats.staleLotsCancelled += 1;
  settlementStats.staleCapitalReleased += capital;
}

export function recordStaleSaleAtPort(cost: number, saleValue: number): void {
  settlementStats.staleSoldAtPort += 1;
  settlementStats.staleSaleCost += cost;
  settlementStats.staleSaleValue += saleValue;
}

/**
 * Money a company holds. Paid capital locked in cargo is goods, not cash; an unpaid reservation
 * is already inside `tradeWorkingCapital`, but the legacy ledger counted it again and stays so
 * while the setting is off.
 */
export function getTradeCapitalMoney(treasury: MarketTreasury | undefined): number {
  if (!treasury) return 0;
  const working = Math.max(0, treasury.tradeWorkingCapital ?? 0);
  return treasury.tradeCapitalPaid ? working : working + Math.max(0, treasury.tradeCapitalLocked ?? 0);
}

/** Capital the company could still commit: cash, plus cash not yet spent on its locked cargo. */
export function getUncommittedTradeCapital(treasury: MarketTreasury | undefined): number {
  if (!treasury) return 0;
  const working = treasury.tradeWorkingCapital ?? 0;
  return treasury.tradeCapitalPaid ? working : Math.max(0, working - (treasury.tradeCapitalLocked ?? 0));
}

function totalPayables(treasury: MarketTreasury | undefined): number {
  return Object.values(treasury?.tradePayables ?? {}).reduce((sum, owed) => sum + Math.max(0, owed), 0);
}

/**
 * Price of open-account cargo booked or on the way to each market (escrowed cargo is already paid
 * for out of its cash). The importer keeps this much back from its monthly payout (§12).
 */
export function getOpenAccountCommitments(): Map<number, number> {
  const committed = new Map<number, number>();
  const commit = (marketId: number, amount: number) => {
    if (amount > 0) committed.set(marketId, (committed.get(marketId) ?? 0) + amount);
  };
  for (const lot of getExportStagingLots()) {
    if ((lot.lockedCapital ?? 0) > UNIT_EPSILON && lot.paymentTerms !== "escrow")
      commit(lot.destinationMarketId, lot.units * (lot.saleUnitPrice ?? 0));
  }
  for (const caravan of getCaravans()) {
    if (caravan.buyerType !== "market" || caravan.sellerType !== "market") continue;
    for (const item of caravan.payload) {
      if (!item.isFoodCoLoad && (item.lockedCapital ?? 0) > UNIT_EPSILON && item.paymentTerms !== "escrow")
        commit(caravan.buyer, item.units * (item.saleUnitPrice ?? 0));
    }
  }
  return committed;
}

/**
 * Cash each market could still pay for inter-market cargo: its cash, less what it owes for cargo
 * that has arrived and the price of open-account cargo already booked or on the way to it (§5.1).
 */
export function getImporterPurchaseRoom(): Map<number, number> {
  const room = new Map<number, number>();
  const committed = getOpenAccountCommitments();
  for (const market of getMarkets()) {
    if (!market?.i) continue;
    const treasury = market.marketTreasury;
    room.set(market.i, Math.max(0, treasury?.balance ?? 0) - totalPayables(treasury) - (committed.get(market.i) ?? 0));
  }
  return room;
}

/** Soft profit realized when export cargo arrives (fraction of locked capital). */
export const TRADE_ARRIVAL_PROFIT_RATE = 0.08;
/** Loss write-off: unlock this fraction of locked capital after bandit loss (rest is destroyed). */
export const TRADE_LOSS_RECOVERY_RATE = 0.15;
/** Most a new market's merchants take out of its towns' treasuries to start trading. */
export const NEW_MARKET_TOWN_CAPITAL_SHARE = 0.5;

const UNIT_EPSILON = 0.000001;

function emptyTreasury(): MarketTreasury {
  return {
    balance: 0,
    ruralGrainPayable: 0,
    tradeWorkingCapital: 0,
    tradeCapitalLocked: 0
  };
}

function memberBurgs(market: Market): Burg[] {
  return (getWorldContext().pack.burgs ?? []).filter(burg => burg.i && !burg.removed && burg.market === market.i);
}

function burgTreasurySum(market: Market): number {
  return memberBurgs(market).reduce((sum, burg) => sum + Math.max(0, burg.treasury ?? 0), 0);
}

/** Start-profile working cash for member towns that have none yet (world setup only). */
function seedStartTreasuries(market: Market): number {
  const profile = getEconomyStartProfile(getWorldContext().options);
  for (const burg of memberBurgs(market)) {
    if (!burg.treasury) burg.treasury = rn((burg.population ?? 0) * profile.burgTreasuryPerPopulation, 2);
  }
  return burgTreasurySum(market);
}

/**
 * Moves up to `amount` out of the market's member towns' treasuries, pro rata, and returns what was
 * moved. A market founded mid-game is capitalised by its own towns' merchants rather than from
 * nothing (docs/plan/money-supply-mint.md §4.5).
 */
function drawFromMemberTreasuries(market: Market, amount: number): number {
  const burgs = memberBurgs(market);
  const total = burgTreasurySum(market);
  if (!(amount > 0) || !(total > 0)) return 0;
  const share = Math.min(1, amount / total);
  let moved = 0;
  for (const burg of burgs) {
    const take = rn(Math.max(0, burg.treasury ?? 0) * share, 2);
    if (!(take > 0)) continue;
    burg.treasury = rn((burg.treasury ?? 0) - take, 2);
    moved += take;
  }
  return rn(moved, 2);
}

/**
 * Brings the locked capital in line with the setting. A reservation becomes a paid cost when the
 * setting turns on: the market that sold the goods receives the reserved cash. Turning it off
 * reverses that as far as the market's cash allows.
 */
function alignLockedCapital(treasury: MarketTreasury): void {
  const paid = isLongDistanceTradeEnabled();
  if (Boolean(treasury.tradeCapitalPaid) === paid) return;
  const locked = treasury.tradeCapitalLocked ?? 0;
  if (paid) {
    const moved = rn(Math.min(locked, Math.max(0, treasury.tradeWorkingCapital ?? 0)), 2);
    treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) - moved, 2);
    treasury.balance = rn(treasury.balance + moved, 2);
    treasury.tradeCapitalPaid = true;
    return;
  }
  const moved = rn(Math.min(locked, Math.max(0, treasury.balance)), 2);
  treasury.balance = rn(treasury.balance - moved, 2);
  treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) + moved, 2);
  treasury.tradeCapitalPaid = undefined;
}

function normalizeTreasury(treasury: MarketTreasury): MarketTreasury {
  treasury.tradeWorkingCapital = Math.max(0, treasury.tradeWorkingCapital ?? 0);
  treasury.tradeCapitalLocked = Math.max(0, treasury.tradeCapitalLocked ?? 0);
  alignLockedCapital(treasury);
  if (treasury.tradeCapitalPaid) ensureCapitalAccount(treasury);
  return treasury;
}

/** Share of a market's cash above its reserve it puts into its own house each month while the house is short (§5.2). */
export const MARKET_TRADE_INVEST_SHARE = 0.25;
/** Share of a house merchant's surplus spending put into the house while it is short (§5.2). */
export const CHARACTER_TRADE_INVEST_SHARE = 0.5;
/** Months of demand (bookings and refused bookings) a house keeps uncommitted; above that, capital goes back to its investors. */
export const TRADE_CAPITAL_KEEP_MONTHS = 6;
/** Share of the idle capital given back each month: voyages come home one by one, not all at once. */
export const TRADE_CAPITAL_RETURN_SHARE = 0.1;
/** Months of demand recorded before a house gives any capital back. */
const TRADE_CAPITAL_RECORD_MONTHS = 12;
/** Commenda: the investors' share of the profit; the house's merchants take the rest (§3, §5.2). */
export const INVESTOR_PROFIT_SHARE = 0.75;
/** Smallest shortfall worth asking investors for (rounding of booked units is not one). */
const MIN_SHORTFALL = 0.01;
/** Floor of the coin factor when grossing up a shortfall. */
const MIN_COIN_FACTOR = 0.25;
/** Smallest return worth settling. */
const MIN_CAPITAL_RETURN = 1;

/**
 * The investors' account of a paid house. A house without one (a new market, an older save, the
 * setting just turned on) belongs wholly to its market.
 */
function ensureCapitalAccount(treasury: MarketTreasury): TradeCapitalAccount {
  treasury.tradeCapitalAccount ??= {
    marketPrincipal: rn(houseCapital(treasury), 2),
    characterPrincipal: {},
    shortfall: 0,
    wanted: 0,
    bookedThisMonth: 0,
    demandMonthly: 0,
    demandMonths: 0
  };
  return treasury.tradeCapitalAccount;
}

/** Cash plus the paid cost of cargo booked or on the way. */
function houseCapital(treasury: MarketTreasury): number {
  return Math.max(0, treasury.tradeWorkingCapital ?? 0) + Math.max(0, treasury.tradeCapitalLocked ?? 0);
}

function principalOf(account: TradeCapitalAccount): number {
  return account.marketPrincipal + Object.values(account.characterPrincipal).reduce((sum, value) => sum + value, 0);
}

function marketMembers(market: Market): number[] {
  return [market.managerCharacterId, ...(market.rivalCharacterIds ?? [])].filter(
    (id): id is number => typeof id === "number"
  );
}

/** Pays a character, or reports false when there is none alive to pay. */
export type CreditCharacter = (characterId: number, amount: number) => boolean;

/**
 * Working capital the mint will actually let this market deploy. Locked bookings stay;
 * a coin shortage only blocks new locks. docs/plan/economy-coupling-audit.md L7.
 */
function spendableWorkingCapital(market: Market, treasury: MarketTreasury): number {
  const working = treasury.tradeWorkingCapital ?? 0;
  const locked = treasury.tradeCapitalLocked ?? 0;
  // Paid cargo is no longer in the cash, but it still counts against what the mint lets the
  // house have out at once.
  const total = treasury.tradeCapitalPaid ? working + locked : working;
  const liquid = total * getMoneyTradeCapacityFactorForMarket(market);
  return Math.max(0, Math.min(working, liquid - locked));
}

function payFreight(market: Market, treasury: MarketTreasury, freight: number): void {
  if (!(freight > UNIT_EPSILON)) return;
  if (market.centerBurgId) creditHouseholdWealth(market.centerBurgId, freight);
  else treasury.balance = rn(treasury.balance + freight, 2);
}

export class MerchantTradeCapitalModule {
  /** Ensure marketTreasury exists and trade capital fields are seeded when missing. */
  ensureTradeCapital(market: Market): MarketTreasury {
    const profile = getEconomyStartProfile(getWorldContext().options);
    const [minimumTreasuryShare, maximumTreasuryShare] = profile.marketTreasuryShare;
    const [minimumTradeShare, maximumTradeShare] = profile.tradeCapitalShare;
    if (!market.marketTreasury) {
      const grainShare = minimumTreasuryShare + Math.random() * (maximumTreasuryShare - minimumTreasuryShare);
      const tradeShare = minimumTradeShare + Math.random() * (maximumTradeShare - minimumTradeShare);
      if (!getMarkets().some(other => other !== market && other.marketTreasury)) {
        // No market has cash yet: a world being set up, endowed from the start profile.
        const sum = seedStartTreasuries(market);
        market.marketTreasury = normalizeTreasury({
          balance: rn(sum * grainShare, 2),
          ruralGrainPayable: 0,
          tradeWorkingCapital: rn(sum * tradeShare, 2),
          tradeCapitalLocked: 0
        });
        return market.marketTreasury;
      }
      const sum = burgTreasurySum(market);
      // The towns' own merchants put up the new market's cash and trading capital: at most half
      // of what the towns hold, split in the start profile's proportions.
      const wanted = sum * (grainShare + tradeShare);
      const moved = drawFromMemberTreasuries(market, Math.min(wanted, sum * NEW_MARKET_TOWN_CAPITAL_SHARE));
      const tradeFraction = grainShare + tradeShare > 0 ? tradeShare / (grainShare + tradeShare) : 0;
      const tradeWorkingCapital = rn(moved * tradeFraction, 2);
      market.marketTreasury = normalizeTreasury({
        balance: rn(moved - tradeWorkingCapital, 2),
        ruralGrainPayable: 0,
        tradeWorkingCapital,
        tradeCapitalLocked: 0
      });
      return market.marketTreasury;
    }

    const treasury = normalizeTreasury(market.marketTreasury);
    market.marketTreasury = treasury;
    if (!((treasury.tradeWorkingCapital ?? 0) > 0)) {
      // Merchants whose trading capital ran out (losses, or a save from before Phase D) set aside
      // part of the market's cash again; it used to be invented from the towns' scale each time.
      const tradeShare = minimumTradeShare + Math.random() * (maximumTradeShare - minimumTradeShare);
      const moved = rn(
        Math.min(Math.max(0, treasury.balance), Math.max(burgTreasurySum(market) * tradeShare, treasury.balance * 0.4)),
        2
      );
      treasury.balance = rn(treasury.balance - moved, 2);
      treasury.tradeWorkingCapital = moved;
      treasury.tradeCapitalLocked = treasury.tradeCapitalLocked ?? 0;
      if (treasury.tradeCapitalAccount)
        treasury.tradeCapitalAccount.marketPrincipal = rn(treasury.tradeCapitalAccount.marketPrincipal + moved, 2);
    }
    return treasury;
  }

  ensureAllMarkets(): void {
    for (const market of getMarkets()) {
      if (market) this.ensureTradeCapital(market);
    }
  }

  /** Same as `availableCapital` without seeding or topping up anything (diagnostics). */
  peekAvailableCapital(market: Market): number {
    return market.marketTreasury ? spendableWorkingCapital(market, market.marketTreasury) : 0;
  }

  availableCapital(marketId: number): number {
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market) return 0;
    const treasury = this.ensureTradeCapital(market);
    return spendableWorkingCapital(market, treasury);
  }

  /**
   * Lock capital when booking export cargo. Returns false if insufficient. With the setting on the
   * booking is paid: `payments.goods` to the exporting market, `payments.freight` to its carriers;
   * the rest of `amount` is the taxes the deal pays (§5.1).
   */
  lock(marketId: number, amount: number, payments?: TradeBookingPayments): boolean {
    if (!(amount > UNIT_EPSILON)) return true;
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market) return false;
    const treasury = this.ensureTradeCapital(market);
    const available = spendableWorkingCapital(market, treasury);
    if (available + UNIT_EPSILON < amount) return false;
    treasury.tradeCapitalLocked = rn((treasury.tradeCapitalLocked ?? 0) + amount, 2);
    if (!treasury.tradeCapitalPaid) return true;
    const account = ensureCapitalAccount(treasury);
    account.bookedThisMonth = rn(account.bookedThisMonth + amount, 2);
    treasury.tradeWorkingCapital = rn(Math.max(0, (treasury.tradeWorkingCapital ?? 0) - amount), 2);
    const goods = rn(Math.min(amount, Math.max(0, payments?.goods ?? amount)), 2);
    const freight = rn(Math.min(amount - goods, Math.max(0, payments?.freight ?? 0)), 2);
    treasury.balance = rn(treasury.balance + goods, 2);
    payFreight(market, treasury, freight);
    return true;
  }

  /**
   * Release locked capital (cancel / unstage). Off: does not change the tradeWorkingCapital total.
   * On: the goods go back to the exporting market, which refunds `goodsRefund` (default: all of
   * `amount`) as far as its cash allows; taxes and carriage already paid are not returned.
   */
  unlock(marketId: number, amount: number, goodsRefund?: number): void {
    if (!(amount > UNIT_EPSILON)) return;
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market?.marketTreasury) return;
    const treasury = normalizeTreasury(market.marketTreasury);
    treasury.tradeCapitalLocked = rn(Math.max(0, (treasury.tradeCapitalLocked ?? 0) - amount), 2);
    if (!treasury.tradeCapitalPaid) return;
    const refund = rn(Math.min(Math.max(0, treasury.balance), Math.max(0, Math.min(amount, goodsRefund ?? amount))), 2);
    treasury.balance = rn(treasury.balance - refund, 2);
    treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) + refund, 2);
  }

  /**
   * Cargo arrived. Off: unlock locked capital and credit a soft trading profit into working
   * capital. On: the importing market buys the cargo for `saleValue`, in cash as far as it has
   * it and owing the rest; the house's profit or loss is the sale less what it paid (§5.1).
   */
  settleArrival(
    marketId: number,
    lockedCapital: number,
    buyerMarketId?: number,
    saleValue = 0,
    escrow = 0,
    /** False for cargo sold where it waited rather than delivered: it stays out of the arrival totals. */
    countAsArrival = true
  ): void {
    if (!(lockedCapital > UNIT_EPSILON)) return;
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market) return;
    const treasury = this.ensureTradeCapital(market);
    treasury.tradeCapitalLocked = rn(Math.max(0, (treasury.tradeCapitalLocked ?? 0) - lockedCapital), 2);
    if (!treasury.tradeCapitalPaid) {
      const profit = rn(lockedCapital * TRADE_ARRIVAL_PROFIT_RATE, 2);
      treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) + profit, 2);
      return;
    }
    const buyer = buyerMarketId === undefined ? undefined : getMarkets().find(entry => entry.i === buyerMarketId);
    const sale = rn(Math.max(0, saleValue), 2);
    if (!buyer || buyer === market || !(sale > UNIT_EPSILON)) {
      if (buyerMarketId !== undefined) this.releaseEscrow(buyerMarketId, escrow);
      return;
    }
    const buyerTreasury = this.ensureTradeCapital(buyer);
    // Escrow pays first; any of it the sale does not need goes back to the buyer's cash.
    const fromEscrow = rn(Math.min(sale, Math.max(0, escrow), Math.max(0, buyerTreasury.tradeEscrow ?? 0)), 2);
    buyerTreasury.tradeEscrow = rn((buyerTreasury.tradeEscrow ?? 0) - fromEscrow, 2);
    this.releaseEscrow(buyer.i, rn(Math.max(0, escrow) - fromEscrow, 2));
    if (!((buyerTreasury.tradeEscrow ?? 0) > UNIT_EPSILON)) delete buyerTreasury.tradeEscrow;
    const fromCash = rn(Math.min(sale - fromEscrow, Math.max(0, buyerTreasury.balance)), 2);
    buyerTreasury.balance = rn(buyerTreasury.balance - fromCash, 2);
    const paid = rn(fromEscrow + fromCash, 2);
    treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) + paid, 2);
    const owed = rn(sale - paid, 2);
    if (owed > UNIT_EPSILON) {
      buyerTreasury.tradePayables ??= {};
      const payables = buyerTreasury.tradePayables;
      payables[market.i] = rn((payables[market.i] ?? 0) + owed, 2);
    }
    if (!countAsArrival) return;
    settlementStats.saleValue += sale;
    settlementStats.paidOnArrival += paid;
    settlementStats.payableCreated += Math.max(0, owed);
    if (escrow > 0) {
      settlementStats.escrowSaleValue += sale;
      settlementStats.escrowPayableCreated += Math.max(0, owed);
    }
  }

  /**
   * Cargo lost. Off: unlock a small recovery fraction, write off the rest of locked capital from
   * the working-capital pool (inventory destroyed). On: the cost already paid is simply gone.
   */
  settleLoss(marketId: number, lockedCapital: number): void {
    if (!(lockedCapital > UNIT_EPSILON)) return;
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market) return;
    const treasury = this.ensureTradeCapital(market);
    treasury.tradeCapitalLocked = rn(Math.max(0, (treasury.tradeCapitalLocked ?? 0) - lockedCapital), 2);
    if (treasury.tradeCapitalPaid) return;
    const recovered = rn(lockedCapital * TRADE_LOSS_RECOVERY_RATE, 2);
    const writtenOff = lockedCapital - recovered;
    treasury.tradeWorkingCapital = rn(Math.max(0, (treasury.tradeWorkingCapital ?? 0) - writtenOff), 2);
  }

  /**
   * Cargo waiting in port pays rent to the townsfolk who own the warehouses, out of the house's
   * cash as far as it has it (port-freight-queue-and-warehouses.md §4.4, §10.20). Off: no rent.
   */
  payPortStorage(
    marketId: number,
    amount: number,
    portBurgId: number,
    owner?: { marketId: number; share: number }
  ): void {
    if (!(amount > UNIT_EPSILON)) return;
    const treasury = getMarkets().find(entry => entry.i === marketId)?.marketTreasury;
    if (!treasury?.tradeCapitalPaid) return;
    const paid = Math.min(amount, Math.max(0, treasury.tradeWorkingCapital ?? 0));
    treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) - paid, 2);
    // The house that built part of the room takes that share of the rent (§5.2, T6).
    const ownerTreasury = owner ? getMarkets().find(entry => entry.i === owner.marketId)?.marketTreasury : undefined;
    const toHouse = ownerTreasury?.tradeCapitalPaid ? rn(paid * Math.min(1, Math.max(0, owner?.share ?? 0)), 2) : 0;
    if (ownerTreasury && toHouse > 0) {
      ownerTreasury.tradeWorkingCapital = rn((ownerTreasury.tradeWorkingCapital ?? 0) + toHouse, 2);
      settlementStats.portStorageToHouses += toHouse;
    }
    creditHouseholdWealth(portBurgId, paid - toHouse);
    settlementStats.portStorageFees += paid;
    settlementStats.portStorageUnpaid += amount - paid;
  }

  /**
   * The house of a port's market pays the builders of a new warehouse, out of the cash it may put
   * out; false when it has too little (port-freight-queue-and-warehouses.md §5.2, T6).
   */
  payPortWarehouse(marketId: number, amount: number, portBurgId: number): boolean {
    const market = getMarkets().find(entry => entry.i === marketId);
    const treasury = market?.marketTreasury;
    if (!market || !treasury?.tradeCapitalPaid) return false;
    const cost = rn(Math.max(0, amount), 2);
    if (spendableWorkingCapital(market, treasury) + UNIT_EPSILON < cost) return false;
    treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) - cost, 2);
    creditHouseholdWealth(portBurgId, cost);
    settlementStats.portWarehouseBuilt += cost;
    return true;
  }

  /**
   * Escrow terms: the importer puts up to `amount` of its cash aside for cargo on the way to it.
   * Returns what it could put up.
   */
  putUpEscrow(buyerMarketId: number, amount: number): number {
    const buyer = getMarkets().find(entry => entry.i === buyerMarketId);
    const treasury = buyer?.marketTreasury;
    if (!treasury || !(amount > UNIT_EPSILON)) return 0;
    const moved = rn(Math.min(amount, Math.max(0, treasury.balance)), 2);
    if (!(moved > 0)) return 0;
    treasury.balance = rn(treasury.balance - moved, 2);
    treasury.tradeEscrow = rn((treasury.tradeEscrow ?? 0) + moved, 2);
    settlementStats.escrowPutUp += moved;
    return moved;
  }

  /** Escrowed cash for cargo that will not arrive (lost, spoiled, cancelled) goes back to the buyer. */
  releaseEscrow(buyerMarketId: number, amount: number): void {
    if (!(amount > UNIT_EPSILON)) return;
    const treasury = getMarkets().find(entry => entry.i === buyerMarketId)?.marketTreasury;
    if (!treasury) return;
    const moved = rn(Math.min(amount, Math.max(0, treasury.tradeEscrow ?? 0)), 2);
    treasury.tradeEscrow = rn((treasury.tradeEscrow ?? 0) - moved, 2);
    if (!((treasury.tradeEscrow ?? 0) > UNIT_EPSILON)) delete treasury.tradeEscrow;
    treasury.balance = rn(treasury.balance + moved, 2);
  }

  /** A booking wanted `amount` more capital than the house could deploy (§5.2). */
  recordShortfall(marketId: number, amount: number): void {
    if (!(amount > MIN_SHORTFALL)) return;
    const market = getMarkets().find(entry => entry.i === marketId);
    const treasury = market?.marketTreasury;
    if (!market || !treasury?.tradeCapitalPaid) return;
    // Under a coin shortage only part of new capital can be put out (§5.4): ask for enough that
    // the deployable part covers the booking.
    const factor = getMoneyTradeCapacityFactorForMarket(market);
    const coinBound = spendableWorkingCapital(market, treasury) < (treasury.tradeWorkingCapital ?? 0) - UNIT_EPSILON;
    const wanted = coinBound && factor > 0 ? amount / Math.max(MIN_COIN_FACTOR, factor) : amount;
    const account = ensureCapitalAccount(treasury);
    account.shortfall = rn(account.shortfall + wanted, 2);
    settlementStats.capitalShortfall += wanted;
  }

  /** Capital the house of `market` still wants this month from its investors. */
  capitalWanted(market: Market): number {
    const treasury = market.marketTreasury;
    return treasury?.tradeCapitalPaid ? Math.max(0, treasury.tradeCapitalAccount?.wanted ?? 0) : 0;
  }

  /** The market puts up to `amount` of its cash into its house, as far as the house wants it. */
  investFromMarket(market: Market, amount: number): number {
    const treasury = market.marketTreasury;
    if (!treasury?.tradeCapitalPaid) return 0;
    const account = ensureCapitalAccount(treasury);
    const moved = rn(Math.min(amount, account.wanted, Math.max(0, treasury.balance)), 2);
    if (!(moved > 0)) return 0;
    treasury.balance = rn(treasury.balance - moved, 2);
    treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) + moved, 2);
    account.marketPrincipal = rn(account.marketPrincipal + moved, 2);
    account.wanted = rn(account.wanted - moved, 2);
    settlementStats.investedByMarkets += moved;
    return moved;
  }

  /**
   * A character puts up to `amount` into the house, as far as it wants it; returns what the house
   * took. The caller takes it out of the character's wealth.
   */
  investFromCharacter(market: Market, characterId: number, amount: number): number {
    const treasury = market.marketTreasury;
    if (!treasury?.tradeCapitalPaid) return 0;
    const account = ensureCapitalAccount(treasury);
    const moved = rn(Math.min(Math.max(0, amount), account.wanted), 2);
    if (!(moved > 0)) return 0;
    treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) + moved, 2);
    const key = String(characterId);
    account.characterPrincipal[key] = rn((account.characterPrincipal[key] ?? 0) + moved, 2);
    account.wanted = rn(account.wanted - moved, 2);
    settlementStats.investedByCharacters += moved;
    return moved;
  }

  /**
   * Once a month, before the markets' payouts: last month's shortfall becomes what the house asks its
   * investors for this month, and a house with more idle capital than TRADE_CAPITAL_KEEP_MONTHS
   * of demand gives part of the excess back (§5.2).
   */
  settleCapitalAccounts(creditCharacter: CreditCharacter): void {
    if (!isLongDistanceTradeEnabled()) return;
    for (const market of getMarkets()) {
      const treasury = market?.marketTreasury;
      if (!treasury?.tradeCapitalPaid) continue;
      const account = ensureCapitalAccount(treasury);
      // What the house was asked to fund this month: what it booked and what it had to refuse.
      const demand = account.bookedThisMonth + account.shortfall;
      const months = account.demandMonths;
      account.demandMonthly = rn(
        months < TRADE_CAPITAL_RECORD_MONTHS
          ? (account.demandMonthly * months + demand) / (months + 1)
          : account.demandMonthly + (demand - account.demandMonthly) / TRADE_CAPITAL_RECORD_MONTHS,
        2
      );
      account.demandMonths = Math.min(TRADE_CAPITAL_RECORD_MONTHS, months + 1);
      account.bookedThisMonth = 0;
      // Refused bookings come back every month; investors put up at most what the house already
      // has (or a month of its demand) at a time, and see how it goes.
      account.wanted = rn(
        Math.min(account.shortfall, Math.max(houseCapital(treasury), account.demandMonthly, MIN_CAPITAL_RETURN)),
        2
      );
      account.shortfall = 0;
      if (account.wanted >= MIN_CAPITAL_RETURN || account.demandMonths < TRADE_CAPITAL_RECORD_MONTHS) continue;
      const idle = (treasury.tradeWorkingCapital ?? 0) - account.demandMonthly * TRADE_CAPITAL_KEEP_MONTHS;
      const back = idle * TRADE_CAPITAL_RETURN_SHARE;
      if (back >= MIN_CAPITAL_RETURN) returnCapital(market, treasury, account, rn(back, 2), creditCharacter);
    }
  }

  /**
   * A market pays what it owes for arrived cargo out of its cash, oldest creditor first by id.
   * Returns the amount paid (§5.1; like the farmers' `ruralGrainPayable`).
   */
  repayPayables(market: Market): number {
    const treasury = market.marketTreasury;
    const payables = treasury?.tradePayables;
    if (!treasury || !payables) return 0;
    let paid = 0;
    for (const key of Object.keys(payables).sort((a, b) => Number(a) - Number(b))) {
      const creditor = getMarkets().find(entry => entry.i === Number(key));
      const owed = payables[key] ?? 0;
      if (!creditor?.marketTreasury || !(owed > UNIT_EPSILON)) {
        delete payables[key];
        continue;
      }
      const pay = rn(Math.min(owed, Math.max(0, treasury.balance)), 2);
      if (!(pay > 0)) break;
      treasury.balance = rn(treasury.balance - pay, 2);
      creditor.marketTreasury.tradeWorkingCapital = rn((creditor.marketTreasury.tradeWorkingCapital ?? 0) + pay, 2);
      paid = rn(paid + pay, 2);
      const left = rn(owed - pay, 2);
      if (left > UNIT_EPSILON) payables[key] = left;
      else delete payables[key];
    }
    if (!Object.keys(payables).length) delete treasury.tradePayables;
    settlementStats.payableRepaid += paid;
    return paid;
  }
}

export const MerchantTradeCapital = new MerchantTradeCapitalModule();

/** Shared empty treasury for call sites that create a placeholder object. */
export function createEmptyMarketTreasury(): MarketTreasury {
  return emptyTreasury();
}

/**
 * Gives `amount` of the house's cash back. The part above the investors' principal is profit:
 * INVESTOR_PROFIT_SHARE of it to the investors by their principal, the rest to the house's
 * merchants. Below principal (after losses), principal is written down in proportion.
 */
function returnCapital(
  market: Market,
  treasury: MarketTreasury,
  account: TradeCapitalAccount,
  amount: number,
  creditCharacter: CreditCharacter
): void {
  const capital = houseCapital(treasury);
  if (!(capital > 0) || !(amount > 0)) return;
  const principal = principalOf(account);
  const profit = principal > 0 ? Math.max(0, (amount * (capital - principal)) / capital) : amount;
  const principalBack = amount - profit;
  // Investors' weights: their principal, or the market alone when nothing is left of it.
  const weights: [string | null, number][] =
    principal > 0 ? [[null, account.marketPrincipal], ...Object.entries(account.characterPrincipal)] : [[null, 1]];
  const weightTotal = weights.reduce((sum, [, weight]) => sum + weight, 0);
  const members = marketMembers(market);
  const toMembers = members.length ? profit * (1 - INVESTOR_PROFIT_SHARE) : 0;
  const toInvestors = profit - toMembers;
  // Principal falls by what is paid back, or in proportion to capital after losses.
  const writeDown =
    principal > 0
      ? Math.min(1, (capital >= principal ? principalBack : amount * (principal / capital)) / principal)
      : 0;

  let toMarket = 0;
  let paid = 0;
  for (const [key, weight] of weights) {
    if (!(weight > 0)) continue;
    const share = rn(((principalBack + toInvestors) * weight) / weightTotal, 2);
    if (key === null) {
      account.marketPrincipal = rn(account.marketPrincipal * (1 - writeDown), 2);
      toMarket = rn(toMarket + share, 2);
    } else {
      const left = rn(weight * (1 - writeDown), 2);
      if (creditCharacter(Number(key), share)) {
        if (left > 0) account.characterPrincipal[key] = left;
        else delete account.characterPrincipal[key];
      } else {
        // An investor no longer alive: the share and what is left of the stake pass to the market.
        delete account.characterPrincipal[key];
        account.marketPrincipal = rn(account.marketPrincipal + left, 2);
        toMarket = rn(toMarket + share, 2);
      }
    }
    paid = rn(paid + share, 2);
  }
  let membersPaid = 0;
  if (toMembers > 0) {
    const each = rn(toMembers / members.length, 2);
    for (const id of members) {
      if (creditCharacter(id, each)) membersPaid = rn(membersPaid + each, 2);
      else toMarket = rn(toMarket + each, 2);
      paid = rn(paid + each, 2);
    }
  }
  treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) - paid, 2);
  treasury.balance = rn(treasury.balance + toMarket, 2);
  settlementStats.returnedPrincipal += principalBack;
  settlementStats.profitToInvestors += toInvestors;
  settlementStats.profitToMembers += membersPaid;
}
