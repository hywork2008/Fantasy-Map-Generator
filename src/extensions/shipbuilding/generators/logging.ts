import { rn } from "../../hostUtils";
import { getWorldContext } from "../shipbuildingContext";
import type { ShipyardCandidate } from "./shipyardCandidates";

/**
 * Market Wood units harvested per in-world year at forestRatio === 1. Together
 * with Economy's FOREST_COVER_PER_WOOD_UNIT this preserves the former 2.5%
 * annual shipyard forest-pressure calibration without a separate coefficient.
 */
const LOGGING_RATE_PER_YEAR = 125;

/**
 * Called on every advanceTime() tick. Computes how much timber each shipyard
 * candidate harvests this tick and notifies listeners via a CustomEvent — loose
 * coupling so Shipbuilding never imports Economy directly (see AGENTS.md §7).
 * Economy's forestStock.ts listens for this to reduce the same local timber
 * stock used by ordinary Wood production.
 */
export function runLoggingTick(candidates: ShipyardCandidate[], deltaYears: number): void {
  if (candidates.length === 0 || deltaYears <= 0) return;
  const { pack } = getWorldContext();

  for (const { burgId, forestRatio, loggingCellId } of candidates) {
    const burg = pack.burgs[burgId];
    if (!burg || burg.removed) continue;

    const amount = rn(LOGGING_RATE_PER_YEAR * forestRatio * deltaYears, 2);
    if (amount <= 0) continue;

    document.dispatchEvent(
      new CustomEvent("fmg:shipbuilding-log-harvested", {
        detail: { cellId: loggingCellId, burgId, amount, deltaYears }
      })
    );
  }
}
