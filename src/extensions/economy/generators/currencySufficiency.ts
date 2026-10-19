/**
 * Maps a state's mint ledger onto a price-level multiplier and a trade-liquidity cap.
 *
 * `MintLedger.circulation` used to be written and never read outside minting.ts. This module is
 * the L7 arrow: depleted coin (mines gone, no remint) nudges nominal prices down and stops
 * merchants from booking large cargo; a full 12-month stock is a no-op so existing price
 * calibration is unchanged. docs/plan/economy-coupling-audit.md L7.
 */

import { pow } from "../../../simulation/deterministicMath";
import { worldSettings } from "../../../simulation/worldSettings";
import { minmax } from "../../hostUtils";
import { getMintLedgers, getWorldContext, isEconomyContextReady } from "../economyContext";
import type { Market } from "./marketTypes";
import type { MintLedger } from "./mintingTypes";

export const MONEY_SUPPLY_SETTING = "fmg-money-supply";

/**
 * "on": the mint pays for bullion with new coin, `circulation` is the State's real money, coin
 * wears away and a smoothed price level follows the money stock (docs/plan/money-supply-mint.md
 * §4.1–§4.3). Anything else keeps the ledger-only mint and the 0.85–1.15 price band below.
 */
export function isMoneySupplyEnabled(): boolean {
  try {
    return worldSettings.getItem(MONEY_SUPPLY_SETTING) === "on";
  } catch {
    return false;
  }
}

/** Price level range under the money-supply model (§4.3): wide enough for a bullion famine's deflation. */
export const PRICE_LEVEL_MIN = 0.5;
export const PRICE_LEVEL_MAX = 1.5;
/** Share of money sufficiency that reaches prices; the rest is absorbed by velocity and credit. */
export const PRICE_LEVEL_ELASTICITY = 0.5;
/** Monthly share of the gap to the target price level closed (prices follow over years). */
export const PRICE_LEVEL_MONTHLY_ADJUSTMENT = 0.02;

/** Price level the money stock points to: sufficiency^elasticity, clamped (§4.3). */
export function getTargetPriceLevel(sufficiency: number): number {
  if (!Number.isFinite(sufficiency)) return 1;
  return minmax(pow(Math.max(0, sufficiency), PRICE_LEVEL_ELASTICITY), PRICE_LEVEL_MIN, PRICE_LEVEL_MAX);
}

/** One month's move of the price level toward its target. */
export function stepPriceLevel(current: number | undefined, sufficiency: number): number {
  const level = Number.isFinite(current) && (current as number) > 0 ? (current as number) : 1;
  const next = level + (getTargetPriceLevel(sufficiency) - level) * PRICE_LEVEL_MONTHLY_ADJUSTMENT;
  return minmax(next, PRICE_LEVEL_MIN, PRICE_LEVEL_MAX);
}

/** Months of `currencyDemand` the mint treats as a full circulating stock. */
export const TARGET_MONTHS_OF_CURRENCY = 12;
/** Months of `currencyDemand` seeded at map generation. */
export const INITIAL_MONTHS_OF_CURRENCY = 6;

/** Floor of the L7 price-level multiplier (zero circulating coin). */
export const MONEY_PRICE_FLOOR = 0.85;
/** Ceiling of the L7 price-level multiplier (2× the 12-month target). */
export const MONEY_PRICE_CEILING = 1.15;
/**
 * Sufficiency at generate-time (`INITIAL / TARGET`). Between this and 1.0 the price level is
 * identically 1 so a newly minted map, and a healthy 12-month stock, do not move calibration.
 */
export const MONEY_NEUTRAL_MIN_SUFFICIENCY = INITIAL_MONTHS_OF_CURRENCY / TARGET_MONTHS_OF_CURRENCY;
/** Sufficiency at the mint's 12-month target. Above this, prices inflate. */
export const MONEY_NEUTRAL_MAX_SUFFICIENCY = 1;

/** Floor of merchant / procurement liquidity when circulation is empty. Not zero: some local credit remains. */
export const MONEY_TRADE_CAPACITY_FLOOR = 0.4;

