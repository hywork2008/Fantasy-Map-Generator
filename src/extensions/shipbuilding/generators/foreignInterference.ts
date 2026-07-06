import type { Burg } from "../../hostTypes";
import type { ShipyardCandidate } from "./shipyardCandidates";

/** Baseline per-year chance that a given shipyard draws unwanted foreign attention. */
const INTERFERENCE_CHANCE_PER_YEAR = 0.01;

/**
 * Stub for a future foreign-interference mechanic (sabotage, spies, trade embargoes)
 * once a real diplomacy/war simulation exists to pick targets and stakes meaningfully
 * (see docs/plan/diplomacy-history.md). For now this is intentionally low-priority:
 * a simple per-tick probability check that only logs a flavor message — no state, no
 * UI, no event dispatch. Isolated in this one function so it can be replaced wholesale
 * later without touching the rest of the extension.
 */
export function checkForeignInterference(
  candidates: readonly ShipyardCandidate[],
  burgs: readonly Burg[],
  deltaYears: number
): void {
  if (deltaYears <= 0) return;

  const chance = 1 - (1 - INTERFERENCE_CHANCE_PER_YEAR) ** deltaYears;
  for (const { burgId } of candidates) {
    const burg = burgs[burgId];
    if (!burg || burg.removed) continue;
    if (Math.random() < chance) {
      const name = burg.name ?? `burg #${burgId}`;
      console.log(`[shipbuilding] Foreign agents sabotage the shipyard at ${name}.`);
    }
  }
}
