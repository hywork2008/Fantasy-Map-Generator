/**
 * Soft trade working capital for market merchant companies (Phase D).
 * Caps export-warehouse booking; does not implement full inter-market cash settlement.
 *
 * @see docs/plan/merchant-logistics-warehouses.md Phase D
 */

import { rn } from "../../hostUtils";
import { getMarkets, getWorldContext } from "../economyContext";
import { getEconomyStartProfile } from "./economyStartMode";
import type { Market, MarketTreasury } from "./marketTypes";

/** Soft profit realized when export cargo arrives (fraction of locked capital). */
export const TRADE_ARRIVAL_PROFIT_RATE = 0.08;
/** Loss write-off: unlock this fraction of locked capital after bandit loss (rest is destroyed). */
export const TRADE_LOSS_RECOVERY_RATE = 0.15;

const UNIT_EPSILON = 0.000001;

function emptyTreasury(): MarketTreasury {
  return {
    balance: 0,
    ruralGrainPayable: 0,
    tradeWorkingCapital: 0,
    tradeCapitalLocked: 0
  };
}

function burgTreasurySum(market: Market): number {
  const burgs = getWorldContext().pack.burgs ?? [];
  const profile = getEconomyStartProfile(getWorldContext().options);
  let sum = 0;
  for (const burg of burgs) {
    if (!burg.i || burg.removed || burg.market !== market.i) continue;
    if (!burg.treasury) {
      burg.treasury = rn((burg.population ?? 0) * profile.burgTreasuryPerPopulation, 2);
    }
    sum += Math.max(0, burg.treasury ?? 0);
  }
  return sum;
}

function normalizeTreasury(treasury: MarketTreasury): MarketTreasury {
  treasury.tradeWorkingCapital = Math.max(0, treasury.tradeWorkingCapital ?? 0);
  treasury.tradeCapitalLocked = Math.max(0, treasury.tradeCapitalLocked ?? 0);
  return treasury;
}

export class MerchantTradeCapitalModule {
  /** Ensure marketTreasury exists and trade capital fields are seeded when missing. */
  ensureTradeCapital(market: Market): MarketTreasury {
    const profile = getEconomyStartProfile(getWorldContext().options);
    const [minimumTreasuryShare, maximumTreasuryShare] = profile.marketTreasuryShare;
    const [minimumTradeShare, maximumTradeShare] = profile.tradeCapitalShare;
    if (!market.marketTreasury) {
      const sum = burgTreasurySum(market);
      const grainShare = minimumTreasuryShare + Math.random() * (maximumTreasuryShare - minimumTreasuryShare);
      const tradeShare = minimumTradeShare + Math.random() * (maximumTradeShare - minimumTradeShare);
      market.marketTreasury = {
        balance: rn(sum * grainShare, 2),
        ruralGrainPayable: 0,
        tradeWorkingCapital: rn(sum * tradeShare, 2),
        tradeCapitalLocked: 0
      };
      return market.marketTreasury;
    }

    const treasury = normalizeTreasury(market.marketTreasury);
    market.marketTreasury = treasury;
    if (treasury.tradeWorkingCapital === undefined || treasury.tradeWorkingCapital <= 0) {
      // Legacy saves / food-only bootstrap: invent trade capital from burg scale without debiting burgs.
      const sum = burgTreasurySum(market);
      const tradeShare = minimumTradeShare + Math.random() * (maximumTradeShare - minimumTradeShare);
      treasury.tradeWorkingCapital = rn(Math.max(sum * tradeShare, treasury.balance * 0.4), 2);
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
    return Math.max(0, (treasury.tradeWorkingCapital ?? 0) - (treasury.tradeCapitalLocked ?? 0));
  }

  /** Lock capital when booking export cargo. Returns false if insufficient. */
  lock(marketId: number, amount: number): boolean {
    if (!(amount > UNIT_EPSILON)) return true;
    const market = getMarkets().find(entry => entry.i === marketId);
    if (!market) return false;
    const treasury = this.ensureTradeCapital(market);
    const available = (treasury.tradeWorkingCapital ?? 0) - (treasury.tradeCapitalLocked ?? 0);
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