/**
 * Circulating coin as a fraction of the 12-month target. Missing / empty ledgers return 1 so
 * tests and Economy-off callers are a no-op.
 */
export function getCurrencySufficiency(ledger: Pick<MintLedger, "circulation" | "currencyDemand"> | undefined): number {
  if (!ledger) return 1;
  const demand = ledger.currencyDemand;
  if (!(demand > 0) || !Number.isFinite(demand)) return 1;
  const circulation = Number.isFinite(ledger.circulation) ? Math.max(0, ledger.circulation) : 0;
  return circulation / (demand * TARGET_MONTHS_OF_CURRENCY);
}

/**
 * Nominal price-level multiplier in [0.85, 1.15].
 * - 0 circulation → 0.85 (precious-metal exhaustion)
 * - 6–12 months of demand → 1 (generate-time seed through the mint target)
 * - 24 months → 1.15 (population collapse leaving too much coin)
 */
export function getMoneyPriceLevel(sufficiency: number): number {
  if (!Number.isFinite(sufficiency)) return 1;
  if (sufficiency <= 0) return MONEY_PRICE_FLOOR;
  if (sufficiency < MONEY_NEUTRAL_MIN_SUFFICIENCY) {
    return MONEY_PRICE_FLOOR + (1 - MONEY_PRICE_FLOOR) * (sufficiency / MONEY_NEUTRAL_MIN_SUFFICIENCY);
  }
  if (sufficiency <= MONEY_NEUTRAL_MAX_SUFFICIENCY) return 1;
  const extra = Math.min(1, sufficiency - MONEY_NEUTRAL_MAX_SUFFICIENCY);
  return minmax(1 + (MONEY_PRICE_CEILING - 1) * extra, 1, MONEY_PRICE_CEILING);
}

/**
 * Share of booked merchant capital / producer-purchase cash that is actually liquid.
 * Only binds below the generate-time 6-month seed; a healthy mint is a no-op.
 */
export function getMoneyTradeCapacityFactor(sufficiency: number): number {
  if (!Number.isFinite(sufficiency) || sufficiency >= MONEY_NEUTRAL_MIN_SUFFICIENCY) return 1;
  if (sufficiency <= 0) return MONEY_TRADE_CAPACITY_FLOOR;
  return MONEY_TRADE_CAPACITY_FLOOR + (1 - MONEY_TRADE_CAPACITY_FLOOR) * (sufficiency / MONEY_NEUTRAL_MIN_SUFFICIENCY);
}

export function getMintLedgerForMarket(market: Pick<Market, "centerBurgId">): MintLedger | undefined {
  if (!isEconomyContextReady()) return undefined;
  const stateId = getWorldContext().pack.burgs?.[market.centerBurgId]?.state;
  if (typeof stateId !== "number") return undefined;
  return getMintLedgers().find(ledger => ledger.stateId === stateId);
}

/** Legacy L7 multiplier applied on top of market prices; 1 under the money-supply model. */
export function getMoneyPriceLevelForMarket(market: Pick<Market, "centerBurgId">): number {
  if (isMoneySupplyEnabled()) return 1;
  return getMoneyPriceLevel(getCurrencySufficiency(getMintLedgerForMarket(market)));
}

/**
 * The smoothed price level `P` of the market's State under the money-supply model (§4.3): the
 * base that goods' values and the staple price are multiplied by. 1 when the setting is off.
 */
export function getMarketPriceLevel(market: Pick<Market, "centerBurgId">): number {
  if (!isMoneySupplyEnabled()) return 1;
  const level = getMintLedgerForMarket(market)?.priceLevel;
  return Number.isFinite(level) && (level as number) > 0 ? (level as number) : 1;
}

export function getMoneyTradeCapacityFactorForMarket(market: Pick<Market, "centerBurgId">): number {
  return getMoneyTradeCapacityFactor(getCurrencySufficiency(getMintLedgerForMarket(market)));
}
