import { ribbonSidePoints } from "../../city3d/core/structureGeometry";
import type { BuildingLot } from "../generators/buildingLots.types";
import { polygonArea } from "../generators/geom";
import { STAIR_RISER_METERS } from "../generators/roadGrading";
import type { CityTerrain } from "../generators/terrainElevation";
import { BRIDGE_WATER_CLEARANCE_METERS } from "../generators/terrainField/constants";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { Point } from "../types/document";

/** The building a part belongs to, when several parts make one building (`temple:<element>:<part>`). */
function multipartBuilding(id: string): string | null {
  return /^temple:[^:]+:/.exec(id)?.[0] ?? null;
}

/** Horizontal building floors and vertical plinths absorb the terrain, never tilt buildings. */
export function groundStructures(parts: StructureMassing[], terrain: CityTerrain): StructureMassing[] {
  if (!terrain.relief) return parts;
  // A bastioned ditch is already at its bank in the scene frame. Adding the cell
  // surface again lifts that water, and a plinth would follow the outer ring.
  const skipped = (part: StructureMassing) =>
    !!part.sections || part.id.startsWith("fort-site:") || part.id.includes(":krak:") || part.id.includes("ditch-");
  // A temple is one building in many parts: all stand on one floor, the highest any of them needs.
  const buildingLevels = new Map<string, number>();
  for (const part of parts) {
    const building = multipartBuilding(part.id);
    const ring = part.footprint ?? part.centerline ?? [];
    if (!building || skipped(part) || !ring.length) continue;
    buildingLevels.set(building, Math.max(buildingLevels.get(building) ?? -Infinity, terrain.foundationAt(ring)));
  }
  return parts.flatMap(whole => (curtainFollowsGround(whole) ? [slopeCurtain(whole, terrain)] : groundPart(whole)));

  function groundPart(part: StructureMassing): StructureMassing[] {
    if (skipped(part)) return [part];
    const ring = part.footprint ?? part.centerline ?? [];
    if (!ring.length) return [part];
    const building = multipartBuilding(part.id);
    let level = (building ? buildingLevels.get(building) : undefined) ?? terrain.foundationAt(ring);
    if (part.kind === "bridge" && terrain.waterAt) {
      const ends = [ring[0], ring[ring.length - 1]];
      let water = Number.NEGATIVE_INFINITY;
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i];
        const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
        for (let j = 0; j <= steps; j++) {
          const surface = terrain.waterAt([a[0] + ((b[0] - a[0]) * j) / steps, a[1] + ((b[1] - a[1]) * j) / steps]);
          if (surface !== null) water = Math.max(water, surface);
        }
      }
      const banks = Math.max(terrain.heightAt(ends[0]), terrain.heightAt(ends[1]));
      level = Math.max(banks, Number.isFinite(water) ? water + BRIDGE_WATER_CLEARANCE_METERS : banks);
    }
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

/** Sample narrow terrain changes even when the two ends and midpoint happen to be level. */
const WALL_SAMPLE_METERS = 1;
/** A 1:2 rise spreads terrace transitions into continuous inclined wall walks. */
const WALL_WALK_MAX_GRADE = 0.5;
const WALL_FOOTING_DEPTH_METERS = 0.3;
const WALL_CLEARANCE_METERS = 0.2;

/** Town and castle curtains follow relief; authored fortress sections keep their own geometry. */
function curtainFollowsGround(part: StructureMassing): boolean {
  return (
    part.kind === "wall" &&
    !part.sections &&
    !part.footprint &&
    !!part.centerline &&
    part.centerline.length >= 2 &&
    !!part.widthMeters &&
    !part.id.startsWith("fort-site:") &&
    !part.id.includes(":krak:")
  );
}

/**
 * Keep a full defensive height above both sides of the ribbon, including mitered corners.
 * The walk is a continuous grade envelope above the terrain; the footing extends below it
 * independently so raising the walk beside a terrace cannot leave a floating wall.
 */
