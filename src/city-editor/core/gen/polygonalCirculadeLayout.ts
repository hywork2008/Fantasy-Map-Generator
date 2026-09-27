// Polygonal concentric circulade (Bram-style) layout generator.
// Models Bram's 3-tier concentric core (~240m diameter) using an N-sided polygon (e.g. 16-gon)
// for clean straight-line parcel subdivision and seamless joining with peripheral Voronoi blocks.

import { makeRng } from "./prng";
import type { Point, Precinct } from "./types";

export interface PolygonalRing {
  tier: number;
  radius: number;
  vertices: Point[];
}

export interface PolygonalCirculadePlan {
  hub: Point;
  throughAngle: number;
  numFacets: number; // e.g. 16
  coreRadius: number; // ~120m
  plaza: Precinct;
  temple: Precinct | null;
  rings: PolygonalRing[];
  ringRoads: Point[][];
  radialRoads: Point[][];
  throughRoad: Point[];
  recommendedGates: Point[];
  outerBoundary: Point[]; // Loop of outer polygon vertices
  outerAnchorNodes: Point[]; // Vertices on the outer boundary for Voronoi stitching
}

/** Nominal Bram core on a Tiny-or-larger town (diameter 240 m). */
export const BRAM_NOMINAL_CORE_RADIUS_METERS = 120;
/** Walled urban radius of a Tiny map (`600 × 0.33 × 0.92`). The 120 m core fits it. */
export const BRAM_REFERENCE_URBAN_RADIUS_METERS = 600 * 0.33 * 0.92;
/** Mesh roads stay this far inside the outer ring so they do not enter the core. */
export const BRAM_ROAD_BAN_INSET_METERS = 2;
/** Gate spokes end just outside the outer ring. */
export const BRAM_SPOKE_OUTSET_METERS = 3;
/** Peripheral blocks stay clear of the outer ring road. */
export const BRAM_PERIPHERY_BUFFER_METERS = 3.5;

/** Built-up radius: the full city radius, pulled in slightly when the town is walled. */
export function urbanDiskRadiusMeters(cityRadiusMeters: number, walled: boolean): number {
  return cityRadiusMeters * (walled ? 0.92 : 1);
}

/**
 * Bram core radius. Tiny and larger maps keep 120 m. Smaller maps (Micro, 300 m)
 * shrink the core by the same ratio as the urban disk, leaving a rim wide enough
 * for the gate roads to reach the wall.
 */
export function bramCoreRadiusMeters(urbanRadiusMeters: number): number {
  if (!Number.isFinite(urbanRadiusMeters) || urbanRadiusMeters <= 0) return BRAM_NOMINAL_CORE_RADIUS_METERS;
  const fitted = urbanRadiusMeters * (BRAM_NOMINAL_CORE_RADIUS_METERS / BRAM_REFERENCE_URBAN_RADIUS_METERS);
  if (fitted >= BRAM_NOMINAL_CORE_RADIUS_METERS - 1e-6) return BRAM_NOMINAL_CORE_RADIUS_METERS;
  return fitted;
}

export function bramCoreRadiusForCity(cityRadiusMeters: number, walled: boolean): number {
  return bramCoreRadiusMeters(urbanDiskRadiusMeters(cityRadiusMeters, walled));
}

export function bramRoadBanRadiusMeters(coreRadiusMeters: number): number {
  return coreRadiusMeters - BRAM_ROAD_BAN_INSET_METERS;
}

export function bramSpokeRadiusMeters(coreRadiusMeters: number): number {
  return coreRadiusMeters + BRAM_SPOKE_OUTSET_METERS;
}

export function bramPeripheryBufferMeters(coreRadiusMeters: number): number {
  return coreRadiusMeters + BRAM_PERIPHERY_BUFFER_METERS;
}

/**
 * Plan the 3-tier polygonal circulade core layout (~240m diameter).
 */
