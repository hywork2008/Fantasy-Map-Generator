import type { BridgeTransport } from "../utils/bridgeCrossingPolicy";
import type { RelationKey } from "../utils/diplomacyRelations";
import type { FixedBurgCrossings } from "../utils/fixedBurgCrossings";
import type { RequiredSiteBounds } from "../utils/requiredSiteBounds";
import type { RegionalContext } from "./cityRegional";
import type { UrbanMorphologyProfile } from "./urbanMorphology";

/**
 * Burg site descriptor — the machine-readable "site survey" of a burg's local
 * geography, exported for external settlement generators (the in-house City
 * Generator, docs/plan/city-generator/v2/13-fmg-site-input.md).
 *
 * Everything is expressed in a LOCAL frame:
 * - origin = the burg position (burg.x/y in map units)
 * - unit = meters
 * - +X = east, +Y = north (FMG map Y grows southward, so it is flipped here)
 * - azimuths are compass degrees: 0 = north, 90 = east, clockwise
 *
 * The descriptor answers the questions a city generator cannot answer from a
 * single "river: yes/no" flag: WHERE the river runs relative to the town
 * center (5:5 / 7:3 / 10:0 chord position), in WHICH direction it flows, how
 * WIDE it is, and at WHICH azimuths the highways enter the town (= gate
 * candidates), including where each highway leads.
 */

export interface BurgSiteRiver {
  /** Estimated local water depth, not a surveyed navigation depth. */
  depthMeters?: number | null;
  /** FMG estimate at the burg cell, or nearest sampled river cell. */
  hydrology?: import("../types/models").RiverCellHydrology & { cellId: number };
  navigationVessel?: import("../utils/riverCrossing.types").NavigationVessel;
  crossing?: import("../utils/riverCrossing.types").RiverCrossingPlan;
  riverId: number;
  name: string;
  type: string;
  /** True physical width (m) at the closest approach to the town center (empirical FMG width model, not the exaggerated drawn width). */
  widthMeters: number;
  /** Downstream flow azimuth at the closest approach. */
  axisAzimuthDeg: number;
  /** Unsigned distance (m) from the town center to the (possibly bank-snapped) centerline. */
  offsetMeters: number;
  /**
   * offsetMeters / cityRadiusMeters. 0 → the river bisects the town (5:5),
   * ~0.4 → roughly 7:3, >= 1 → tangent or outside the town core (10:0).
   */
  offsetRatio: number;
  /** Which bank the town center sits on, looking downstream. */
  cityBank: "left" | "right";
  /** True when the centerline passes inside the city radius. */
  crossesSite: boolean;
  /** FMG world-model truth: the river flows through the burg's own cell ("the town is on this river"). */
  throughBurgCell: boolean;
  /** Physical map-geometry distance; equal to offsetMeters for new exports. */
  rawOffsetMeters: number;
  /** Legacy flag retained for saved descriptors. New exports never move only the river. */
  snappedToBank: boolean;
  /**
   * The real bank does not fit the 4,500 m display budget.
   * City Editor must not invent a nearer river for this record.
   */
  frontage?: "beyond-budget";
  /**
   * Centerline polyline(s) clipped to the extent box, upstream → downstream,
   * local meters. widthsMeters[i] is the true width at points[i].
   */
  segments: { points: [number, number][]; widthsMeters: number[] }[];
  /** FMG's direct downstream/mainstem river, if this is a tributary. */
  parentRiverId: number | null;
  /** Physical water edges, clipped to the extent box, local meters. */
  leftBankSegments: [number, number][][];
  rightBankSegments: [number, number][][];
  /** FMG cell elevations a few cells up and down the river from the burg, in `segments` order.
   * The local heightfield is one cell wide, so City Editor orients its centreline from this. */
  flowElevation?: { upstreamMeters: number; downstreamMeters: number };
  /** Regional downstream context; it never expands the urban drawing window. */
  downstream: {
    terminal: "ocean" | "lake" | "mapEdge" | "confluence" | "unknown";
    distanceMeters: number;
    bearingDeg: number;
  };
}

