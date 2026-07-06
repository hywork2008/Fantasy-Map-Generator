import { rn } from "../../hostUtils";
import { getWorldContext } from "../shipbuildingContext";
import type { ShipyardCandidate } from "./shipyardCandidates";

/** Logs harvested per in-world year, at forestRatio === 1, per candidate burg. */
const LOGGING_RATE_PER_YEAR = 0.5;

/**
 * Called on every advanceTime() tick. Computes how much timber each shipyard
 * candidate harvests this tick and notifies listeners via a CustomEvent — loose
 * coupling so Shipbuilding never imports Economy directly (see AGENTS.md §7).
 * Economy's forestDepletion.ts listens for this to reduce local Wood output.
 */
export function runLoggingTick(candidates: ShipyardCandidate[], deltaYears: number): void {
  if (candidates.length === 0 || deltaYears <= 0) return;
  const { pack } = getWorldContext();

  for (const { burgId, forestRatio } of candidates) {
    const burg = pack.burgs[burgId];
    if (!burg || burg.removed) continue;

    const amount = rn(LOGGING_RATE_PER_YEAR * forestRatio * deltaYears, 2);
    if (amount <= 0) continue;

    document.dispatchEvent(
      new CustomEvent("fmg:shipbuilding-log-harvested", {
        detail: { cellId: burg.cell, burgId, amount, deltaYears }
      })
    );
  }
}
