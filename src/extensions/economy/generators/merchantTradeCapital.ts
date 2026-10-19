/**
 * Soft trade working capital for market merchant companies (Phase D).
 * Caps export-warehouse booking; does not implement full inter-market cash settlement.
 *
 * @see docs/plan/merchant-logistics-warehouses.md Phase D
 */

import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getMarkets, getWorldContext } from "../economyContext";
import { getMoneyTradeCapacityFactorForMarket } from "./currencySufficiency";
import { getEconomyStartProfile } from "./economyStartMode";
import type { Market, MarketTreasury } from "./marketTypes";

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

function normalizeTreasury(treasury: MarketTreasury): MarketTreasury {
  treasury.tradeWorkingCapital = Math.max(0, treasury.tradeWorkingCapital ?? 0);
  treasury.tradeCapitalLocked = Math.max(0, treasury.tradeCapitalLocked ?? 0);
  return treasury;
}

/**
 * Working capital the mint will actually let this market deploy. Locked bookings stay;
 * a coin shortage only blocks new locks. docs/plan/economy-coupling-audit.md L7.
 */
function spendableWorkingCapital(market: Market, treasury: MarketTreasury): number {
  const working = treasury.tradeWorkingCapital ?? 0;
  const locked = treasury.tradeCapitalLocked ?? 0;
  const liquid = working * getMoneyTradeCapacityFactorForMarket(market);
  return Math.max(0, liquid - locked);
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
        market.marketTreasury = {
          balance: rn(sum * grainShare, 2),
          ruralGrainPayable: 0,
          tradeWorkingCapital: rn(sum * tradeShare, 2),
          tradeCapitalLocked: 0
        };
        return market.marketTreasury;
      }
      const sum = burgTreasurySum(market);
      // The towns' own merchants put up the new market's cash and trading capital: at most half
      // of what the towns hold, split in the start profile's proportions.
      const wanted = sum * (grainShare + tradeShare);
      const moved = drawFromMemberTreasuries(market, Math.min(wanted, sum * NEW_MARKET_TOWN_CAPITAL_SHARE));
      const tradeFraction = grainShare + tradeShare > 0 ? tradeShare / (grainShare + tradeShare) : 0;
      const tradeWorkingCapital = rn(moved * tradeFraction, 2);
      market.marketTreasury = {
        balance: rn(moved - tradeWorkingCapital, 2),
        ruralGrainPayable: 0,
        tradeWorkingCapital,
        tradeCapitalLocked: 0
      };
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
    }
    return treasury;
  }

  ensureAllMarkets(): void {
    for (const market of getMarkets()) {
      if (market) this.ensureTradeCapital(market);
    }
  }

  availableCapital(marketId: number): number {
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market) return 0;
    const treasury = this.ensureTradeCapital(market);
    return spendableWorkingCapital(market, treasury);
  }

  /** Lock capital when booking export cargo. Returns false if insufficient. */
  lock(marketId: number, amount: number): boolean {
    if (!(amount > UNIT_EPSILON)) return true;
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market) return false;
    const treasury = this.ensureTradeCapital(market);
    const available = spendableWorkingCapital(market, treasury);
    if (available + UNIT_EPSILON < amount) return false;
    treasury.tradeCapitalLocked = rn((treasury.tradeCapitalLocked ?? 0) + amount, 2);
    return true;
  }

  /** Release locked capital (cancel / unstage). Does not change tradeWorkingCapital total. */
  unlock(marketId: number, amount: number): void {
    if (!(amount > UNIT_EPSILON)) return;
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market?.marketTreasury) return;
    const treasury = normalizeTreasury(market.marketTreasury);
    treasury.tradeCapitalLocked = rn(Math.max(0, (treasury.tradeCapitalLocked ?? 0) - amount), 2);
  }

  /**
   * Cargo arrived: unlock locked capital and credit a soft trading profit into working capital.
   */
  settleArrival(marketId: number, lockedCapital: number): void {
    if (!(lockedCapital > UNIT_EPSILON)) return;
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market) return;
    const treasury = this.ensureTradeCapital(market);
    treasury.tradeCapitalLocked = rn(Math.max(0, (treasury.tradeCapitalLocked ?? 0) - lockedCapital), 2);
    const profit = rn(lockedCapital * TRADE_ARRIVAL_PROFIT_RATE, 2);
    treasury.tradeWorkingCapital = rn((treasury.tradeWorkingCapital ?? 0) + profit, 2);
  }

  /**
   * Cargo lost: unlock a small recovery fraction, write off the rest of locked capital
   * from the working-capital pool (inventory destroyed).
   */
  settleLoss(marketId: number, lockedCapital: number): void {
    if (!(lockedCapital > UNIT_EPSILON)) return;
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market) return;
    const treasury = this.ensureTradeCapital(market);
    treasury.tradeCapitalLocked = rn(Math.max(0, (treasury.tradeCapitalLocked ?? 0) - lockedCapital), 2);
    const recovered = rn(lockedCapital * TRADE_LOSS_RECOVERY_RATE, 2);
    const writtenOff = lockedCapital - recovered;
    treasury.tradeWorkingCapital = rn(Math.max(0, (treasury.tradeWorkingCapital ?? 0) - writtenOff), 2);
  }
}

export const MerchantTradeCapital = new MerchantTradeCapitalModule();

/** Shared empty treasury for call sites that create a placeholder object. */
export function createEmptyMarketTreasury(): MarketTreasury {
  return emptyTreasury();
}