export interface BurgSiteRoadNextBurg {
  id: number;
  name: string;
  distanceMeters: number;
  stateId?: number;
  stateName?: string;
  isDomestic?: boolean;
  diplomacyRelation?: "domestic" | RelationKey;
  population?: number;
  scale?: "hamlet" | "village" | "town" | "city";
  role?: "generic" | "granary" | "market" | "fortress" | "capital";
  capital?: boolean;
  walls?: boolean;
  citadel?: boolean;
  treasury?: number;
  wealth?: number;
}

export interface BurgSiteRoadEntry {
  /** World connection identity, independent of display clipping. */
  approachId?: string;
  sharedCrossingId?: number;
  sharedRouteIds?: number[];
  nextBurgs?: BurgSiteRoadNextBurg[];
  /** Full shared crossing and far-bank branch, kept separate from the common CE entrance. */
  sharedBranches?: { routeId: number; path: [number, number][]; nextBurg: BurgSiteRoadNextBurg | null }[];
  routeId: number;
  /** FMG route group: "roads" | "trails" | "searoutes". */
  group: string;
  name?: string;
  /** Azimuth at which this leg crosses the city radius — a gate candidate direction. */
  entryAzimuthDeg: number;
  /** False when the route terminates inside the city radius (dead-end leg). */
  reachesEdge: boolean;
  /** Leg polyline from the town center outward, clipped to the extent box, local meters. */
  path: [number, number][];
  /** First other burg encountered along this leg (signpost destination), if any. */
  nextBurg: BurgSiteRoadNextBurg | null;
  /** Route.traffic. Absent when the route has never carried a recorded departure. */
  traffic?: number;
  /** 0..1 among land routes that have traffic. */
  trafficRank?: number;
  /**
   * This approach's measured traffic from the Economy approach ledger
   * (docs/plan/approach-traffic-observatory.md §4, §7.3). `share` is its part of the town's
   * cargo slots plus pass-through departures, 0..1. Read by CE only with
   * `approachGrowthSource: "traffic"`.
   */
  approachTraffic?: { cargoSlots: number; through: number; share: number };
}

export interface BurgSiteWaterbody {
  kind: "ocean" | "lake";
  name?: string;
  group?: string;
  isPort: boolean;
  /** Azimuth from the town center toward the adjacent water (haven) cell. */
  shoreAzimuthDeg: number;
  /** Shortest distance from the FMG burg center to the surveyed shoreline, in meters. */
  shoreDistanceMeters?: number;
  /** Shoreline polylines clipped to the extent box, local meters. Water lies on the haven side. */
  shoreline: [number, number][][];
  /** Per `shoreline` run, the side of its direction of travel that is water.
   * Lets the City Editor close secondary coast runs (a cape across a corner)
   * that never meet the town mesh. Absent in older descriptors. */
  shorelineWaterSide?: ("left" | "right")[];
}

/** FMG surface knowledge for the display frame beyond the burg's own coast. */
export interface BurgSiteRegionalSurface {
  /** Other drawn FMG features in the frame (islands, lakes), clipped to the
   * frame, largest first so nested features paint over their parents. */
  features: { kind: "land" | "water"; ring: [number, number][] }[];
  /** Frame area beyond the FMG map edge: FMG has no terrain there. */
  unknown: [number, number][][];
}

export interface BurgSiteTerrain {
  /** Elevation (m) of the burg cell. */
  elevationMeters: number;
  /** Direction of steepest descent, or null on flat/degenerate terrain. */
  downhillAzimuthDeg: number | null;
  /** Slope magnitude at the town center, percent (meters drop per 100 m). */
  gradePercent: number;
  /**
   * Coarse elevation samples across the extent (macro constraints only —
   * FMG cells are far larger than a city, so this is a low-frequency field
   * the city generator refines with its own micro-terrain noise).
   * Row-major size×size: row 0 = north edge, column 0 = west edge.
   */
  heightfield: {
    size: number;
    spacingMeters: number;
    elevationsMeters: number[];
    waterMask: (0 | 1)[];
  };
}

export type BurgSiteArchetype = "harbor" | "riverCrossing" | "hillTop" | "crossroads";

export interface BurgSiteBiome {
  id: number;
  key?: string;
  name: string;
  color: string;
  tags?: readonly string[];
}

