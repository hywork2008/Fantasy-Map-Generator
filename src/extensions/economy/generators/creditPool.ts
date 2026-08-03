import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getMarkets, getWorldContext } from "../economyContext";
import type { Market } from "./marketTypes";

/**
 * Multi-ledger PR-9 — anonymous credit pool (moneylender v0).
 *
 * Public debt is no longer "cash from nowhere": issue draws from `state.creditPoolBalance`,
 * interest and principal repayments return to the pool, and tax-farm skims feed it.
 * Named banker characters are deferred; optional thin skim to capital market managers.
 *
 * docs/plan/multi-ledger-fiscal-architecture.md PR-9
 */

/** Baseline seed when a state first touches the credit market (no market capital yet). */
export const CREDIT_POOL_BASE_SEED = 40;

/** Fraction of capital market liquid balance used to seed / top up the pool. */
export const CREDIT_POOL_MARKET_SEED_SHARE = 0.15;

/** Fraction of capital burg treasury used when seeding. */
export const CREDIT_POOL_BURG_SEED_SHARE = 0.08;

/** Share of tax-farm skim that goes to the credit pool (rest to capital market/burg if any). */
export const TAX_FARM_TO_CREDIT_POOL_SHARE = 0.7;

/** Optional personal skim of tax-farm residual to the capital market manager (merchant link). */
export const TAX_FARM_MANAGER_SKIM_SHARE = 0.15;

export interface CreditPoolLendResult {
  lent: number;
  poolBefore: number;
  poolAfter: number;
}

export interface CreditPoolPayResult {
  paid: number;
  poolAfter: number;
}

/**
 * Resolve the capital market for a state (market whose center burg is the capital), if any.
 */
export function resolveCapitalMarket(state: Pick<State, "capital">): Market | undefined {
  if (!state.capital) return undefined;
  try {
    const markets = getMarkets();
    return markets.find(m => m.centerBurgId === state.capital);
  } catch {
    return undefined;
  }
}

/**
 * Seed credit pool on first use from baseline + capital market/burg liquidity.
 * Does not drain those sources (soft "available credit" estimate); only sets the pool stock.
 */
export function ensureCreditPoolSeeded(state: State): number {
  if (state.creditPoolBalance !== undefined && state.creditPoolBalance !== null) {
    return rn(Math.max(0, state.creditPoolBalance), 2);
  }

  let seed = CREDIT_POOL_BASE_SEED;
  const market = resolveCapitalMarket(state);
  if (market?.marketTreasury) {
    seed += rn((market.marketTreasury.balance || 0) * CREDIT_POOL_MARKET_SEED_SHARE, 2);
    seed += rn((market.marketTreasury.tradeWorkingCapital || 0) * CREDIT_POOL_MARKET_SEED_SHARE * 0.5, 2);
  }

  try {
    if (state.capital) {
      const { pack } = getWorldContext();
      const burg = pack.burgs?.[state.capital];
      if (burg && !burg.removed) {
        seed += rn((burg.treasury || 0) * CREDIT_POOL_BURG_SEED_SHARE, 2);
      }
    }
  } catch {
    // economy context optional in pure unit tests
  }

  state.creditPoolBalance = rn(Math.max(0, seed), 2);
  return state.creditPoolBalance;
}

/** Read pool without seeding (UI / overview — no world mutation on dialog open). */
export function peekCreditPoolBalance(state: Pick<State, "creditPoolBalance">): number {
  if (state.creditPoolBalance === undefined || state.creditPoolBalance === null) return 0;
  return rn(Math.max(0, state.creditPoolBalance), 2);
}

/** Ensure seeded then return balance (mutations OK — call from fiscal cash paths only). */
export function getCreditPoolBalance(state: State): number {
  return ensureCreditPoolSeeded(state);
}

/** True if the pool can fund a new loan (unseeded pools will seed on first lend). */
export function creditPoolCanLend(state: Pick<State, "creditPoolBalance">): boolean {
  if (state.creditPoolBalance === undefined || state.creditPoolBalance === null) return true;
  return (state.creditPoolBalance || 0) > 0;
}

