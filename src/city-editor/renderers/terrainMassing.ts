import type { BuildingLot } from "../generators/buildingLots.types";
import type { CityTerrain } from "../generators/terrainElevation";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { Point } from "../types/document";

/** Horizontal building floors and vertical plinths absorb the terrain, never tilt buildings. */
export function groundStructures(parts: StructureMassing[], terrain: CityTerrain): StructureMassing[] {
  if (!terrain.relief) return parts;
  return parts.flatMap(part => {
    if (part.sections || part.id.includes(":krak:")) return [part];
    const ring = part.footprint ?? part.centerline ?? [];
    if (!ring.length) return [part];
    const level = terrain.foundationAt(ring);
    const low = Math.min(...ring.map(terrain.heightAt));
    const raised = { ...part, baseElevationMeters: part.baseElevationMeters + level };
    if (level - low < 0.1 || part.kind === "bridge" || part.baseElevationMeters > 0) return [raised];
    return [
      {
        ...part,
        id: `${part.id}:foundation`,
        baseElevationMeters: low - 0.2,
        heightMeters: level - low + 0.2,
        roof: "flat" as const,
        parapet: "none" as const,
        parapetMeters: 0,
        parapetWidthMeters: 0,
        spire: false
      },
      raised
    ];
  });
}

export function lotFoundations(lots: readonly BuildingLot[], terrain: CityTerrain): StructureMassing[] {
  if (!terrain.relief) return [];
  return lots.flatMap((lot, i) => {
    if (!lot.massing || lot.landmark || lot.polygon.length < 3) return [];
    const level = terrain.foundationAt(lot.polygon);
    const low = Math.min(...lot.polygon.map(terrain.heightAt));
    if (level - low < 0.1) return [];
    return [
      {
        id: `lot-foundation:${lot.id ?? i}`,
        kind: "landmark" as const,
        material: "stone" as const,
        footprint: lot.polygon as Point[],
        baseElevationMeters: low - 0.2,
        heightMeters: level - low + 0.2,
        roof: "flat" as const,
        parapet: "none" as const,
        parapetMeters: 0,
        parapetWidthMeters: 0,
        spire: false
      }
    ];
  });
}
