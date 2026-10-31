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

export type MarketSettings = {
  /** A town promoted during the run opens a market only this many generation spacings from every market centre. */
  foundingSpacingFactor: number;
  /** A market dissolves when its rural purse per head stays below this share of the median market's. */
  dissolveWealthShare: number;
  /** ...for this many consecutive months. */
  dissolveMonths: number;
  dissolveCargo: MarketDissolveCargoMode;
  hayTrade: HayTradeMode;
};

export const DEFAULT_MARKET_SETTINGS: Readonly<MarketSettings> = {
  foundingSpacingFactor: 1,
  dissolveWealthShare: 0.2,
  dissolveMonths: 12,
  dissolveCargo: "windDown",
  hayTrade: "marketShortfall"
};

export const MARKET_SETTING_LIMITS = {
  foundingSpacingFactor: { min: 0, max: 3, step: 0.05 },
  dissolveWealthShare: { min: 0, max: 1, step: 0.01 },
  dissolveMonths: { min: 1, max: 60, step: 1 }
} as const;

type NumericMarketSetting = keyof typeof MARKET_SETTING_LIMITS;

const cargoMode = (value: unknown): MarketDissolveCargoMode =>
  MARKET_DISSOLVE_CARGO_MODES.includes(value as MarketDissolveCargoMode)
    ? (value as MarketDissolveCargoMode)
    : DEFAULT_MARKET_SETTINGS.dissolveCargo;

const hayTradeMode = (value: unknown): HayTradeMode =>
  HAY_TRADE_MODES.includes(value as HayTradeMode) ? (value as HayTradeMode) : DEFAULT_MARKET_SETTINGS.hayTrade;

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
    hayTrade: hayTradeMode(parsed.hayTrade)
  };
}

export function setMarketSettings(patch: Partial<MarketSettings>): MarketSettings {
  const next = { ...getMarketSettings(), ...patch };
  const settings: MarketSettings = {
    foundingSpacingFactor: clamp("foundingSpacingFactor", next.foundingSpacingFactor),
    dissolveWealthShare: clamp("dissolveWealthShare", next.dissolveWealthShare),
    dissolveMonths: clamp("dissolveMonths", next.dissolveMonths),
    dissolveCargo: cargoMode(next.dissolveCargo),
    hayTrade: hayTradeMode(next.hayTrade)
  };
  worldSettings.setItem(MARKET_SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

/** Distance between market centres at map generation: it scales with map size over the burg count. */
export function getMarketGenerationSpacing(graphWidth: number, graphHeight: number, burgSlots: number): number {
  return ((graphWidth + graphHeight) * 2) / pow(Math.max(1, burgSlots), 0.6);
}
