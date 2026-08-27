// BurgSiteDescriptor — the FMG → City Generator input contract.
//
// This is a decoupled TYPE-ONLY copy of the public shape produced by
// src/services/burgSiteDescriptor.ts in this same repo. Keeping a copy here means
// the city page imports nothing from the world map's module graph. Keep in sync
// with docs/plan/city-generator/v2/13-fmg-site-input.md; bump DESCRIPTOR_VERSION
// (and the FMG service) when a field changes meaning.

export const DESCRIPTOR_VERSION = 1;

export type BurgSiteArchetype = "harbor" | "riverCrossing" | "hillTop" | "crossroads";

export interface BurgSiteRiver {
  riverId: number;
  name: string;
  type: string;
  /** True physical width (m) at the closest approach to the town center. */
  widthMeters: number;
  /** Downstream flow azimuth at the closest approach (compass degrees). */
  axisAzimuthDeg: number;
  /** Unsigned distance (m) from the town center to the (bank-snapped) centerline. */
  offsetMeters: number;
  /** offsetMeters / cityRadiusMeters. 0 → bisects the town, >= 1 → outside the core. */
  offsetRatio: number;
  /** Which bank the town center sits on, looking downstream. */
  cityBank: "left" | "right";
  /** True when the centerline passes inside the city radius. */
  crossesSite: boolean;
  /** FMG world truth: the river flows through the burg's own cell. */
  throughBurgCell: boolean;
  /** Raw map-geometry distance (m) before bank snapping. */
  rawOffsetMeters: number;
  /** True when the centerline was rigidly translated so the town sits on the bank. */
  snappedToBank: boolean;
  /** Centerline polyline(s) clipped to the window, upstream → downstream, local meters. */
  segments: { points: [number, number][]; widthsMeters: number[] }[];
}

export interface BurgSiteRoadEntry {
  routeId: number;
  /** "roads" | "trails" | "searoutes". */
  group: string;
  name?: string;
  /** Azimuth where the leg crosses the city radius — a gate-candidate direction. */
  entryAzimuthDeg: number;
  /** False when the route terminates inside the city radius. */
  reachesEdge: boolean;
  /** Leg polyline from the town center outward, clipped to the window, local meters. */
  path: [number, number][];
  nextBurg: { id: number; name: string; distanceMeters: number } | null;
}

export interface BurgSiteWaterbody {
  kind: "ocean" | "lake";
  name?: string;
  group?: string;
  isPort: boolean;
  /** Azimuth from the town center toward the adjacent water. */
  shoreAzimuthDeg: number;
  /** Shoreline polylines clipped to the window, local meters. Water on the haven side. */
  shoreline: [number, number][][];
}

export interface BurgSiteTerrain {
  elevationMeters: number;
  downhillAzimuthDeg: number | null;
  gradePercent: number;
  heightfield: {
    size: number;
    spacingMeters: number;
    elevationsMeters: number[];
    waterMask: (0 | 1)[];
  };
}

export interface BurgSiteDescriptor {
  version: 1;
  burg: {
    id: number;
    name: string;
    group: string;
    type: string;
    seed: string;
    population: number;
    capital: boolean;
    port: boolean;
    citadel: boolean;
    plaza: boolean;
    walls: boolean;
    temple: boolean;
    shanty: boolean;
  };
  frame: {
    originMapUnits: [number, number];
    metersPerMapUnit: number;
    extentMeters: number;
    cityRadiusMeters: number;
  };
  climate: { temperatureC: number; biomeId: number };
  terrain: BurgSiteTerrain;
  rivers: BurgSiteRiver[];
  waterbody: BurgSiteWaterbody | null;
  roads: BurgSiteRoadEntry[];
  suggestedGates: number;
  suggestedArchetype: BurgSiteArchetype;
}
