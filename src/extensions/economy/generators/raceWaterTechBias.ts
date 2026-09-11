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
 * The separate generation-only Roman inheritance for every Giant-State Burg
 * lives in `urbanWaterSystem.ts`; settlements are placed below a high water
 * source by the core burg generator before that inheritance is applied.
 */
import { isFantasyCulturesSet } from "../../hostRaces";
import type { RaceKey } from "../../hostTypes";
import { raceCatalogEntry } from "../data/raceCatalog";
import type { RaceWaterTechBias } from "../data/raceTypes";

export type WaterTechRaceBias = RaceWaterTechBias;

/**
 * Giant (distant god-line, per raceCivicStance.ts / raceSkillBias.ts's
 * engineering = dwarf-tier lore): aqueduct-grade water lifting and a managed,
 * covered sewer trunk are ancestral knowledge, not something each city has to
 * rediscover. Values are tuned so a river/coastal Giant burg above the
 * managedSewers population gate (1500) converges on tier 4 within a handful of
 * simulated years even under an early-medieval period ceiling.
 */

/** Null outside Fantasy culture sets (highFantasy/darkFantasy) or for races without an entry. */
export function waterTechRaceBiasFor(
  raceKey: RaceKey | string | undefined,
  culturesSet: string | undefined
): WaterTechRaceBias | null {
  if (!raceKey || !isFantasyCulturesSet(culturesSet)) return null;
  return raceCatalogEntry(raceKey)?.waterTechBias ?? null;
}
