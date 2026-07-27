import { isForestBiome } from "../../../data/biomeCatalog";
import { allowsFormalHarbor } from "../../../data/coastalHabitatCatalog";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../shipbuildingContext";

export interface ShipyardCandidate {
  burgId: number;
  /** Share of the burg's neighboring cells that are forest biome, 0..1. */
  forestRatio: number;
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
  const { pack, biomesData } = getWorldContext();
  if (!pack.burgs) return [];

  const candidates: ShipyardCandidate[] = [];

  for (const burg of pack.burgs) {
    if (!burg.i || burg.removed || !burg.port) continue;

    // Sandy beaches cannot host formal shipyards (biomes plan Phase 2).
    if (!allowsFormalHarbor(pack.cells.coastalHabitat?.[burg.cell])) continue;

    const haven = pack.cells.haven[burg.cell];
    if (!haven || pack.features[pack.cells.f[haven]]?.type !== "ocean") continue;

    const neighbors = pack.cells.c[burg.cell] ?? [];
    if (neighbors.length === 0) continue;

    const forestNeighborCount = neighbors.filter(n => isForestBiome(biomesData, pack.cells.biomeCode[n])).length;
    const forestRatio = forestNeighborCount / neighbors.length;

    if (forestRatio >= MIN_FOREST_RATIO) {
      candidates.push({ burgId: burg.i, forestRatio: rn(forestRatio, 2) });
    }
  }

  return candidates;
}
