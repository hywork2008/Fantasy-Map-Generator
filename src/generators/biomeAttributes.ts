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
    if (key === "centralEuropeanGreatForest") {
      forestCover[i] = 0.9;
      forestCondition[i] = ancient;
    } else if (key === "tropicalRainforest" || key === "cloudForest") {
      forestCover[i] = 0.95;
      forestCondition[i] = mature;
    } else if (key === "tropicalDryForest") {
      forestCover[i] = 0.55;
      forestCondition[i] = mature;
    } else if (key === "mangrove" || key === "floodedForest") {
      forestCover[i] = 0.75;
      forestCondition[i] = mature;
    } else {
      forestCover[i] = 0.7;
      forestCondition[i] = mature;
    }
  }

  pack.cells.forestCover = forestCover;
  pack.cells.forestCondition = forestCondition;
  pack.cells.canopy = canopy;
  pack.cells.landCover = landCover;
  pack.cells.specialFeature = specialFeature;
}
