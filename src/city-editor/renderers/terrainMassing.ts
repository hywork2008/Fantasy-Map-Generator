import type { BuildingLot } from "../generators/buildingLots.types";
import type { CityTerrain } from "../generators/terrainElevation";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { Point } from "../types/document";

/** Horizontal building floors and vertical plinths absorb the terrain, never tilt buildings. */
export function groundStructures(parts: StructureMassing[], terrain: CityTerrain): StructureMassing[] {
  if (!terrain.relief) return parts;
  return parts.flatMap(part => {
    if (part.sections || part.id.startsWith("fort-site:") || part.id.includes(":krak:")) return [part];
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

const RAMP_PARAPET_WIDTH_METERS = 0.4;
const RAMP_PARAPET_HEIGHT_METERS = 1;

/** Masonry ramp bodies from the ground to their deck, with a parapet along each side. */
export function rampStructures(terrain: CityTerrain): StructureMassing[] {
  const parts: StructureMassing[] = [];
  const piece = (id: string, ring: Point[], lows: number[], highs: number[]) => {
    const area = ring.reduce((sum, p, k) => {
      const q = ring[(k + 1) % ring.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0);
    if (Math.abs(area) < 1e-6) return;
    const flip = area < 0;
    const footprint = flip ? [...ring].reverse() : ring,
      bottom = flip ? [...lows].reverse() : lows,
      top = flip ? [...highs].reverse() : highs;
    parts.push({
      id,
      kind: "wall",
      material: "stone",
      footprint,
      sections: [
        { footprint, elevationsMeters: bottom },
        { footprint, elevationsMeters: top }
      ],
      baseElevationMeters: Math.min(...bottom),
      heightMeters: Math.max(...top) - Math.min(...bottom),
      roof: "none",
      parapet: "none",
      parapetMeters: 0,
      parapetWidthMeters: 0,
      spire: false
    });
  };
  // The body reaches below the ground everywhere, also where a corner of it touches higher ground.
  const base = (ring: Point[], decks: number[]) => ring.map((p, k) => Math.min(terrain.heightAt(p), decks[k]) - 0.3);
  for (const { ramp, elevations } of terrain.ramps) {
    const line = ramp.centerline,
      half = ramp.widthMeters / 2;
    // Each stretch is a straight block; triangles fill the outside of every bend.
    const normals = line.slice(1).map((point, i) => {
      const dx = point[0] - line[i][0],
        dy = point[1] - line[i][1];
      const length = Math.hypot(dx, dy) || 1;
      return [-dy / length, dx / length] as Point;
    });
    const at = (point: Point, normal: Point, offset: number): Point => [
      point[0] + normal[0] * offset,
      point[1] + normal[1] * offset
    ];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i],
        n = normals[i - 1];
      const deck = [elevations[i - 1], elevations[i], elevations[i], elevations[i - 1]];
      const body = [at(a, n, half), at(b, n, half), at(b, n, -half), at(a, n, -half)];
      piece(`ramp:${ramp.id}:${i}`, body, base(body, deck), deck);
      for (const [name, outer, inner] of [
        ["l", half, half - RAMP_PARAPET_WIDTH_METERS],
        ["r", -half, -half + RAMP_PARAPET_WIDTH_METERS]
      ] as const)
        piece(
          `ramp:${ramp.id}:${i}:${name}`,
          [at(a, n, outer), at(b, n, outer), at(b, n, inner), at(a, n, inner)],
          deck,
          deck.map(level => level + RAMP_PARAPET_HEIGHT_METERS)
        );
      if (i < line.length - 1) {
        const next = normals[i],
          level = elevations[i];
        for (const side of [half, -half]) {
          const wedge = [b, at(b, n, side), at(b, next, side)];
          piece(`ramp:${ramp.id}:${i}:joint${side > 0 ? "l" : "r"}`, wedge, base(wedge, [level, level, level]), [
            level,
            level,
            level
          ]);
        }
      }
    }
  }
  return parts;
}
