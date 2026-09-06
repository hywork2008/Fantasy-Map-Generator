/**
 * History-mode profile catalog (docs/plan/advance-time-history-mode.md §3.2).
 *
 * History mode is a profile layered on top of Fast-Forward, not a replacement for it: Fast-Forward
 * still decides how population/prices/stock move, while these profiles decide *which simulation
 * systems run at all*, how coarse a tick is, and where treasury money comes from. The point is to
 * run decades in one action and get a readable chronicle of people, states and wars out of it —
 * everything that does not feed that story is switched off rather than approximated.
 *
 * `off` must reproduce pre-history-mode behaviour exactly; every other field here is inert while
 * it is selected.
 */

/** How many calendar days one simulation tick covers during a history-mode run (§4). */
export type HistoryStride = "day" | "month";

export type HistoryModeProfileId = "off" | "chronicle" | "dynastyOnly" | "custom";

export const HISTORY_MODE_PROFILE_IDS: readonly HistoryModeProfileId[] = ["off", "chronicle", "dynastyOnly", "custom"];

/**
 * Stub treasury income (§6). Fast-Forward's own treasury model is purely multiplicative
 * (`treasury * (1 + r)^years`), so with the calibrated Steady rate of -13%/yr a 50-year run
 * multiplies every treasury by ~0.00095 and — because the result is clamped at 0 — a bankrupt
 * state can never recover. Bankrupt states stop expanding (frontierGovernance.ts checks
 * `treasury >= 30`), so the map freezes and no history gets written. An *additive*, population-
 * proportional income replaces that model while history mode runs: it has no absorbing zero, and
 * it keeps large realms richer than small ones so conquest compounds into real rise and fall.
 */
export interface StubFundingConfig {
  readonly enabled: boolean;
  /** Nominal annual income per head of population, in the same unit as `state.treasury`. */
  readonly revenuePerCapitaPerYear: number;
  /** Standing expenditure as a share of income. 1.0 balances the books; >1 is a structural deficit. */
  readonly upkeepRatio: number;
  /** Extra multiplier on `upkeepRatio` for a state currently at war — the main driver of decline. */
  readonly warUpkeepMultiplier: number;
  /** Safety net: treasury never drops below this share of one year's income. 0 allows bankruptcy. */
  readonly floorRatio: number;
}

export interface HistoryModeProfile {
  readonly stride: HistoryStride;
  /** Simulation system ids skipped entirely for the duration of the run (§5). */
  readonly disabledSystemIds: readonly string[];
  readonly stubFunding: StubFundingConfig;
  /**
   * Resolve wars even under a player-directed conflict policy (§5.4).
   *
   * `shouldSuppressConflictAdvance()` normally skips all turn-by-turn warfare during a bulk
   * advance on player-directed maps — precisely the thing a history run exists to produce. The
   * player's saved `conflictAutonomy` option is never rewritten; it is only ignored while the run
   * is in progress.
   */
  readonly forceAutonomousConflict: boolean;
}

/**
 * Calibrated live, 2026-09-06 (Phase H4), on a 30-state / 161-burg map under the `chronicle`
 * profile — measured the way FF Phase 0 measured its growth rates rather than estimated.
 *
 * Method: with income and upkeep both zeroed (so this step ran but contributed nothing), a
 * 10-year chronicle run drained state treasuries at **0.13 per population point per year**. That
 * is the real outflow of the systems the profile leaves running — mostly frontier governance and
 * war — and it is what income has to clear.
 *
 * Note what `upkeepRatio` therefore is *not*: it does not stand in for that real spending, which
 * still happens on top. It is a separate stub cost, so the net income a realm actually keeps is
 * `revenuePerCapitaPerYear * (1 - upkeepRatio) - 0.13`. The first draft got this wrong (0.12 and
 * 0.95) and left every realm with ~22x less than it spent: after 50 years **none** of the 30
 * realms could afford frontier governance's `treasury >= 30` expansion posture, borders froze,
 * and the run produced exactly the dead world this whole mechanism exists to prevent.
 *
 * At the values below a realm at peace nets ~0.065/point/yr and one at war nets ~-0.019, so war
 * is what makes a realm decline. Re-measured over 50 years: 25 of 30 realms solvent enough to
 * expand, none bankrupt, treasuries spread 25–1175 (they started at 90) — large realms compound
 * their advantage, which is the rise and fall the profile is for.
 */
