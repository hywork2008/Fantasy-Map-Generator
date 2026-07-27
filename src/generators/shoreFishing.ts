/**
 * Shore fishing / coastal gathering — household-scale activity on beaches and
 * intertidal coasts. Distinct from Economy Ships, shipyard queues, and completed hulls.
 *
 * Formal harbors and shipbuilding remain gated by allowsFormalHarbor (no sandy beach).
 */

import {
  getCoastalHabitatDefinition,
  getCoastalHabitatKey,
  getNearshoreHabitatDefinition,
  isSandyBeach
} from "../data/coastalHabitatCatalog";
import { HeightThreshold } from "../data/constants";
import type { PackedGraph } from "../types/PackedGraph";

export type ShoreActivity = "shoreFishing" | "shellfishGathering" | "shoreForaging";

export interface ShoreFishingSite {
  readonly cellId: number;
  readonly coastalHabitatKey: string;
  readonly nearshoreHabitatKey: string | null;
  readonly activities: readonly ShoreActivity[];
  /**
   * Informal landing only — never a formal harbor, shipyard, Ships stock, or hull.
   */
  readonly formalHarborAllowed: false;
  readonly smallCraftLanding: true;
}

/**
 * Cells where personal boats / shore gathering make sense.
 * Sandy beaches and tidal flats always qualify; rocky intertidal allows gathering
 * but is a poorer boat landing.
 */
export function computeShoreFishingSites(pack: PackedGraph): ShoreFishingSite[] {
  const { cells } = pack;
  const coastal = cells.coastalHabitat;
  const nearshore = cells.nearshoreHabitat;
  if (!coastal || !cells.i) return [];

  const sites: ShoreFishingSite[] = [];

  for (const cellId of cells.i) {
    if (cells.h[cellId] < HeightThreshold.WATER_MAX_HEIGHT) continue;
    const code = coastal[cellId] ?? 0;
    if (!code) continue;
    const key = getCoastalHabitatKey(code);
    if (key === "none" || key === "coastalDune") continue;

    const activities: ShoreActivity[] = [];
    if (key === "sandyBeach" || key === "tidalFlat") {
      activities.push("shoreFishing", "shellfishGathering", "shoreForaging");
    } else if (key === "rockyIntertidal") {
      activities.push("shellfishGathering", "shoreForaging");
    } else {
      continue;
    }

    // Adjacent nearshore habitat (if any) for fishery richness hints
    let nearKey: string | null = null;
    for (const nb of cells.c[cellId] ?? []) {
      if (cells.h[nb] >= HeightThreshold.WATER_MAX_HEIGHT) continue;
      const nCode = nearshore?.[nb] ?? 0;
      if (nCode) {
        nearKey = getNearshoreHabitatDefinition(nCode).key;
        break;
      }
    }

    sites.push({
      cellId,
      coastalHabitatKey: getCoastalHabitatDefinition(code).key,
      nearshoreHabitatKey: nearKey,
      activities,
      formalHarborAllowed: false,
      smallCraftLanding: true
    });
  }

  return sites;
}

/** True if this land cell can host only informal small-craft landing (sandy beach). */
export function isSmallCraftOnlyLanding(pack: PackedGraph, cellId: number): boolean {
  const code = pack.cells.coastalHabitat?.[cellId];
  return isSandyBeach(code ?? 0);
}