function slopeCurtain(part: StructureMassing, terrain: CityTerrain): StructureMassing {
  const line = part.centerline;
  if (!line) return part;
  const originalSide = ribbonSidePoints(line, 1);
  if (!originalSide) return part;
  const originalOffsets = line.map(
    (point, i): Point => [
      originalSide[i % originalSide.length][0] - point[0],
      originalSide[i % originalSide.length][1] - point[1]
    ]
  );
  const centerline: Point[] = [[...line[0]]];
  const ribbonOffsets: Point[] = [[...originalOffsets[0]]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-4) continue;
    const steps = Math.ceil(length / WALL_SAMPLE_METERS);
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      centerline.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      const u = originalOffsets[i - 1],
        v = originalOffsets[i];
      ribbonOffsets.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]);
    }
  }
  const left = ribbonSidePoints(centerline, part.widthMeters! / 2, ribbonOffsets);
  const right = ribbonSidePoints(centerline, -part.widthMeters! / 2, ribbonOffsets);
  if (!left || !right) return part;
  const band = (a: Point, b: Point) => {
    const samples = Array.from({ length: 5 }, (_, i) =>
      terrain.heightAt([a[0] + ((b[0] - a[0]) * i) / 4, a[1] + ((b[1] - a[1]) * i) / 4])
    );
    return { low: Math.min(...samples), high: Math.max(...samples) };
  };
  const bands = centerline.map((_, i) => band(left[i % left.length], right[i % right.length]));
  const lows = bands.map(value => value.low);
  const highs = bands.map(value => value.high);
  // Include each span's interior, and lift both ends above any intervening crest.
  for (let i = 1; i < centerline.length; i++) {
    const a = (i - 1) % left.length,
      b = i % left.length;
    const mid = band(
      [(left[a][0] + left[b][0]) / 2, (left[a][1] + left[b][1]) / 2],
      [(right[a][0] + right[b][0]) / 2, (right[a][1] + right[b][1]) / 2]
    );
    const high = Math.max(bands[i - 1].high, bands[i].high, mid.high);
    highs[i - 1] = Math.max(highs[i - 1], high);
    highs[i] = Math.max(highs[i], high);
    lows[i - 1] = Math.min(lows[i - 1], mid.low);
    lows[i] = Math.min(lows[i], mid.low);
  }
  const closed = left.length < centerline.length;
  // Two circuits propagate the grade envelope across the closure as well as along an open run.
  for (let pass = 0; pass < (closed ? 2 : 1); pass++) {
    if (closed) highs[0] = highs[highs.length - 1] = Math.max(highs[0], highs[highs.length - 1]);
    for (let i = 1; i < highs.length; i++) {
      const distance = Math.hypot(centerline[i][0] - centerline[i - 1][0], centerline[i][1] - centerline[i - 1][1]);
      highs[i] = Math.max(highs[i], highs[i - 1] - WALL_WALK_MAX_GRADE * distance);
    }
    for (let i = highs.length - 2; i >= 0; i--) {
      const distance = Math.hypot(centerline[i + 1][0] - centerline[i][0], centerline[i + 1][1] - centerline[i][1]);
      highs[i] = Math.max(highs[i], highs[i + 1] - WALL_WALK_MAX_GRADE * distance);
    }
  }
  if (closed) {
    highs[0] = highs[highs.length - 1] = Math.max(highs[0], highs[highs.length - 1]);
    lows[0] = lows[lows.length - 1] = Math.min(lows[0], lows[lows.length - 1]);
  }
  const baseElevationsMeters = lows.map(level => level + part.baseElevationMeters - WALL_FOOTING_DEPTH_METERS);
  const topElevationsMeters = highs.map(
    level => level + part.baseElevationMeters + part.heightMeters + WALL_CLEARANCE_METERS
  );
  return {
    ...part,
    centerline,
    ribbonOffsets,
    baseElevationsMeters,
    topElevationsMeters,
    baseElevationMeters: Math.max(...highs) + part.baseElevationMeters
  };
}

export function lotFoundations(lots: readonly BuildingLot[], terrain: CityTerrain): StructureMassing[] {
  if (!terrain.relief) return [];
  if (terrain.field) return lots.flatMap((lot, i) => fieldLotPad(lot, i, terrain));
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

const PAD_EXPAND_METERS = 0.35;
const PAD_THICKNESS_METERS = 0.12;
const SKIRT_GAP_METERS = 0.15;

/** A horizontal pad and a skirt down to the height field. The skirt hides the seam without cutting the mesh. */
function fieldLotPad(lot: BuildingLot, index: number, terrain: CityTerrain): StructureMassing[] {
  if (!lot.massing || lot.landmark || lot.polygon.length < 3) return [];
  const ring = lot.polygon as Point[];
  const level = terrain.foundationAt(ring);
  const area = polygonArea(ring);
  const sign = area >= 0 ? 1 : -1;
  const expanded = ring.map((point, i) => {
    const prev = ring[(i + ring.length - 1) % ring.length];
    const next = ring[(i + 1) % ring.length];
    const left = outward(prev, point, sign);
    const right = outward(point, next, sign);
    let ox = left[0] + right[0];
    let oy = left[1] + right[1];
    const length = Math.hypot(ox, oy) || 1;
    ox /= length;
    oy /= length;
    return [point[0] + ox * PAD_EXPAND_METERS, point[1] + oy * PAD_EXPAND_METERS] as Point;
  });
  const parts: StructureMassing[] = [
    {
      id: `lot-pad:${lot.id ?? index}`,
      kind: "landmark",
      material: "stone",
      footprint: expanded,
      baseElevationMeters: level,
      heightMeters: PAD_THICKNESS_METERS,
      roof: "flat",
      parapet: "none",
      parapetMeters: 0,
      parapetWidthMeters: 0,
      spire: false
    }
  ];
  expanded.forEach((a, i) => {
    const b = expanded[(i + 1) % expanded.length];
    const groundA = terrain.heightAt(a);
    const groundB = terrain.heightAt(b);
    if (Math.max(Math.abs(groundA - level), Math.abs(groundB - level)) <= SKIRT_GAP_METERS) return;
    const normal = outward(a, b, sign);
    const aOut: Point = [a[0] + normal[0] * 0.2, a[1] + normal[1] * 0.2];
    const bOut: Point = [b[0] + normal[0] * 0.2, b[1] + normal[1] * 0.2];
    const footprint = [a, b, bOut, aOut];
    const groundOutA = terrain.heightAt(aOut);
    const groundOutB = terrain.heightAt(bOut);
    parts.push({
      id: `lot-skirt:${lot.id ?? index}:${i}`,
      kind: "wall",
      material: "stone",
      footprint,
      sections: [
        { footprint, elevationsMeters: [groundA, groundB, groundOutB, groundOutA] },
        { footprint, elevationsMeters: [level, level, level, level] }
      ],
      baseElevationMeters: Math.min(level, groundA, groundB, groundOutA, groundOutB),
      heightMeters:
        Math.max(level, groundA, groundB, groundOutA, groundOutB) -
        Math.min(level, groundA, groundB, groundOutA, groundOutB),
      roof: "none",
      parapet: "none",
      parapetMeters: 0,
      parapetWidthMeters: 0,
      spire: false
    });
  });
  return parts;
}

function outward(a: Point, b: Point, sign: number): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  return [(dy / length) * sign, (-dx / length) * sign];
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