export interface BurgSiteDescriptor {
  /** Cultivated hectares allocated to the cell's urban population; absent without land-use data. */
  farmlandAreaHectares?: number;
  urbanMorphology?: UrbanMorphologyProfile;
  burialProfile?: import("../data/burialCultures").BurialCultureProfile;
  civilization?: import("../data/civilizationTraditions").BurgCivilization;
  regionalContext?: RegionalContext;
  /** Optional physical crossing preview; not input to legacy bridge discovery. */
  fixedCrossings?: FixedBurgCrossings;
  version: 2 | 3;
  burg: {
    id: number;
    name: string;
    group: string;
    type: string;
    /** Deterministic seed shared with the watabou preview links. */
    seed: string;
    /** Absolute number of inhabitants (population points × populationRate × urbanization). */
    population: number;
    /** Required dwellings derived from the absolute population. */
    dwellings: number;
    /** Culture Lot occupancy guide (0–1) City Editor fits the houses at. */
    lotOccupancy?: number;
    capital: boolean;
    port: boolean;
    riverPlacement?: import("../types/models").Burg["riverPlacement"];
    riverSiteStatus?: import("../types/models").Burg["riverSiteStatus"];
    waterfrontCheck?: import("../types/models").Burg["waterfrontCheck"];
    /** Optional for legacy descriptors; independent of clipped water geometry. */
    waterAccess?: import("../types/burgWater").BurgWaterAccess;
    citadel: boolean;
    plaza: boolean;
    walls: boolean;
    temple: boolean;
    shanty: boolean;
    /**
     * Underground realm site (docs/plan/underground-realm-and-supernatural-areas.md §3.4/§7.5,
     * §2.1). Omitted/"surface" behaves exactly like today — City Generator has no dedicated
     * underground layout yet, so it falls back to the existing surface generation regardless of
     * this value (MVP: the map still shows a surface entrance icon, not a cavern plan).
     */
    settlementSite: "surface" | "underground";
  };
  frame: {
    regionalMode?: boolean;
    /** Burg position in FMG map units (the local origin). */
    /** Local metre bounds that frame fitting must retain. */
    requiredBounds?: RequiredSiteBounds;
    originMapUnits: [number, number];
    metersPerMapUnit: number;
    /** Side length of the square generation window centered on the origin. */
    extentMeters: number;
    /** Suggested built-up radius derived from population (walled-town density model). */
    cityRadiusMeters: number;
  };
  climate: {
    temperatureC: number;
    biomeId: number;
    biomeKey?: string;
    biomeName?: string;
    biomeColor?: string;
    /**
     * Compass bearing the wind blows toward: 0 = north, clockwise. From `windRose` (the
     * power-weighted mean wind at the burg) when it is available, else the latitude belt.
     * Absent when the map has no usable wind belts or latitude.
     */
    prevailingWindDeg?: number;
    /**
     * Monthly 8-sector wind rose at the burg's grid cell (docs/plan/wind-aspect-climate-variability.md
     * §5.8). Sectors N, NE, … NW are directions the wind blows FROM. Absent in older descriptors.
     */
    windRose?: {
      sectors: string[];
      /** 12 entries, January first. */
      monthly: { frequency: number[]; meanSpeed: number[]; calmFraction: number }[];
      annual: { frequency: number[]; meanSpeed: number[]; calmFraction: number };
      /** Bearing the wind blows TOWARD carrying most wind power over the year. */
      prevailingTowardDeg: number;
    };
  };
  biome?: BurgSiteBiome;
  terrain: BurgSiteTerrain;
  /** Routine supported crossing allowance, derived from historical technology. */
  transport?: BridgeTransport;
  /** Historical period / era from FMG options (default: "ageOfExploration"). */
  historicalPeriod?: string;
  rivers: BurgSiteRiver[];
  waterbody: BurgSiteWaterbody | null;
  /** Absent in older descriptors, which then know nothing beyond the haven coast. */
  regionalSurface?: BurgSiteRegionalSurface;
  roads: BurgSiteRoadEntry[];
  /** Count of land route legs — the natural number of town gates. */
  suggestedGates: number;
  suggestedArchetype: BurgSiteArchetype;
  /** Present when the Economy extension has registered a profile builder. */
  economy?: import("../services/burgSiteEconomy").BurgSiteEconomy;
}