/**
 * Lend up to `amount` from the credit pool into the caller's hands (caller credits L2).
 * Returns the amount actually lent (0 if pool empty).
 */
export function lendFromCreditPool(state: State, amount: number): CreditPoolLendResult {
  const desired = Math.max(0, amount);
  const poolBefore = ensureCreditPoolSeeded(state);
  if (!(desired > 0) || !(poolBefore > 0)) {
    return { lent: 0, poolBefore, poolAfter: poolBefore };
  }
  const lent = rn(Math.min(desired, poolBefore), 2);
  state.creditPoolBalance = rn(poolBefore - lent, 2);
  return { lent, poolBefore, poolAfter: state.creditPoolBalance };
}

/**
 * Pay cash into the credit pool (interest, principal repayment, tax-farm share).
 */
export function payToCreditPool(state: State, amount: number): CreditPoolPayResult {
  const pay = Math.max(0, amount);
  const pool = ensureCreditPoolSeeded(state);
  if (!(pay > 0)) return { paid: 0, poolAfter: pool };
  state.creditPoolBalance = rn(pool + pay, 2);
  return { paid: pay, poolAfter: state.creditPoolBalance };
}

export interface TaxFarmRouteResult {
  toCreditPool: number;
  toMarket: number;
  toBurg: number;
  toManager: number;
}

/**
 * Route tax-farm skim away from L2 (already deducted) to credit pool + merchant layer.
 * Does not touch state.treasury — caller already removed the skim.
 */
export function routeTaxFarmProceeds(state: State, amount: number): TaxFarmRouteResult {
  const result: TaxFarmRouteResult = { toCreditPool: 0, toMarket: 0, toBurg: 0, toManager: 0 };
  if (!(amount > 0)) return result;

  const toPool = rn(amount * TAX_FARM_TO_CREDIT_POOL_SHARE, 2);
  let remainder = rn(amount - toPool, 2);
  if (toPool > 0) {
    payToCreditPool(state, toPool);
    result.toCreditPool = toPool;
  }

  const market = resolveCapitalMarket(state);
  if (market && remainder > 0) {
    const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
    market.marketTreasury = treasury;
    const toMarket = rn(remainder * (1 - TAX_FARM_MANAGER_SKIM_SHARE), 2);
    const toManager = rn(remainder - toMarket, 2);
    if (toMarket > 0) {
      treasury.balance = rn((treasury.balance || 0) + toMarket, 2);
      result.toMarket = toMarket;
    }
    if (toManager > 0 && market.managerCharacterId && hasCharactersContext()) {
      const manager = getCharacters().find(c => c.i === market.managerCharacterId && !c.dead);
      if (manager) {
        manager.wealth = rn((manager.wealth || 0) + toManager, 2);
        result.toManager = toManager;
        remainder = 0;
      } else {
        treasury.balance = rn((treasury.balance || 0) + toManager, 2);
        result.toMarket = rn(result.toMarket + toManager, 2);
        remainder = 0;
      }
    } else if (toManager > 0) {
      treasury.balance = rn((treasury.balance || 0) + toManager, 2);
      result.toMarket = rn(result.toMarket + toManager, 2);
      remainder = 0;
    } else {
      remainder = 0;
    }
  }

  if (remainder > 0 && state.capital) {
    try {
      const { pack } = getWorldContext();
      const burg = pack.burgs?.[state.capital];
      if (burg && !burg.removed) {
        burg.treasury = rn((burg.treasury || 0) + remainder, 2);
        result.toBurg = remainder;
        remainder = 0;
      }
    } catch {
      // fall through — remainder absorbed by credit pool
    }
  }

  if (remainder > 0) {
    payToCreditPool(state, remainder);
    result.toCreditPool = rn(result.toCreditPool + remainder, 2);
  }

  return result;
}
