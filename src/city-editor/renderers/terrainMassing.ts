import type { BuildingLot } from "../generators/buildingLots.types";
import { polygonArea } from "../generators/geom";
import { STAIR_RISER_METERS } from "../generators/roadGrading";
import type { CityTerrain } from "../generators/terrainElevation";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { Point } from "../types/document";

/** The building a part belongs to, when several parts make one building (`temple:<element>:<part>`). */
function multipartBuilding(id: string): string | null {
  return /^temple:[^:]+:/.exec(id)?.[0] ?? null;
}

/** Horizontal building floors and vertical plinths absorb the terrain, never tilt buildings. */
export function groundStructures(parts: StructureMassing[], terrain: CityTerrain): StructureMassing[] {
  if (!terrain.relief) return parts;
  const skipped = (part: StructureMassing) =>
    !!part.sections || part.id.startsWith("fort-site:") || part.id.includes(":krak:");
  // A temple is one building in many parts: all stand on one floor, the highest any of them needs.
  const buildingLevels = new Map<string, number>();
  for (const part of parts) {
    const building = multipartBuilding(part.id);
    const ring = part.footprint ?? part.centerline ?? [];
    if (!building || skipped(part) || !ring.length) continue;
    buildingLevels.set(building, Math.max(buildingLevels.get(building) ?? -Infinity, terrain.foundationAt(ring)));
  }
  return parts.flatMap(whole => splitWallOnTerrain(whole, terrain).flatMap(groundPart));

  function groundPart(part: StructureMassing): StructureMassing[] {
    if (skipped(part)) return [part];
    const ring = part.footprint ?? part.centerline ?? [];
    if (!ring.length) return [part];
    const building = multipartBuilding(part.id);
    const level = (building ? buildingLevels.get(building) : undefined) ?? terrain.foundationAt(ring);
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
  }
}

/** Longest ground-height spread one wall run may span before it is cut and grounded on its own. */
const WALL_RUN_MAX_SPREAD_METERS = 2;

/**
 * A curtain wall follows the ground along its length. One level for the whole centerline would let a distant
 * hill raise the entire wall and turn its plinth into a cliff, so the centerline is cut into runs of similar ground.
 */
function splitWallOnTerrain(part: StructureMassing, terrain: CityTerrain): StructureMassing[] {
  const line = part.centerline;
  if (part.kind !== "wall" || part.footprint || part.sections || !line || line.length < 3) return [part];
  const runs: Point[][] = [];
  let run: Point[] = [line[0]];
  let top = -Infinity;
  let bottom = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i];
    const segTop = terrain.foundationAt([a, b]);
    const segBottom = Math.min(terrain.heightAt(a), terrain.heightAt(b));
    if (run.length > 1 && Math.max(top, segTop) - Math.min(bottom, segBottom) > WALL_RUN_MAX_SPREAD_METERS) {
      runs.push(run);
      run = [a];
      top = -Infinity;
      bottom = Infinity;
    }
    run.push(b);
    top = Math.max(top, segTop);
    bottom = Math.min(bottom, segBottom);
  }
  runs.push(run);
  if (runs.length === 1) return [part];
  return runs.map((centerline, k) => ({ ...part, id: `${part.id}:run${k}`, centerline }));
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

/** Stone steps for each flight: one block per riser, standing on the graded ground. */
export function stairStructures(terrain: CityTerrain): StructureMassing[] {
  const parts: StructureMassing[] = [];
  (terrain.roads?.stairs ?? []).forEach((flight, f) => {
    const half = flight.widthMeters / 2;
    for (let i = 1; i < flight.centerline.length; i++) {
      const a = flight.centerline[i - 1],
        b = flight.centerline[i];
      const za = flight.elevations[i - 1],
        zb = flight.elevations[i];
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) continue;
      const nx = -dy / length,
        ny = dx / length;
      const steps = Math.max(1, Math.ceil(Math.abs(zb - za) / STAIR_RISER_METERS));
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps,
          t1 = (k + 1) / steps;
        const p0: Point = [a[0] + dx * t0, a[1] + dy * t0],
          p1: Point = [a[0] + dx * t1, a[1] + dy * t1];
        // Each tread is level at the height reached on the way up across it.
        const top = Math.max(za + (zb - za) * t0, za + (zb - za) * t1);
        const footprint: Point[] = [
          [p0[0] + nx * half, p0[1] + ny * half],
          [p1[0] + nx * half, p1[1] + ny * half],
          [p1[0] - nx * half, p1[1] - ny * half],
          [p0[0] - nx * half, p0[1] - ny * half]
        ];
        const bottom = Math.min(...footprint.map(terrain.heightAt), top) - 0.3;
        parts.push({
          id: `stairs:${f}:${i}:${k}`,
          kind: "landmark",
          material: "stone",
          footprint: polygonArea(footprint) < 0 ? [...footprint].reverse() : footprint,
          baseElevationMeters: bottom,
          heightMeters: top - bottom,
          roof: "flat",
          parapet: "none",
          parapetMeters: 0,
          parapetWidthMeters: 0,
          spire: false
        });
      }
    }
  });
  return parts;
}
