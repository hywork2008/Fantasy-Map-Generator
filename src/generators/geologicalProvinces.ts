/**
 * Phase-1 deterministic pseudo-geology, extracted to `core` from the Economy extension's
 * `mineralResources.ts` (docs/plan/underground-realm-and-supernatural-areas.md §3.2).
 *
 * The Economy extension (mineral deposits) and the core underground-realm generator
 * (docs/plan/underground-realm-and-supernatural-areas.md, `caveSystems.ts`) both need the same
 * geology classification, but core generators cannot import from an extension. This module is
 * the shared, side-effect-free source of truth; `mineralResources.ts` delegates to it and must
 * see byte-identical output (same seed → same province per cell) so its existing deposit tests
 * stay green.
 *
 * Terrain height, drainage, and map seed remain the only inputs for every province kind except
 * "volcanic" — see `classifyProvince()`'s volcanic branch (docs/plan/volcanic-biome-goods.md
 * §3.1). That one exception deliberately reads biome data (a cell's "volcanic" BiomeTag) because
 * it is a real, generator-placed signal (HeightmapModule.finalizeVolcanoes →
 * biomeAssignment.ts's volcanicBarrens/lavaField/volcanicSoil) rather than a guess. A future
 * tectonic model would replace the rest (mineralResources.ts's own module doc-comment already
 * flags this).
 */
import { biomeHasTag } from "../data/biomeCatalog";
import type { BiomesData } from "../types/WorldState";

export type GeologicalProvinceKind = "orogen" | "shield" | "granite" | "carbonate" | "basin" | "placer" | "volcanic";

export const PROVINCE_ORDER: readonly GeologicalProvinceKind[] = [
  "orogen",
  "shield",
  "granite",
  "carbonate",
  "basin",
  "placer",
  "volcanic"
];

export interface GeologicalProvinceCells {
  readonly i: ArrayLike<number>;
  readonly h: ArrayLike<number>;
  readonly r: ArrayLike<number>;
  readonly biomeCode?: ArrayLike<number>;
}

/** FNV-1a-style string hash, folded to [0, 1). Shared verbatim with mineralResources.ts. */
export function geologyHash(seed: string, scope: string, value: string | number): number {
  let hash = 2166136261;
  for (const character of `${seed}:${scope}:${value}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/** Classifies a single land cell's geological province. Pure function of seed + terrain/biome. */
export function classifyGeologicalProvince(
  seed: string,
  cellId: number,
  cells: GeologicalProvinceCells,
  biomesData: Pick<BiomesData, "tags"> | undefined
): GeologicalProvinceKind {
  const height = cells.h[cellId] ?? 0;
  const regional = geologyHash(seed, "province", Math.floor(cellId / 23));
  const biomeCode = cells.biomeCode?.[cellId];
  if (biomeCode !== undefined && biomesData?.tags && biomeHasTag(biomesData as BiomesData, biomeCode, "volcanic")) {
    return "volcanic";
  }
  if (cells.r[cellId] && height >= 20 && height < 48) return "placer";
  if (height >= 70) return regional < 0.36 ? "granite" : "orogen";
  if (height >= 53) return regional < 0.3 ? "granite" : regional < 0.7 ? "orogen" : "shield";
  if (height >= 38) return regional < 0.42 ? "carbonate" : regional < 0.72 ? "shield" : "basin";
  return regional < 0.28 ? "carbonate" : "basin";
}

export interface GeologicalProvince {
  readonly i: number;
  readonly kind: GeologicalProvinceKind;
  /** Mutable to match `MineralGeologicalProvince.cells` — the Economy extension's identical shape. */
  cells: number[];
}

/** Classifies every land cell (h >= 20) and groups them by province kind, in PROVINCE_ORDER. */
export function generateGeologicalProvinces(
  seed: string,
  cells: GeologicalProvinceCells,
  biomesData: Pick<BiomesData, "tags"> | undefined
): GeologicalProvince[] {
  const provinceCells = new Map<GeologicalProvinceKind, number[]>(PROVINCE_ORDER.map(kind => [kind, []]));
  for (let index = 0; index < cells.i.length; index++) {
    const cellId = cells.i[index];
    if (cells.h[cellId] < 20) continue;
    provinceCells.get(classifyGeologicalProvince(seed, cellId, cells, biomesData))!.push(cellId);
  }
  return PROVINCE_ORDER.map((kind, index) => ({ i: index + 1, kind, cells: provinceCells.get(kind)! }));
}