export const DEFAULT_STUB_FUNDING: StubFundingConfig = {
  enabled: true,
  revenuePerCapitaPerYear: 0.3,
  upkeepRatio: 0.35,
  warUpkeepMultiplier: 1.8,
  floorRatio: 0
};

const NO_STUB_FUNDING: StubFundingConfig = { ...DEFAULT_STUB_FUNDING, enabled: false };

/**
 * Economy steps the `chronicle` profile keeps (§5.2): war intensity feeds the rise and fall of
 * states, and the annual knowledge block is where technology history comes from. Everything else
 * in the economy tick is either day-cadence work that a monthly stride would misapply, or detail
 * no chronicle reader ever sees.
 */
const CHRONICLE_DISABLED_ECONOMY = [
  "economy.marketTerritorySync",
  "economy.annualAgTech",
  "economy.caravans",
  "economy.dailyHiring",
  "economy.annualUrbanLabor",
  "economy.annualPlants",
  "economy.annualInfrastructure",
  "economy.annualBurgGroups",
  "economy.forestProspect",
  "economy.foodCalendar"
] as const;

const ALL_ECONOMY = [...CHRONICLE_DISABLED_ECONOMY, "economy.warIntensity", "economy.annualKnowledge"] as const;

export const HISTORY_MODE_PROFILES: Readonly<Record<Exclude<HistoryModeProfileId, "custom">, HistoryModeProfile>> = {
  off: {
    stride: "day",
    disabledSystemIds: [],
    stubFunding: NO_STUB_FUNDING,
    forceAutonomousConflict: false
  },
  /** The default history profile: people, states and wars, with technology still progressing. */
  chronicle: {
    stride: "month",
    disabledSystemIds: [
      ...CHRONICLE_DISABLED_ECONOMY,
      "economy.marketTerritories",
      "shipbuilding.tick",
      "nobility.playerTravel"
    ],
    stubFunding: DEFAULT_STUB_FUNDING,
    forceAutonomousConflict: true
  },
  /**
   * Births, deaths and successions only, as fast as possible — the profile
   * docs/plan/world-history-depth.md Layer A2 uses to make real tenure records rather than
   * backdated ones. No economy, no technology, no armies.
   */
  dynastyOnly: {
    stride: "month",
    disabledSystemIds: [
      ...ALL_ECONOMY,
      "economy.marketTerritories",
      "shipbuilding.tick",
      "nobility.playerTravel",
      "nobility.frontierGovernance",
      "nobility.strategy",
      "nobility.combat",
      "nobility.regimentMovement"
    ],
    stubFunding: { ...DEFAULT_STUB_FUNDING, upkeepRatio: 1, warUpkeepMultiplier: 1 },
    forceAutonomousConflict: false
  }
};

export const DEFAULT_HISTORY_MODE_PROFILE: HistoryModeProfileId = "off";

/** Seed for the user-editable "custom" profile — the chronicle preset, so editing starts sane. */
export const DEFAULT_CUSTOM_HISTORY_PROFILE: HistoryModeProfile = {
  ...HISTORY_MODE_PROFILES.chronicle,
  disabledSystemIds: [...HISTORY_MODE_PROFILES.chronicle.disabledSystemIds]
};

export function getNamedHistoryProfile(id: Exclude<HistoryModeProfileId, "custom">): HistoryModeProfile {
  return HISTORY_MODE_PROFILES[id];
}

/** Days in one stride step, given how many days remain and where the clock currently stands. */
export function strideStepDays(stride: HistoryStride, remainingDays: number, daysUntilNextMonthStart: number): number {
  if (stride === "day") return 1;
  // Always land on the 1st of a month. Every annual/monthly gate in the tick is written as
  // `currentDay === 1` (and `&& currentMonth === 1` for annual work), so a stride that lands
  // anywhere else would step straight over them; landing exactly on the 1st fires each of them
  // the same number of times a day-by-day run would (§4.1).
  return Math.max(1, Math.min(remainingDays, daysUntilNextMonthStart));
}
