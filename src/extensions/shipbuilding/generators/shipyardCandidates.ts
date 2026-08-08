import { evaluateHarborElevation } from "../../../generators/harborSiteConditions";
import { normalizeHeightExponent } from "../../../utils/height";
import { useOptionsState } from "../../hostCore";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../shipbuildingContext";

export interface ShipyardCandidate {
  burgId: number;
  /** Share of the burg's neighboring cells occupied by standing forest, 0..1. */
  forestRatio: number;
  /** Neighboring forest cell from which the shipyard takes timber. */
  loggingCellId: number;
}

const MIN_FOREST_RATIO = 0.3;

/**
 * Burgs directly on the open ocean (not just economically connected to it) that also
 * sit next to enough forest biome to plausibly develop shipbuilding (timber supply +
 * sea access). Pure derived data — reads pack.burgs/cells/features, mutates nothing.
 *
 * burg.port is NOT used here: it stores the id of the water feature the port trades on
 * (see burgs-generator.ts), which for lake burgs is resolved via
 * Rivers.resolveLakeDrainFeature() to whatever that lake's outlet river eventually
 * drains into — so a small headwater lake many cells upstream, if its river chain
 * reaches the sea, gets burg.port set to the ocean's feature id even though the burg
 * itself is nowhere near the coast. Instead, check the immediate adjacent water cell
 * (cells.haven) directly, which is never resolved through a drain chain.
 */
export function computeShipyardCandidates(): ShipyardCandidate[] {
  const { pack } = getWorldContext();
  if (!pack.burgs) return [];

  const heightExponent = normalizeHeightExponent(useOptionsState.getState().heightExponent);
  const candidates: ShipyardCandidate[] = [];

  for (const burg of pack.burgs) {
    if (!burg.i || burg.removed || !burg.port) continue;

    // Elevation Unsuitable gate (docs/plan/harbor-siting.md §3.1/§5.2). burgs-generator.ts
    // already applies this before a burg can become a port, so this is a defensive re-check —
    // no non-port burg reaches here (the `!burg.port` guard above already excludes them).
    if (evaluateHarborElevation(pack.cells.h[burg.cell], heightExponent).tier === "unsuitable") continue;

    const haven = pack.cells.haven[burg.cell];
    if (!haven || pack.features[pack.cells.f[haven]]?.type !== "ocean") continue;

    const neighbors = pack.cells.c[burg.cell] ?? [];
    if (neighbors.length === 0) continue;

    let loggingCellId = burg.cell;
    let richestForest = 0;
    const forestRatio =
      neighbors.reduce((sum, cellId) => {
        const capacity = pack.cells.forestCover?.[cellId] ?? 0;
        const stock = Math.max(0, Math.min(capacity, pack.cells.forestStock?.[cellId] ?? capacity));
        if (stock > richestForest) {
          richestForest = stock;
          loggingCellId = cellId;
        }
        return sum + stock;
      }, 0) / neighbors.length;

    if (forestRatio >= MIN_FOREST_RATIO) {
      candidates.push({ burgId: burg.i, forestRatio: rn(forestRatio, 2), loggingCellId });
    }
  }

  return candidates;
}
