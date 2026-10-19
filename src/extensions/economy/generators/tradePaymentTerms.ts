/**
 * How the buyer pays for inter-market cargo (docs/plan/long-distance-merchant-reach-capital.md
 * §12). Terms are struck per booking from the pair's circumstances, as merchants did: open
 * account between houses that trusted each other in quiet times, cash put up front when war,
 * robbers, a poor record or scarce coin made the seller wary.
 */

import { pow } from "../../../simulation/deterministicMath";
import { worldSettings } from "../../../simulation/worldSettings";
import type { Character } from "../../characters/characterTypes";
import { minmax } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { getBurgMarketLedger } from "./burgMarketLedgers";
import { getMoneyTradeCapacityFactorForMarket } from "./currencySufficiency";
import type { Market, TradePaymentTerms } from "./marketTypes";
import { TradeSecurity } from "./tradeSecurity";

export const TRADE_PAYMENT_TERMS_SETTING = "fmg-trade-payment-terms";

/**
 * "escrow" / "openAccount" fix the terms for every booking (calibration); anything else
 * (default "context") strikes them per booking from the circumstances below.
 */
export function getTradePaymentTermsMode(): TradePaymentTerms | "context" {
  try {
    const value = worldSettings.getItem(TRADE_PAYMENT_TERMS_SETTING);
    return value === "escrow" || value === "openAccount" ? value : "context";
  } catch {
    return "context";
  }
}

/** Escrow chance with no reason for wariness either way. */
const BASE_ESCROW_CHANCE = 0.35;
const ESCROW_CHANCE_MIN = 0.05;
const ESCROW_CHANCE_MAX = 0.95;
/** Per unit of war intensity (0..2.5) at either end. */
const WAR_WEIGHT = 0.25;
/** Per unit of expected loss over the trip, capped. */
const ROBBERY_WEIGHT = 2;
const ROBBERY_CAP = 0.3;
/** The buyer already owes this seller for cargo. */
const ARREARS_WEIGHT = 0.3;
/** Per point of the seller's regard for the buyer (-100..100). */
const REGARD_WEIGHT = 0.002;
/** Per point the seller's boldness / the buyer's honour stand from 50 (0..100). */
const BOLDNESS_WEIGHT = 0.003;
const HONOR_WEIGHT = 0.003;
/** At the coin-shortage floor, sellers want to see the money. */
const COIN_SHORTAGE_WEIGHT = 0.3;

export type PaymentTermsContext = {
  /** Highest war intensity at the two market centres. */
  war: number;
  /** Chance the cargo is robbed on the way. */
  robberyRisk: number;
  /** The buyer owes the seller for earlier cargo. */
  inArrears: boolean;
  /** Seller's manager's solidarity toward the buyer's manager, -100..100 (0 when unknown). */
  regard: number;
  sellerBoldness: number;
  buyerHonor: number;
  /** The importer's coin factor (0.4..1; 1 = coin enough). */
  coinFactor: number;
};

/** Chance the seller asks the buyer to put the price up front. */
export function getEscrowChance(context: PaymentTermsContext): number {
  const chance =
    BASE_ESCROW_CHANCE +
    WAR_WEIGHT * context.war +
    Math.min(ROBBERY_CAP, ROBBERY_WEIGHT * context.robberyRisk) +
    (context.inArrears ? ARREARS_WEIGHT : 0) -
    REGARD_WEIGHT * context.regard -
    BOLDNESS_WEIGHT * (context.sellerBoldness - 50) -
    HONOR_WEIGHT * (context.buyerHonor - 50) +
    COIN_SHORTAGE_WEIGHT * (1 - minmax(context.coinFactor, 0, 1));
  return minmax(chance, ESCROW_CHANCE_MIN, ESCROW_CHANCE_MAX);
}

function liveCharacter(id: number | undefined): Character | undefined {
  if (id === undefined) return undefined;
  return getWorldContext().pack.characters?.find(character => character.i === id && !character.dead);
}

export function getPaymentTermsContext(exporter: Market, importer: Market, durationDays: number): PaymentTermsContext {
  const war = Math.max(
    getBurgMarketLedger(exporter.centerBurgId)?.warIntensity ?? 0,
    getBurgMarketLedger(importer.centerBurgId)?.warIntensity ?? 0
  );
  const riskPerDay = TradeSecurity.getBanditRiskPerDay(importer.centerBurgId, war);
  const seller = liveCharacter(exporter.managerCharacterId);
  const buyer = liveCharacter(importer.managerCharacterId);
  return {
    war,
    robberyRisk: 1 - pow(1 - minmax(riskPerDay, 0, 1), Math.max(0, durationDays)),
    inArrears: (importer.marketTreasury?.tradePayables?.[exporter.i] ?? 0) > 0,
    regard: seller && buyer ? (seller.solidarity?.[buyer.i] ?? 0) : 0,
    sellerBoldness: seller?.personality?.boldness ?? 50,
    buyerHonor: buyer?.personality?.honor ?? 50,
    coinFactor: getMoneyTradeCapacityFactorForMarket(importer)
  };
}

/** Terms for one booking; draws once in context mode. */
export function choosePaymentTerms(exporter: Market, importer: Market, durationDays: number): TradePaymentTerms {
  const mode = getTradePaymentTermsMode();
  if (mode !== "context") return mode;
  const chance = getEscrowChance(getPaymentTermsContext(exporter, importer, durationDays));
  return Math.random() < chance ? "escrow" : "openAccount";
}