export function planPolygonalCirculadeLayout(
  hub: Point,
  seed: string,
  targetRadiusMeters = BRAM_NOMINAL_CORE_RADIUS_METERS,
  hasTemple = true,
  numFacets = 16
): PolygonalCirculadePlan {
  const rng = makeRng(`${seed}:polygonal-circulade-layout`);

  // Through-axis tilt (roughly north-south with slight organic jitter)
  const throughAngle = Math.PI * 0.5 + rng.range(-0.12, 0.12) * Math.PI;
  const cosA = Math.cos(throughAngle);
  const sinA = Math.sin(throughAngle);
  const along: Point = [cosA, sinA];
  const across: Point = [-sinA, cosA];

  const corner = (x: number, y: number): Point => [
    hub[0] + along[0] * y + across[0] * x,
    hub[1] + along[1] * y + across[0] * x
  ];

  // 1. Core Plaza (small 16-20m at the nominal 120m core; scaled with the core)
  const scale = targetRadiusMeters / BRAM_NOMINAL_CORE_RADIUS_METERS;
  const plazaHalfW = rng.range(8, 10) * scale;
  const plazaHalfH = rng.range(8, 10) * scale;
  const plazaPolygon: Point[] = [
    corner(-plazaHalfW, -plazaHalfH),
    corner(plazaHalfW, -plazaHalfH),
    corner(plazaHalfW, plazaHalfH),
    corner(-plazaHalfW, plazaHalfH)
  ];

  const plaza: Precinct = {
    kind: "plaza",
    polygon: plazaPolygon,
    anchor: hub,
    radiusMeters: Math.max(plazaHalfW, plazaHalfH),
    cellIds: []
  };

  // 2. Adjacent Temple (Church) along the across axis
  let temple: Precinct | null = null;
  const templeHalfL = 13 * scale;
  const templeHalfW = 8 * scale;
  if (hasTemple) {
    const side = rng() < 0.5 ? 1 : -1;
    const centerAcross = side * (14 * scale + templeHalfW);
    const templeAnchor: Point = corner(centerAcross, 0);
    const templePoly: Point[] = [
      corner(centerAcross - side * templeHalfW, -templeHalfL),
      corner(centerAcross + side * templeHalfW, -templeHalfL),
      corner(centerAcross + side * templeHalfW, templeHalfL),
      corner(centerAcross - side * templeHalfW, templeHalfL)
    ];
    temple = {
      kind: "temple",
      polygon: templePoly,
      anchor: templeAnchor,
      radiusMeters: 16 * scale,
      cellIds: [],
      rotation: throughAngle
    };
  }

  // 3. 3-tier polygonal concentric rings
  // Standard Bram scale: total radius ~120m (diameter 240m)
  // Ring 1: R ~ 48m
  // Ring 2: R ~ 84m
  // Ring 3: R ~ 120m (Outer boundary)
  const ringRadii = [48 * scale, 84 * scale, BRAM_NOMINAL_CORE_RADIUS_METERS * scale];

  const rings: PolygonalRing[] = [];
  const ringRoads: Point[][] = [];

  for (let tier = 0; tier < ringRadii.length; tier++) {
    const r = ringRadii[tier];
    const vertices: Point[] = [];
    for (let i = 0; i < numFacets; i++) {
      const angle = throughAngle + (i / numFacets) * Math.PI * 2;
      // Slight organic radius modulation (1-2%) per vertex, seeded
      const jitter = 1.0 + rng.range(-0.015, 0.015);
      const vx = hub[0] + Math.cos(angle) * r * jitter;
      const vy = hub[1] + Math.sin(angle) * r * jitter;
      vertices.push([vx, vy]);
    }
    rings.push({ tier: tier + 1, radius: r, vertices });
    // Closed road loop
    ringRoads.push([...vertices, vertices[0]]);
  }

  const outerRing = rings[rings.length - 1];
  const outerBoundary = [...outerRing.vertices];
  const outerAnchorNodes = outerRing.vertices;

  // 4. Primary through-road (Opposed Gates -> Plaza -> Opposed Gates)
  // In our angular convention:
  // i = 0 corresponds to angle = throughAngle (North exit)
  // i = numFacets / 2 corresponds to angle = throughAngle + PI (South exit)
  const northExit = outerRing.vertices[0];
  const southExit = outerRing.vertices[Math.floor(numFacets / 2)];
  const throughRoad: Point[] = [southExit, hub, northExit];

  // 5. Radial venelles (alleys connecting ring 1 to outer ring 3)
  // In a 16-gon:
  // i=0 is North, i=8 is South (through axis)
  // i=4 is East, i=12 is West (lateral axis, where temple is)
  // Diagonal spokes: i=2, 6, 10, 14
  const radialRoads: Point[][] = [];
  const spokeIndices = [
    Math.floor(numFacets * 0.125), // ~45 deg
    Math.floor(numFacets * 0.375), // ~135 deg
    Math.floor(numFacets * 0.625), // ~225 deg
    Math.floor(numFacets * 0.875) // ~315 deg
  ];

  for (const idx of spokeIndices) {
    const pts: Point[] = [];
    for (const ring of rings) {
      pts.push(ring.vertices[idx]);
    }
    radialRoads.push(pts);
  }

  // Recommended gates on the core boundary
  const recommendedGates: Point[] = [southExit, northExit];

  return {
    hub,
    throughAngle,
    numFacets,
    coreRadius: targetRadiusMeters,
    plaza,
    temple,
    rings,
    ringRoads,
    radialRoads,
    throughRoad,
    recommendedGates,
    outerBoundary,
    outerAnchorNodes
  };
}
