/**
 * Species-level water/sanitation head start for burgs on Fantasy culture sets.
 *
 * Design: docs/plan/urban-water-and-sanitation-system.md §15.
 *
 * This is a *bias*, not a floor: it raises ceilings and lowers gates that
 * `urbanWaterTech.ts` / `urbanWaterSystem.ts` already evaluate from real burg
 * conditions (geography, treasury, masonry stock). It never bypasses the
 * `hasOutfall` / population gates in `canStartAdvancedProject()` — a burg with
 * nowhere to drain still cannot build a new sewer network, race or no race.
 * The separate generation-only Roman inheritance for Giant-state capitals and
 * cities lives in `urbanWaterSystem.ts`; a landlocked hamlet remains on this
 * ordinary bias path.
 */
import { isFantasyCulturesSet } from "../../../data/raceCivicStance";
import type { RaceKey } from "../../hostTypes";

export interface WaterTechRaceBias {
  /**
   * Additive raise to the historical-period ceiling for `waterLifting` /
   * `municipalSanitation` only (see `waterTechCeilings()`). `sanitaryEngineering`
   * is deliberately untouched — separated storm/foul systems and treatment are
   * later technology than anything Rome had; tier 5 stays purely earned.
   */
  ceilingBonus: { waterLifting: number; municipalSanitation: number };
  /** Treated as extra `administrationBonus` when evaluating `maxInvestableTier()`. */
  administrationBonusBonus: number;
  /** <1 lowers the effective demand-urgency threshold — builds proactively, not reactively. */
  urgencyThresholdMultiplier: number;
  /** >1 speeds annual construction progress once a project is underway (inherited engineering skill). */
  constructionSpeedMultiplier: number;
}

/**
 * Giant (distant god-line, per raceCivicStance.ts / raceSkillBias.ts's
 * engineering = dwarf-tier lore): aqueduct-grade water lifting and a managed,
 * covered sewer trunk are ancestral knowledge, not something each city has to
 * rediscover. Values are tuned so a river/coastal Giant burg above the
 * managedSewers population gate (1500) converges on tier 4 within a handful of
 * simulated years even under an early-medieval period ceiling.
 */
const RACE_WATER_TECH_BIAS: Readonly<Partial<Record<string, WaterTechRaceBias>>> = {
  giant: {
    ceilingBonus: { waterLifting: 0.3, municipalSanitation: 0.25 },
    administrationBonusBonus: 0.15,
    urgencyThresholdMultiplier: 0.6,
    constructionSpeedMultiplier: 1.35
  }
};

/** Null outside Fantasy culture sets (highFantasy/darkFantasy) or for races without an entry. */
export function waterTechRaceBiasFor(
  raceKey: RaceKey | string | undefined,
  culturesSet: string | undefined
): WaterTechRaceBias | null {
  if (!raceKey || !isFantasyCulturesSet(culturesSet)) return null;
  return RACE_WATER_TECH_BIAS[raceKey] ?? null;
}
