import { pow } from "./deterministicMath";
import { worldSettings } from "./worldSettings";

/**
 * Market founding and dissolution (docs/plan/market-founding-viability.md §3.1–3.2). Saved with the
 * world; the economy reads it, the Simulation settings tab edits it.
 */
export const MARKET_SETTINGS_KEY = "fmg-market-settings";

/**
 * Cargo between markets when one is dissolved: `windDown` books no new trade with it and dissolves
 * it once that cargo has arrived; `handOver` dissolves it at once and hands the cargo to the
 * absorbing market. Its own towns' deliveries are handed over in both.
 */
export const MARKET_DISSOLVE_CARGO_MODES = ["windDown", "handOver"] as const;
export type MarketDissolveCargoMode = (typeof MARKET_DISSOLVE_CARGO_MODES)[number];

/**
 * Spare hay at the cut (docs/analytics/hay-surplus-20261031.md): `marketShortfall` has the market buy
 * it up to its farms' shortfall against their winter reserve plans; `farmsFirst` first moves it from
 * farms with spare hay to short farms of the same market, and the market buys for what is still short.
 */
export const HAY_TRADE_MODES = ["marketShortfall", "farmsFirst"] as const;
export type HayTradeMode = (typeof HAY_TRADE_MODES)[number];

/**
 * The merchants' share of a market's surplus payout (docs/analytics/hay-trade-modes-20261101.md §12):
 * `houseCapital` puts it into their market's trading house as each merchant's stake, as far as the
 * house wants capital, and pays what it does not take as the market's local wages; `wealth` adds it
 * to the merchants' own wealth.
 */
export const MERCHANT_PROFIT_USES = ["houseCapital", "wealth"] as const;
export type MerchantProfitUse = (typeof MERCHANT_PROFIT_USES)[number];

/**
 * How a market pays for the hay it buys at the cut (docs/analytics/hay-trade-modes-20261101.md §13):
 * `onCredit` owes it to the farms and repays them as the Fodder sells, as it does for grain; `cash`
 * pays at the cut from its cash, which then sits in the market until the next cut.
 */
export const HAY_PAYMENT_MODES = ["onCredit", "cash"] as const;
export type HayPaymentMode = (typeof HAY_PAYMENT_MODES)[number];

export type MarketSettings = {
  /** A town promoted during the run opens a market only this many generation spacings from every market centre. */
  foundingSpacingFactor: number;
  /** A market dissolves when its rural purse per head stays below this share of the median market's. */
  dissolveWealthShare: number;
  /** ...for this many consecutive months. */
  dissolveMonths: number;
  dissolveCargo: MarketDissolveCargoMode;
  hayTrade: HayTradeMode;
  hayPayment: HayPaymentMode;
  /**
   * Weight of a rural person against a town person in the wages a market pays from its surplus:
   * carters, threshers and hay hands in its countryside as well as dealers and porters in its towns.
   */
  surplusRuralWeight: number;
  /** Cash a market keeps before paying out its surplus, per member-town population point, as times the town working cash. */
  surplusReserveFactor: number;
  /** Share of that payout the market's manager and rival merchants take as profit. */
  merchantProfitShare: number;
  merchantProfitUse: MerchantProfitUse;
  /** Years of living costs a market merchant keeps before spending the rest of its wealth. */
  merchantReserveYears: number;
};

export const DEFAULT_MARKET_SETTINGS: Readonly<MarketSettings> = {
  foundingSpacingFactor: 1,
  dissolveWealthShare: 0.2,
  dissolveMonths: 12,
  dissolveCargo: "windDown",
  hayTrade: "marketShortfall",
  hayPayment: "onCredit",
  surplusRuralWeight: 1,
  surplusReserveFactor: 0.25,
  merchantProfitShare: 1 / 3,
  merchantProfitUse: "houseCapital",
  merchantReserveYears: 5
};

export const MARKET_SETTING_LIMITS = {
  foundingSpacingFactor: { min: 0, max: 3, step: 0.05 },
  dissolveWealthShare: { min: 0, max: 1, step: 0.01 },
  dissolveMonths: { min: 1, max: 60, step: 1 },
  surplusRuralWeight: { min: 0, max: 1, step: 0.05 },
  surplusReserveFactor: { min: 0, max: 2, step: 0.05 },
  merchantProfitShare: { min: 0, max: 1, step: 0.01 },
  merchantReserveYears: { min: 0, max: 10, step: 0.5 }
} as const;

