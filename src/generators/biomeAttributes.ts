/**
 * Initialize optional biome attribute columns (forest cover/condition, canopy, land cover).
 * Fantasy specials stay 0 until a later content system sets them — never invent magic forests
 * from climate alone.
 */

import { isForestBiome } from "../data/biomeCatalog";
import { type CanopyKey, canopyCode, forestConditionCode, landCoverCode } from "../types/biomeAttributes";
import type { PackedGraph } from "../types/PackedGraph";
import type { BiomesData } from "../types/WorldState";

function canopyForKey(biomeKey: string | undefined): CanopyKey {
  if (!biomeKey) return "none";
  if (biomeKey === "taiga" || biomeKey === "temperateConiferousForest" || biomeKey === "montaneForest")
    return "conifer";
  if (biomeKey === "centralEuropeanGreatForest" || biomeKey === "temperateRainforest") return "mixed";
  if (biomeKey === "tropicalDryForest") return "broadleaf";
  if (
    biomeKey.includes("deciduous") ||
    biomeKey.includes("Forest") ||
    biomeKey === "tropicalSeasonalForest" ||
    biomeKey === "tropicalRainforest" ||
    biomeKey === "cloudForest" ||
    biomeKey === "floodedForest" ||
    biomeKey === "mangrove"
  )
    return "broadleaf";
  return "mixed";
}

/** Default forest cover (0-1) and condition for a forest biome key. Shared with the Region Editor's Voronoi sandbox. */
export function forestAttributesForKey(key: string | undefined): { cover: number; condition: "mature" | "ancient" } {
  if (key === "centralEuropeanGreatForest") return { cover: 0.9, condition: "ancient" };
  if (key === "tropicalRainforest" || key === "cloudForest") return { cover: 0.95, condition: "mature" };
  if (key === "tropicalDryForest") return { cover: 0.55, condition: "mature" };
  if (key === "mangrove" || key === "floodedForest") return { cover: 0.75, condition: "mature" };
  return { cover: 0.7, condition: "mature" };
}

/**
 * Seed attribute layers from climate biomes. Does not invent special features.
 * Great forests get higher cover and mature condition as a playable default.
 */
export function initializeBiomeAttributes(pack: PackedGraph, biomesData: BiomesData): void {
  const n = pack.cells.i.length;
  const forestCover = new Float32Array(n);
  const forestCondition = new Uint8Array(n);
  const canopy = new Uint8Array(n);
  const landCover = new Uint8Array(n);
  const specialFeature = new Uint8Array(n);

  const mature = forestConditionCode("mature");
  const ancient = forestConditionCode("ancient");
  const natural = landCoverCode("naturalForest");
  const noneLand = landCoverCode("none");

  for (let i = 0; i < n; i++) {
    const code = pack.cells.biomeCode[i];
    if (!isForestBiome(biomesData, code)) {
      landCover[i] = noneLand;
      continue;
    }
    const key = biomesData.keys?.[code];
    canopy[i] = canopyCode(canopyForKey(key));
    landCover[i] = natural;
    const attr = forestAttributesForKey(key);
    forestCover[i] = attr.cover;
    forestCondition[i] = attr.condition === "ancient" ? ancient : mature;
  }

  pack.cells.forestCover = forestCover;
  pack.cells.forestCondition = forestCondition;
  pack.cells.canopy = canopy;
  pack.cells.landCover = landCover;
  pack.cells.specialFeature = specialFeature;
}
