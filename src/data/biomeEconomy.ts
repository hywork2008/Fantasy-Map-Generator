/**
 * Helpers for economy / resource logic that must use BiomeKey or tags —
 * never hard-coded code ranges.
 */

import type { BiomeTag } from "../types/biome";
import type { BiomesData } from "../types/WorldState";
import { biomeHasAnyTag, biomeHasTag } from "./biomeCatalog";

/** Production rate for a good on a cell biome code, from numeric map and/or tag map. */
export function resolveBiomeOutputRate(
  biomeCode: number,
  biomeOutput: Partial<Record<number, number>> | undefined,
  biomeOutputByTag: Partial<Record<BiomeTag, number>> | undefined,
  biomesData: BiomesData
): number {
  const direct = biomeOutput?.[biomeCode];
  if (direct !== undefined && direct > 0) return direct;

  if (!biomeOutputByTag) return 0;
  const tags = biomesData.tags?.[biomeCode] ?? [];
  let best = 0;
  for (const tag of tags) {
    const rate = biomeOutputByTag[tag as BiomeTag];
    if (rate !== undefined && rate > best) best = rate;
  }
  return best;
}

export function cellMatchesBiomeTags(biomesData: BiomesData, biomeCode: number, tags: readonly BiomeTag[]): boolean {
  return biomeHasAnyTag(biomesData, biomeCode, tags);
}

export function cellHasBiomeTag(biomesData: BiomesData, biomeCode: number, tag: BiomeTag): boolean {
  return biomeHasTag(biomesData, biomeCode, tag);
}