type NumericMarketSetting = keyof typeof MARKET_SETTING_LIMITS;

const cargoMode = (value: unknown): MarketDissolveCargoMode =>
  MARKET_DISSOLVE_CARGO_MODES.includes(value as MarketDissolveCargoMode)
    ? (value as MarketDissolveCargoMode)
    : DEFAULT_MARKET_SETTINGS.dissolveCargo;

const hayTradeMode = (value: unknown): HayTradeMode =>
  HAY_TRADE_MODES.includes(value as HayTradeMode) ? (value as HayTradeMode) : DEFAULT_MARKET_SETTINGS.hayTrade;

const profitUse = (value: unknown): MerchantProfitUse =>
  MERCHANT_PROFIT_USES.includes(value as MerchantProfitUse)
    ? (value as MerchantProfitUse)
    : DEFAULT_MARKET_SETTINGS.merchantProfitUse;

const hayPaymentMode = (value: unknown): HayPaymentMode =>
  HAY_PAYMENT_MODES.includes(value as HayPaymentMode) ? (value as HayPaymentMode) : DEFAULT_MARKET_SETTINGS.hayPayment;

const clamp = (key: NumericMarketSetting, value: unknown): number => {
  const { min, max, step } = MARKET_SETTING_LIMITS[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MARKET_SETTINGS[key];
  const clamped = Math.max(min, Math.min(max, value));
  return step === 1 ? Math.round(clamped) : clamped;
};

export function getMarketSettings(): MarketSettings {
  let parsed: Partial<MarketSettings> = {};
  try {
    const stored = worldSettings.getItem(MARKET_SETTINGS_KEY);
    if (stored) parsed = JSON.parse(stored) as Partial<MarketSettings>;
  } catch {
    // Blocked storage or a damaged value: the code defaults apply.
  }
  return {
    foundingSpacingFactor: clamp("foundingSpacingFactor", parsed.foundingSpacingFactor),
    dissolveWealthShare: clamp("dissolveWealthShare", parsed.dissolveWealthShare),
    dissolveMonths: clamp("dissolveMonths", parsed.dissolveMonths),
    dissolveCargo: cargoMode(parsed.dissolveCargo),
    hayTrade: hayTradeMode(parsed.hayTrade),
    hayPayment: hayPaymentMode(parsed.hayPayment),
    surplusRuralWeight: clamp("surplusRuralWeight", parsed.surplusRuralWeight),
    surplusReserveFactor: clamp("surplusReserveFactor", parsed.surplusReserveFactor),
    merchantProfitShare: clamp("merchantProfitShare", parsed.merchantProfitShare),
    merchantProfitUse: profitUse(parsed.merchantProfitUse),
    merchantReserveYears: clamp("merchantReserveYears", parsed.merchantReserveYears)
  };
}

export function setMarketSettings(patch: Partial<MarketSettings>): MarketSettings {
  const next = { ...getMarketSettings(), ...patch };
  const settings: MarketSettings = {
    foundingSpacingFactor: clamp("foundingSpacingFactor", next.foundingSpacingFactor),
    dissolveWealthShare: clamp("dissolveWealthShare", next.dissolveWealthShare),
    dissolveMonths: clamp("dissolveMonths", next.dissolveMonths),
    dissolveCargo: cargoMode(next.dissolveCargo),
    hayTrade: hayTradeMode(next.hayTrade),
    hayPayment: hayPaymentMode(next.hayPayment),
    surplusRuralWeight: clamp("surplusRuralWeight", next.surplusRuralWeight),
    surplusReserveFactor: clamp("surplusReserveFactor", next.surplusReserveFactor),
    merchantProfitShare: clamp("merchantProfitShare", next.merchantProfitShare),
    merchantProfitUse: profitUse(next.merchantProfitUse),
    merchantReserveYears: clamp("merchantReserveYears", next.merchantReserveYears)
  };
  worldSettings.setItem(MARKET_SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

/** Distance between market centres at map generation: it scales with map size over the burg count. */
export function getMarketGenerationSpacing(graphWidth: number, graphHeight: number, burgSlots: number): number {
  return ((graphWidth + graphHeight) * 2) / pow(Math.max(1, burgSlots), 0.6);
}
