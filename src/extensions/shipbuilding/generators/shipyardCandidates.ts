import { rn } from "../../hostUtils";
import { getWorldContext } from "../shipbuildingContext";

export interface ShipyardCandidate {
  burgId: number;
  /** Share of the burg's neighboring cells that are forest biome, 0..1. */
  forestRatio: number;
}

const FOREST_NAME_PATTERN = /forest|taiga/i;
const MIN_FOREST_RATIO = 0.3;

/** Derives forest biome ids from the current map's biome names — no dependency on Economy's Goods data. */
function getForestBiomeIds(): Set<number> {
  const names = getWorldContext().biomesData.name ?? [];
  const ids = new Set<number>();
  names.forEach((name, i) => {
    if (FOREST_NAME_PATTERN.test(name)) ids.add(i);
  });
  return ids;
}

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
  const forestBiomeIds = getForestBiomeIds();
  if (forestBiomeIds.size === 0 || !pack.burgs) return [];

  const candidates: ShipyardCandidate[] = [];

  for (const burg of pack.burgs) {
    if (!burg.i || burg.removed || !burg.port) continue;

    const haven = pack.cells.haven[burg.cell];
    if (!haven || pack.features[pack.cells.f[haven]]?.type !== "ocean") continue;

    const neighbors = pack.cells.c[burg.cell] ?? [];
    if (neighbors.length === 0) continue;

    const forestNeighborCount = neighbors.filter(n => forestBiomeIds.has(pack.cells.biome[n])).length;
    const forestRatio = forestNeighborCount / neighbors.length;

    if (forestRatio >= MIN_FOREST_RATIO) {
      candidates.push({ burgId: burg.i, forestRatio: rn(forestRatio, 2) });
    }
  }

  return candidates;
}
