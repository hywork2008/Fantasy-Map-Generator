/**
 * Fast-Forward preset catalog (docs/plan/advance-time-fast-forward.md §5).
 *
 * Each preset is a flat annual growth-rate vector applied in place of the real Economy monthly
 * settlement and population simulation while Fast-Forward is enabled — see fastAdvancePopulation.ts
 * and src/extensions/economy/generators/fastAdvanceEconomy.ts for where these rates get used.
 *
 * Only "steady" is empirically calibrated (npm run calibrate:fast-advance,
 * docs/analytics/fast-advance-calibration.json, §5.3). The other five presets are designer
 * estimates anchored on that measurement, not individually measured (§5.2, §10).
 */

/** Per-preset annual growth-rate knobs plus the two anti-runaway safety rails (§5.1). */
export interface FastAdvanceRates {
  /** Net annual population growth rate, percent (applied to both rural cell pop and burg pop). */
  readonly populationGrowthPctPerYear: number;
  /** Annual Good price drift, percent. */
  readonly priceInflationPctPerYear: number;
  /** Annual market Good stock growth rate, percent — a trade-volume proxy. */
  readonly goodsStockGrowthPctPerYear: number;
  /** Annual State/Burg treasury growth rate, percent (can be negative — see §5.2/§5.3.3). */
  readonly treasuryGrowthPctPerYear: number;
  /** Per-burg/per-market random jitter amplitude, percent of the computed factor. */
  readonly variancePct: number;
  /** Good stock floor, as a multiple of the value it had when this fast-forward batch began. */
  readonly stockFloorMultiplier: number;
  /** Good stock cap, as a multiple of the value it had when this fast-forward batch began. */
  readonly stockCapMultiplier: number;
}

export type FastAdvancePresetId = "collapse" | "decline" | "stagnant" | "steady" | "growth" | "boom" | "custom";

/** Named (non-custom) presets — the only ones with a fixed rate vector. */
export type NamedFastAdvancePresetId = Exclude<FastAdvancePresetId, "custom">;

export const FAST_ADVANCE_PRESET_IDS: readonly NamedFastAdvancePresetId[] = [
  "collapse",
  "decline",
  "stagnant",
  "steady",
  "growth",
  "boom"
];

/** Every preset the UI offers, in display order — the named presets plus the user-editable "custom". */
export const FAST_ADVANCE_PRESET_SELECT_IDS: readonly FastAdvancePresetId[] = [...FAST_ADVANCE_PRESET_IDS, "custom"];

/** Shared across every named preset — only "steady" has been individually calibrated (§5.1). */
const STOCK_SAFETY_RAILS = { stockFloorMultiplier: 0.2, stockCapMultiplier: 5.0 } as const;

/** docs/plan/advance-time-fast-forward.md §5.2 (confirmed table, 2026-09-06). */
export const FAST_ADVANCE_PRESETS: Readonly<Record<NamedFastAdvancePresetId, FastAdvanceRates>> = {
  collapse: {
    populationGrowthPctPerYear: -3.0,
    priceInflationPctPerYear: 4.0,
    goodsStockGrowthPctPerYear: -6.0,
    treasuryGrowthPctPerYear: -65,
    variancePct: 40,
    ...STOCK_SAFETY_RAILS
  },
  decline: {
    populationGrowthPctPerYear: -1.0,
    priceInflationPctPerYear: 2.0,
    goodsStockGrowthPctPerYear: -2.0,
    treasuryGrowthPctPerYear: -35,
    variancePct: 25,
    ...STOCK_SAFETY_RAILS
  },
  stagnant: {
    populationGrowthPctPerYear: 0.1,
    priceInflationPctPerYear: 0.3,
    goodsStockGrowthPctPerYear: 3.0,
    treasuryGrowthPctPerYear: -20,
    variancePct: 10,
    ...STOCK_SAFETY_RAILS
  },
  /** The only empirically-calibrated preset — docs/analytics/fast-advance-calibration.json. */
  steady: {
    populationGrowthPctPerYear: 0.5,
    priceInflationPctPerYear: 0.0,
    goodsStockGrowthPctPerYear: 8.5,
    treasuryGrowthPctPerYear: -13,
    variancePct: 15,
    ...STOCK_SAFETY_RAILS
  },
  growth: {
    populationGrowthPctPerYear: 1.5,
    priceInflationPctPerYear: -0.5,
    goodsStockGrowthPctPerYear: 14.0,
    treasuryGrowthPctPerYear: 0,
    variancePct: 20,
    ...STOCK_SAFETY_RAILS
  },
  boom: {
    populationGrowthPctPerYear: 3.0,
    priceInflationPctPerYear: -1.0,
    goodsStockGrowthPctPerYear: 20.0,
    treasuryGrowthPctPerYear: 15,
    variancePct: 30,
    ...STOCK_SAFETY_RAILS
  }
};

export const DEFAULT_FAST_ADVANCE_PRESET: NamedFastAdvancePresetId = "steady";

export function getNamedPresetRates(preset: NamedFastAdvancePresetId): FastAdvanceRates {
  return FAST_ADVANCE_PRESETS[preset];
}
