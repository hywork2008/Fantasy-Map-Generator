import { worldContext } from "../context/worldContext";
import { STANDARD_BIOME_DEFINITIONS } from "../data/biomeCatalog";
import { getConstrainedNetworkConnections } from "../generators/constrainedLandNetwork";
import { Rivers } from "../generators/river-generator";
import { getStateBridgeSkewLimit } from "../generators/technologyProgress";
import { useOptionsState } from "../store/optionsState";
import type { RegionalContext } from "../types/cityRegional";
import { regionalRevision } from "../types/cityRegional";
import type { Burg, River, Route } from "../types/models";
import { findCell, minmax, rn } from "../utils";
import type { BridgeTransport } from "../utils/bridgeCrossingPolicy";
import { bridgeCrossingLimitForPeriod } from "../utils/bridgeCrossingPolicy";
import type { RelationKey } from "../utils/diplomacyRelations";
import {
  FIXED_SITE_CROSSING_BUDGETS,
  type FixedBurgCrossings,
  validFixedBurgCrossings
} from "../utils/fixedBurgCrossings";
import { heightToMeters as heightToMetersRaw, normalizeHeightExponent } from "../utils/height";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import {
  isRequiredSiteBounds,
  POPULATION_WINDOW_MAX_M,
  populationWindowMeters,
  type RequiredSiteBounds,
  requiredSiteExtent
} from "../utils/requiredSiteBounds";
import { planRiverCrossing, RIVER_CARGO_VESSEL, SEA_SAILING_VESSEL } from "../utils/riverCrossing";
import { getUrbanDwellings } from "../utils/urbanDwellings";
import { updateBurgWaterAccess } from "./burgWaterAccess";
import {
  convergedBurgCrossings,
  convergedBurgFacilities,
  ensureConvergingWorldRiverRoads
} from "./convergingWorldRiverRoads";
import { exportFixedBurgCrossings } from "./fixedBurgCrossings";
import { RegionalRiverGeometry, regionalRiverGeometry } from "./regionalRiverGeometry";
import { footprintTouchesWater } from "./riverPhysicalGeometry";
import { SettlementGeometrySession } from "./settlementGeometrySession";
import {
  nearestSettlementBank,
  SETTLEMENT_RIVER_SETTINGS,
  settlementRadiusMeters,
  settlementRiverGeometry
} from "./settlementRiverSite";
import { getWorldLandConnectionCurrent } from "./worldLandConnectionRuntime";
import { worldRiverOccupiedBounds } from "./worldRiverGeometry";

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
  navigationVessel?: import("../utils/riverCrossing").NavigationVessel;
  crossing?: import("../utils/riverCrossing").RiverCrossingPlan;
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
}

export interface BurgSiteWaterbody {
  kind: "ocean" | "lake";
  name?: string;
  group?: string;
  isPort: boolean;
  /** Azimuth from the town center toward the adjacent water (haven) cell. */
  shoreAzimuthDeg: number;
  /** Shoreline polylines clipped to the extent box, local meters. Water lies on the haven side. */
  shoreline: [number, number][][];
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
    capital: boolean;
    port: boolean;
    riverPlacement?: import("../types/models").Burg["riverPlacement"];
    riverSiteStatus?: import("../types/models").Burg["riverSiteStatus"];
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
  };
  biome?: BurgSiteBiome;
  terrain: BurgSiteTerrain;
  /** Routine supported crossing allowance, derived from historical technology. */
  transport?: BridgeTransport;
  /** Historical period / era from FMG options (default: "ageOfExploration"). */
  historicalPeriod?: string;
  rivers: BurgSiteRiver[];
  waterbody: BurgSiteWaterbody | null;
  roads: BurgSiteRoadEntry[];
  /** Count of land route legs — the natural number of town gates. */
  suggestedGates: number;
  suggestedArchetype: BurgSiteArchetype;
}

const DESCRIPTOR_VERSION = 3;
const HEIGHTFIELD_SIZE = 17;
/** Visible water past the near bank. A wide channel does not also require its centreline. */
const FRONTAGE_WATER_MARGIN_M = 40;
const FRONTAGE_FRAME_PAD_M = 20;
/** Matches `extractWideChannels`: a river port wider than this fraction of the radius is a channel. */
const PORT_CHANNEL_RADIUS_RATIO = 0.4;
/** Minimum believable river width for bridge-scale rendering. */
const RIVER_MIN_WIDTH_M = 2;
/** Relief (m) of the town center above its surroundings that suggests a hilltop site. */
const HILLTOP_RELIEF_M = 30;

type WeightedPoint = { x: number; y: number; w: number };

export function getBurgSiteDescriptor(
  burgId: number,
  frameRequirements?: {
    requiredBounds: RequiredSiteBounds;
    maxExtentMeters: number;
    fixedCrossings?: FixedBurgCrossings;
  }
): BurgSiteDescriptor | null {
  const { pack } = worldContext;
  const burg = pack.burgs?.[burgId];
  if (!burg?.i || burg.removed) return null;

  ensureConvergingWorldRiverRoads(worldContext, useOptionsState.getState().distanceUnit);
  const metersPerMapUnit = getMetersPerMapUnit();
  const population = rn((burg.population ?? 0) * worldContext.populationRate * worldContext.urbanization);
  const cityRadiusMeters = getCityRadiusMeters(population);
  const toLocal = (x: number, y: number): [number, number] => [
    (x - burg.x) * metersPerMapUnit,
    (burg.y - y) * metersPerMapUnit
  ];
  const waterAccess = updateBurgWaterAccess(burg, pack);
  let extentMeters = populationWindowMeters(cityRadiusMeters);
  let autoBounds: RequiredSiteBounds | undefined;
  let beyondBudgetRiverId: number | null = null;
  if (frameRequirements) {
    if (
      !isRequiredSiteBounds(frameRequirements.requiredBounds) ||
      !Number.isFinite(frameRequirements.maxExtentMeters) ||
      frameRequirements.maxExtentMeters <= 0
    )
      throw new RangeError("Invalid required site bounds or frame budget");
    autoBounds = { ...frameRequirements.requiredBounds };
    extentMeters = Math.max(extentMeters, requiredSiteExtent(frameRequirements.requiredBounds));
    if (extentMeters > frameRequirements.maxExtentMeters)
      throw new RangeError("Required site frame exceeds extent budget");
  }
  if (waterAccess.river && waterAccess.riverId != null) {
    const portRiver = Boolean(burg.port) && waterAccess.port.river;
    const frontage =
      canonicalFrontageBounds(burg, waterAccess.riverId, toLocal) ??
      frontageDisplayBounds(waterAccess.riverId, toLocal, metersPerMapUnit, cityRadiusMeters, portRiver);
    if (frontage?.bounds) {
      const extra = frameRequirements?.requiredBounds;
      autoBounds = extra
        ? {
            minX: Math.min(extra.minX, frontage.bounds.minX),
            minY: Math.min(extra.minY, frontage.bounds.minY),
            maxX: Math.max(extra.maxX, frontage.bounds.maxX),
            maxY: Math.max(extra.maxY, frontage.bounds.maxY)
          }
        : frontage.bounds;
      extentMeters = Math.max(extentMeters, requiredSiteExtent(autoBounds));
      if (frameRequirements && extentMeters > frameRequirements.maxExtentMeters)
        throw new RangeError("Required river frontage exceeds extent budget");
    } else if (frontage?.beyondBudget) beyondBudgetRiverId = waterAccess.riverId;
  }
  let fixedCrossings =
    frameRequirements?.fixedCrossings ??
    convergedBurgCrossings(worldContext, useOptionsState.getState().distanceUnit, burg);
  if (fixedCrossings && !frameRequirements) {
    const b = fixedCrossings.requiredBounds;
    autoBounds = autoBounds
      ? {
          minX: Math.min(autoBounds.minX, b.minX),
          minY: Math.min(autoBounds.minY, b.minY),
          maxX: Math.max(autoBounds.maxX, b.maxX),
          maxY: Math.max(autoBounds.maxY, b.maxY)
        }
      : { ...b };
    extentMeters = Math.max(extentMeters, requiredSiteExtent(autoBounds));
  }
  if (!fixedCrossings && worldContext.options.landConnectionGeneration) {
    const physical = getWorldLandConnectionCurrent(worldContext, useOptionsState.getState().distanceUnit);
    if (physical) {
      const facilities = new Set(
        physical.snapshot.network.edges
          .filter(e => e.from === burgId || e.to === burgId)
          .flatMap(e => (e.crossing ? [e.crossing.facilityId] : []))
      );
      const halfBudget =
        Math.min(POPULATION_WINDOW_MAX_M, frameRequirements?.maxExtentMeters ?? POPULATION_WINDOW_MAX_M) / 2;
      const resolved = getConstrainedNetworkConnections(physical.snapshot.network, physical.current.environment);
      if (!("connections" in resolved)) throw new RangeError("Cannot resolve current fixed crossings");
      const localFacilities = [...facilities].filter(id => {
        const source = resolved.connections.find(c => c.kind === "bridge" && c.crossing.id === id);
        if (source?.kind !== "bridge") return false;
        const c = source.crossing,
          width = physical.snapshot.network.roadWidthMeters / 2;
        return [c.approachA, c.approachB, c.deckA, c.deckB].every(p =>
          [-1, 1].every(
            sign =>
              Math.abs(p[0] - burg.x * metersPerMapUnit + sign * c.tRiver[0] * width) <= halfBudget &&
              Math.abs(p[1] - burg.y * metersPerMapUnit + sign * c.tRiver[1] * width) <= halfBudget
          )
        );
      });
      if (localFacilities.length) {
        const exported = exportFixedBurgCrossings(
          physical.snapshot,
          physical.current,
          [burg.x * metersPerMapUnit, burg.y * metersPerMapUnit],
          FIXED_SITE_CROSSING_BUDGETS,
          {
            facilityIds: localFacilities,
            coverageBounds: { minX: -halfBudget, minY: -halfBudget, maxX: halfBudget, maxY: halfBudget }
          }
        );
        if (!("crossings" in exported))
          throw new RangeError(`Cannot export current fixed crossings: ${exported.reason}`);
        const b = exported.crossings.requiredBounds;
        if (requiredSiteExtent(b) <= POPULATION_WINDOW_MAX_M) {
          fixedCrossings = exported.crossings;
          autoBounds = autoBounds
            ? {
                minX: Math.min(autoBounds.minX, b.minX),
                minY: Math.min(autoBounds.minY, b.minY),
                maxX: Math.max(autoBounds.maxX, b.maxX),
                maxY: Math.max(autoBounds.maxY, b.maxY)
              }
            : { ...b };
          extentMeters = Math.max(extentMeters, requiredSiteExtent(autoBounds));
        }
      }
    }
  }
  if (fixedCrossings) {
    if (!validFixedBurgCrossings(fixedCrossings, FIXED_SITE_CROSSING_BUDGETS))
      throw new RangeError("Invalid fixed crossing preview");
    const required = frameRequirements?.requiredBounds ?? autoBounds ?? fixedCrossings.requiredBounds,
      b = fixedCrossings.requiredBounds;
    if (
      required.minX > b.minX ||
      required.minY > b.minY ||
      required.maxX < b.maxX ||
      required.maxY < b.maxY ||
      Math.abs(fixedCrossings.originMeters[0] - burg.x * metersPerMapUnit) > 1e-7 ||
      Math.abs(fixedCrossings.originMeters[1] - burg.y * metersPerMapUnit) > 1e-7
    )
      throw new RangeError("Fixed crossing preview origin or bounds mismatch");
  }
  if (!fixedCrossings) {
    const waterSource = canonicalSiteWater(burg, extentMeters / 2, autoBounds);
    if (!waterSource && burg.riverPlacement?.geometryVersion !== undefined && beyondBudgetRiverId === null)
      throw new RangeError("Cannot export canonical settlement water: unresolved geometry or water budget");
    if (waterSource) {
      fixedCrossings = waterSource;
      autoBounds = waterSource.requiredBounds;
    }
  }
  const half = extentMeters / 2;
  const rivers = collectRivers(burg, toLocal, half, cityRadiusMeters, metersPerMapUnit);
  if (beyondBudgetRiverId != null) {
    for (const river of rivers) if (river.riverId === beyondBudgetRiverId) river.frontage = "beyond-budget";
  }
  const roads = collectRoadEntries(burg, toLocal, half, cityRadiusMeters, metersPerMapUnit);
  const waterbody = collectWaterbody(burg, toLocal, half);
  const terrain = collectTerrain(burg, half, metersPerMapUnit);

  const roadLegCount = roads.filter(road => road.group !== "searoutes").length;
  const suggestedArchetype = inferArchetype({ burg, waterbody, rivers, roadLegCount, terrain });

  const settlements: RegionalContext["settlements"] = pack.burgs
    .filter(other => other?.i && other.i !== burgId && !other.removed)
    .flatMap(other => {
      const center = toLocal(other.x, other.y);
      if (Math.abs(center[0]) > half || Math.abs(center[1]) > half) return [];
      return [
        {
          burgId: other.i!,
          name: other.name ?? "",
          center,
          radiusMeters: Math.max(
            1,
            getCityRadiusMeters((other.population ?? 0) * worldContext.populationRate * worldContext.urbanization)
          ),
          representation: "estimated" as const
        }
      ];
    });
  const regionalContext: RegionalContext = {
    version: 1,
    sourceRevision: regionalRevision({ burgId, population, roads, rivers, fixedCrossings, settlements, extentMeters }),
    coverageBounds: { minX: -half, minY: -half, maxX: half, maxY: half },
    settlements,
    roads: roads
      .filter(road => road.group !== "searoutes")
      .flatMap(road => [
        {
          routeId: road.routeId,
          branchId: 0,
          points: road.path,
          widthMeters: fixedCrossings?.roadWidthMeters ?? 6,
          facilityIds: fixedCrossings?.crossings.filter(c => c.id === road.sharedCrossingId).map(c => c.id) ?? []
        },
        ...(road.sharedBranches ?? []).map((branch, index) => ({
          routeId: branch.routeId,
          branchId: index + 1,
          points: branch.path,
          widthMeters: fixedCrossings?.roadWidthMeters ?? 6,
          facilityIds: fixedCrossings?.crossings.filter(c => c.id === road.sharedCrossingId).map(c => c.id) ?? []
        }))
      ])
      .filter(road => road.points.length >= 2)
  };
  return {
    version: DESCRIPTOR_VERSION,
    regionalContext,
    ...(fixedCrossings ? { fixedCrossings: structuredClone(fixedCrossings) } : {}),
    burg: {
      id: burgId,
      name: burg.name ?? "",
      group: burg.group ?? "",
      type: burg.type ?? "Generic",
      seed: String(burg.MFCG ?? worldContext.seed + String(burg.i).padStart(4, "0")),
      population,
      dwellings: getUrbanDwellings(population),
      capital: Boolean(burg.capital),
      port: Boolean(burg.port),
      waterAccess,
      riverPlacement: burg.riverPlacement ? structuredClone(burg.riverPlacement) : undefined,
      riverSiteStatus: burg.riverSiteStatus ? { ...burg.riverSiteStatus } : undefined,
      citadel: Boolean(burg.citadel),
      plaza: Boolean(burg.plaza),
      walls: Boolean(burg.walls),
      temple: Boolean(burg.temple),
      shanty: Boolean(burg.shanty),
      settlementSite: burg.settlementSite ?? "surface"
    },
    frame: {
      regionalMode: true,
      ...(autoBounds
        ? { requiredBounds: { ...autoBounds } }
        : frameRequirements
          ? { requiredBounds: { ...frameRequirements.requiredBounds } }
          : {}),
      originMapUnits: [burg.x, burg.y],
      metersPerMapUnit: fixedCrossings ? metersPerMapUnit : rn(metersPerMapUnit, 2),
      extentMeters,
      cityRadiusMeters
    },
    climate: (() => {
      const bId = pack.cells.biomeCode[burg.cell] ?? 0;
      const bData = worldContext.biomesData;
      const stdDef = STANDARD_BIOME_DEFINITIONS[bId];
      const bKey = (bData?.keys ? bData.keys[bId] : undefined) ?? stdDef?.key;
      const bName = bData?.name?.[bId] ?? stdDef?.label ?? `Biome ${bId}`;
      const bColor = bData?.color?.[bId] ?? stdDef?.color ?? "#d5cfbf";
      return {
        temperatureC: worldContext.grid.cells.temp[pack.cells.g[burg.cell]],
        biomeId: bId,
        biomeKey: bKey,
        biomeName: bName,
        biomeColor: bColor
      };
    })(),
    biome: (() => {
      const bId = pack.cells.biomeCode[burg.cell] ?? 0;
      const bData = worldContext.biomesData;
      const stdDef = STANDARD_BIOME_DEFINITIONS[bId];
      const rawKey = bData?.keys ? bData.keys[bId] : undefined;
      const bKey = rawKey ?? stdDef?.key;
      const bName = bData?.name?.[bId] ?? stdDef?.label ?? `Biome ${bId}`;
      const bColor = bData?.color?.[bId] ?? stdDef?.color ?? "#d5cfbf";
      const bTags = (bData && rawKey ? bData.definitionsByKey?.[rawKey]?.tags : undefined) ?? stdDef?.tags;
      return {
        id: bId,
        key: bKey,
        name: bName,
        color: bColor,
        tags: bTags
      };
    })(),
    terrain,
    transport: {
      riverBridgeTechnology: worldContext.options.riverBridgeTechnology,
      maxBridgeCrossingMeters: bridgeCrossingLimitForPeriod(
        worldContext.options.historicalPeriod ?? "ageOfExploration"
      ),
      maxBridgeSkewDegrees: getStateBridgeSkewLimit(burg.state ?? 0)
    },
    historicalPeriod: worldContext.options.historicalPeriod ?? "ageOfExploration",
    rivers,
    waterbody,
    roads,
    suggestedGates: roadLegCount,
    suggestedArchetype
  };
}

/** Number of land route legs radiating from the burg — used as the watabou `gates` hint. */
export function countBurgRoadLegs(burg: Burg): number {
  const { pack } = worldContext;
  if (!pack.routes?.length) return 0;
  return collectRouteLegs(burg).filter(({ route }) => route.group !== "searoutes").length;
}

function getMetersPerMapUnit(): number {
  const unit = useOptionsState.getState().distanceUnit;
  return mapUnitMeters(worldContext.distanceScale, unit);
}

function getCityRadiusMeters(population: number): number {
  return settlementRadiusMeters(population);
}

function getHeightExponent(): number {
  return normalizeHeightExponent(useOptionsState.getState().heightExponent);
}

/** Integer meters for site descriptors (display / export). */
function heightToMeters(h: number, exponent: number): number {
  return rn(heightToMetersRaw(h, exponent));
}

/** Compass azimuth of a local-frame vector (+X east, +Y north): 0 = north, clockwise. */
function azimuthDeg(dx: number, dy: number): number {
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return rn((deg + 360) % 360, 1) % 360;
}

/** Liang-Barsky segment/box clip. Returns [t0, t1] of the visible sub-segment, or null. */
function clipSegmentToBox(x1: number, y1: number, x2: number, y2: number, half: number): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 + half, half - x1, y1 + half, half - y1];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [t0, t1];
}

/** Clip a polyline (with per-vertex widths) to the centered box, splitting into visible runs. */
function clipWeightedPolylineToBox(
  points: WeightedPoint[],
  half: number,
  preservePrecision = false
): { points: [number, number][]; widthsMeters: number[] }[] {
  const runs: { points: [number, number][]; widthsMeters: number[] }[] = [];
  let current: { points: [number, number][]; widthsMeters: number[] } | null = null;

  const pushPoint = (x: number, y: number, w: number) => {
    if (!current) current = { points: [], widthsMeters: [] };
    const last = current.points.at(-1);
    const tolerance = preservePrecision ? 1e-7 : 0.01;
    if (last && Math.abs(last[0] - x) < tolerance && Math.abs(last[1] - y) < tolerance) return;
    current.points.push(preservePrecision ? [x, y] : [rn(x, 1), rn(y, 1)]);
    current.widthsMeters.push(w);
  };

  const closeRun = () => {
    if (current && current.points.length >= 2) runs.push(current);
    current = null;
  };

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const clip = clipSegmentToBox(a.x, a.y, b.x, b.y, half);
    if (!clip) {
      closeRun();
      continue;
    }
    const [t0, t1] = clip;
    const lerp = (t: number): WeightedPoint => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      w: rn(a.w + (b.w - a.w) * t, 1)
    });
    const start = lerp(t0);
    const end = lerp(t1);
    if (t0 > 0) closeRun(); // segment enters the box afresh
    pushPoint(start.x, start.y, start.w);
    pushPoint(end.x, end.y, end.w);
    if (t1 < 1) closeRun(); // segment leaves the box
  }
  closeRun();
  return runs;
}

function clipPolylineToBox(points: [number, number][], half: number, preservePrecision = false): [number, number][][] {
  const weighted = points.map(([x, y]) => ({ x, y, w: 0 }));
  return clipWeightedPolylineToBox(weighted, half, preservePrecision).map(run => run.points);
}

interface PolylineApproach {
  dist: number;
  index: number;
  t: number;
  tangent: [number, number];
  crossZ: number;
  px: number;
  py: number;
}

/** Closest approach of the origin to a polyline: distance, closest point, vertex index, and downstream tangent. */
function closestApproachToOrigin(points: { x: number; y: number }[]): PolylineApproach | null {
  if (points.length < 2) return null;
  let best: PolylineApproach | null = null;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) continue;
    const t = minmax((-a.x * dx - a.y * dy) / lengthSq, 0, 1);
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const dist = Math.hypot(px, py);
    if (best && dist >= best.dist) continue;
    const length = Math.sqrt(lengthSq);
    const tx = dx / length;
    const ty = dy / length;
    // z-component of tangent × (origin - closest point); > 0 → origin left of flow
    const crossZ = tx * -py - ty * -px;
    best = { dist, index: i, t, tangent: [tx, ty], crossZ, px, py };
  }
  return best;
}

/** Construct physical left/right water edges from the true-width local centreline.
 * This intentionally does not reuse FMG's exaggerated SVG bank geometry. */
function getTrueRiverBanks(points: WeightedPoint[]): { left: [number, number][]; right: [number, number][] } {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[i - 1] ?? points[i];
    const next = points[i + 1] ?? points[i];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const halfWidth = points[i].w / 2;
    left.push([points[i].x + nx * halfWidth, points[i].y + ny * halfWidth]);
    right.push([points[i].x - nx * halfWidth, points[i].y - ny * halfWidth]);
  }
  return { left, right };
}

function closestPointOnPolyline(points: [number, number][]): [number, number] | null {
  if (points.length < 2) return null;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (-a[0] * dx - a[1] * dy) / len2));
    const x = a[0] + dx * t;
    const y = a[1] + dy * t;
    const d = x * x + y * y;
    if (d < bestD) {
      bestD = d;
      best = [x, y];
    }
  }
  return best;
}

function localRiverPoints(
  river: Pick<River, "cells" | "points" | "widthFactor" | "sourceWidth">,
  toLocal: (x: number, y: number) => [number, number],
  metersPerMapUnit: number
): WeightedPoint[] | null {
  if (!river.cells?.length) return null;
  const validPoints = river.points && river.points.length === river.cells.length ? river.points : null;
  const meandered = Rivers.addMeandering(river.cells, validPoints);
  if (meandered.length < 2) return null;
  const banks = Rivers.getRiverBanks(meandered, river.widthFactor ?? 1, river.sourceWidth ?? 0.1);
  return meandered.map(([x, y], index) => {
    const [lx, ly] = toLocal(x, y);
    const trueWidthMapUnits = Rivers.getWidth(banks.widths[index] / 2);
    return { x: lx, y: ly, w: Math.max(rn(trueWidthMapUnits * metersPerMapUnit, 1), RIVER_MIN_WIDTH_M) };
  });
}

/** Near bank plus a strip of water, centred on the unchanged town origin. */
function canonicalFrontageBounds(burg: Burg, riverId: number, toLocal: (x: number, y: number) => [number, number]) {
  if (burg.riverPlacement?.sourceSegmentId === undefined) return legacyCanonicalFrontageBounds(burg, riverId, toLocal);
  const river = worldContext.pack.rivers.find(r => r.i === riverId);
  if (!river) return null;
  const scale = getMetersPerMapUnit();
  const reach = POPULATION_WINDOW_MAX_M / 2;
  const x = burg.x * scale,
    y = burg.y * scale;
  const source = regionalRiverGeometry(
    worldContext,
    river,
    useOptionsState.getState().distanceUnit,
    SETTLEMENT_RIVER_SETTINGS
  );
  if (!(source instanceof RegionalRiverGeometry)) return null;
  const resolved = source.query({ minX: x - reach, maxX: x + reach, minY: y - reach, maxY: y + reach });
  if (!resolved || !("geometry" in resolved)) return null;
  const bank = nearestSettlementBank(resolved.geometry, [burg.x * scale, burg.y * scale]);
  if (!bank) return null;
  const samples = [bank.bankPoint, bank.waterPoint].map(p => toLocal(p[0] / scale, p[1] / scale));
  const bounds: RequiredSiteBounds = {
    minX: Math.min(...samples.map(p => p[0])) - FRONTAGE_FRAME_PAD_M,
    minY: Math.min(...samples.map(p => p[1])) - FRONTAGE_FRAME_PAD_M,
    maxX: Math.max(...samples.map(p => p[0])) + FRONTAGE_FRAME_PAD_M,
    maxY: Math.max(...samples.map(p => p[1])) + FRONTAGE_FRAME_PAD_M
  };
  return requiredSiteExtent(bounds) > POPULATION_WINDOW_MAX_M
    ? { beyondBudget: true as const }
    : { bounds, beyondBudget: false as const };
}

function canonicalSiteWater(burg: Burg, half: number, required?: RequiredSiteBounds): FixedBurgCrossings | null {
  if (burg.riverPlacement?.sourceSegmentId === undefined) return legacyCanonicalSiteWater(burg, half, required);
  const rivers: FixedBurgCrossings["rivers"][number][] = [];
  let vertices = 0;
  const scale = getMetersPerMapUnit();
  const origin: [number, number] = [burg.x * scale, burg.y * scale];
  const frame: [number, number][] = [
    [origin[0] - half, origin[1] - half],
    [origin[0] + half, origin[1] - half],
    [origin[0] + half, origin[1] + half],
    [origin[0] - half, origin[1] + half]
  ];
  const session = new SettlementGeometrySession();
  session.prepare(worldContext, useOptionsState.getState().distanceUnit);
  const coverage = { minX: origin[0] - half, maxX: origin[0] + half, minY: origin[1] - half, maxY: origin[1] + half };
  for (const riverId of session.rivers(coverage)) {
    const river = worldContext.pack.rivers.find(r => r.i === riverId)!;
    const resolved = session.resolve(worldContext, river, useOptionsState.getState().distanceUnit, coverage);
    if (!("geometry" in resolved)) {
      if (resolved.reason === "no-local-water") continue;
      return null;
    }
    if (!footprintTouchesWater(frame, resolved.geometry.water)) continue;
    const rings = resolved.geometry.water.rings.map(ring =>
      ring.map(p => [p[0] - origin[0], origin[1] - p[1]] as [number, number])
    );
    vertices += rings.reduce((n, ring) => n + ring.length, 0);
    if (
      vertices > FIXED_SITE_CROSSING_BUDGETS.maxWaterVertices ||
      rivers.length >= FIXED_SITE_CROSSING_BUDGETS.maxFacilities
    )
      return null;
    rivers.push({
      id: river.i,
      geometryVersion: resolved.geometryVersion,
      rings,
      sourceSegments: resolved.sourceSegments,
      artificialCaps: resolved.artificialCaps,
      bankPrecisionMeters: SETTLEMENT_RIVER_SETTINGS.banks.maxChordErrorMeters
    });
  }
  if (!rivers.length) return null;
  const payload: FixedBurgCrossings = {
    schemaVersion: 3,
    coverageBounds: { minX: -half, minY: -half, maxX: half, maxY: half },
    coordinateUnit: "metres",
    revision: 0,
    originMeters: origin,
    roadWidthMeters: 5,
    requiredBounds: required ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    rivers,
    crossings: []
  };
  return validFixedBurgCrossings(payload, FIXED_SITE_CROSSING_BUDGETS) ? payload : null;
}

function frontageDisplayBounds(
  riverId: number,
  toLocal: (x: number, y: number) => [number, number],
  metersPerMapUnit: number,
  cityRadiusMeters: number,
  portRiver: boolean
): { bounds: RequiredSiteBounds; beyondBudget: false } | { bounds?: undefined; beyondBudget: true } | null {
  const river = worldContext.pack.rivers?.find(item => item.i === riverId);
  if (!river) return null;
  const points = localRiverPoints(river, toLocal, metersPerMapUnit);
  if (!points) return null;
  const approach = closestApproachToOrigin(points);
  if (!approach) return null;
  const width = points[approach.index].w + (points[approach.index + 1].w - points[approach.index].w) * approach.t;
  const banks = getTrueRiverBanks(points);
  const townBank = approach.crossZ > 0 ? banks.left : banks.right;
  const bankPoint = closestPointOnPolyline(townBank);
  if (!bankPoint) return null;
  const center: [number, number] = [approach.px, approach.py];
  const dx = center[0] - bankPoint[0];
  const dy = center[1] - bankPoint[1];
  const span = Math.hypot(dx, dy);
  const waterDist = Math.min(FRONTAGE_WATER_MARGIN_M, span);
  const water: [number, number] =
    span === 0 ? bankPoint : [bankPoint[0] + (dx / span) * waterDist, bankPoint[1] + (dy / span) * waterDist];
  const limit = bridgeCrossingLimitForPeriod(worldContext.options.historicalPeriod ?? "ageOfExploration");
  const wide = width > limit || (portRiver && width > cityRadiusMeters * PORT_CHANNEL_RADIUS_RATIO);
  const samples: [number, number][] = [bankPoint, water];
  if (!wide) samples.push(center);
  const pad = FRONTAGE_FRAME_PAD_M;
  const bounds: RequiredSiteBounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
  for (const [x, y] of samples) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { beyondBudget: true };
    bounds.minX = Math.min(bounds.minX, x - pad);
    bounds.minY = Math.min(bounds.minY, y - pad);
    bounds.maxX = Math.max(bounds.maxX, x + pad);
    bounds.maxY = Math.max(bounds.maxY, y + pad);
  }
  if (!isRequiredSiteBounds(bounds) || requiredSiteExtent(bounds) > POPULATION_WINDOW_MAX_M)
    return { beyondBudget: true };
  return { bounds, beyondBudget: false };
}

function collectRivers(
  burg: Burg,
  toLocal: (x: number, y: number) => [number, number],
  half: number,
  cityRadiusMeters: number,
  metersPerMapUnit: number
): BurgSiteRiver[] {
  const { pack } = worldContext;
  if (!pack.rivers?.length) return [];

  // Candidate prefilter: rivers passing within two cell rings of the burg.
  // A city extent is far smaller than a pack cell, so two rings always cover it.
  const neighborhood = new Set<number>([burg.cell]);
  for (const n1 of pack.cells.c[burg.cell] ?? []) {
    neighborhood.add(n1);
    for (const n2 of pack.cells.c[n1] ?? []) neighborhood.add(n2);
  }

  const results: BurgSiteRiver[] = [];
  for (const river of pack.rivers) {
    const frontage = burg.waterAccess?.riverId === river.i;
    if (!river.cells?.length || (!frontage && !river.cells.some(cell => neighborhood.has(cell)))) continue;

    const points = localRiverPoints(river, toLocal, metersPerMapUnit);
    if (!points) continue;

    const rawApproach = closestApproachToOrigin(points);
    if (!rawApproach) continue;
    const rawOffsetMeters = rn(rawApproach.dist, 1);

    // Keep physical centreline, banks, roads and terrain in the same burg-local
    // frame. The rendered bank exaggeration must not move only the river.
    const throughBurgCell = river.cells.includes(burg.cell);
    const snappedToBank = false;
    const approach = rawApproach;

    const segments = clipWeightedPolylineToBox(points, half);
    // Use the true-width banks in the same local metre frame as `points`.
    // FMG's rendered banks are intentionally exaggerated; they are useful for
    // placing the burg but not for a physical city-scale water boundary.
    const trueBanks = getTrueRiverBanks(points);
    const leftBankSegments = clipPolylineToBox(trueBanks.left, half);
    const rightBankSegments = clipPolylineToBox(trueBanks.right, half);
    // A very wide on-cell river can have its centreline outside the compact
    // city window while its actual bank crosses it. Keep it: City Generator
    // turns that bank into an open-water boundary instead of silently dropping
    // the waterway.
    // A clipped-out frontage still carries its physical survey to CE's
    // local geometry fallback; clipping must not discard depth or navigation.
    if (!frontage && !segments.length && !leftBankSegments.length && !rightBankSegments.length) continue;

    const widthMeters = rn(
      points[approach.index].w + (points[approach.index + 1].w - points[approach.index].w) * approach.t,
      1
    );
    const nearestCell = river.cells
      .filter(c => c >= 0)
      .reduce(
        (best, cell) => {
          const [x, y] = pack.cells.p[cell];
          const [bx, by] = pack.cells.p[best];
          return Math.hypot(x - burg.x, y - burg.y) < Math.hypot(bx - burg.x, by - burg.y) ? cell : best;
        },
        river.cells.find(c => c >= 0)!
      );
    const sampleCell = river.cellHydrology?.[burg.cell] ? burg.cell : nearestCell;
    const hydrology = river.cellHydrology?.[sampleCell];
    const depthMeters = hydrology?.waterDepth ?? null;
    const waterRoutes = (pack.routes ?? []).filter(
      route =>
        route.group === "searoutes" &&
        (route.cells ?? route.points?.map(p => p[2]) ?? []).some(c => river.cells.includes(c))
    );
    const vessel = waterRoutes.some(route => route.navigation !== "river")
      ? SEA_SAILING_VESSEL
      : waterRoutes.length || (frontage && burg.waterAccess?.port.river)
        ? RIVER_CARGO_VESSEL
        : undefined;
    const siteCrossings = (pack.routes ?? [])
      .flatMap(route => route.riverCrossings ?? [])
      .filter(c => c.riverId === river.i && Math.hypot(...toLocal(...c.point)) <= half);
    const crossing =
      siteCrossings.find(c => c.plan.kind === "ferry" || c.plan.kind === "none")?.plan ??
      siteCrossings[0]?.plan ??
      planRiverCrossing({
        widthMeters,
        depthMeters,
        period: worldContext.options.historicalPeriod,
        technology: worldContext.options.riverBridgeTechnology,
        vessel
      });
    const offsetMeters = rn(approach.dist, 1);
    results.push({
      riverId: river.i,
      depthMeters,
      ...(hydrology ? { hydrology: { ...hydrology, cellId: sampleCell } } : {}),
      ...(vessel ? { navigationVessel: { ...vessel } } : {}),
      crossing,
      name: river.name ?? "",
      type: river.type ?? "",
      widthMeters: rn(
        points[approach.index].w + (points[approach.index + 1].w - points[approach.index].w) * approach.t,
        1
      ),
      axisAzimuthDeg: azimuthDeg(approach.tangent[0], approach.tangent[1]),
      offsetMeters,
      offsetRatio: rn(offsetMeters / cityRadiusMeters, 2),
      cityBank: approach.crossZ > 0 ? "left" : "right",
      crossesSite: offsetMeters < cityRadiusMeters,
      throughBurgCell,
      rawOffsetMeters,
      snappedToBank,
      segments,
      parentRiverId: river.parent && river.parent !== river.i ? river.parent : null,
      leftBankSegments,
      rightBankSegments,
      downstream: getDownstreamContext(river, burg, metersPerMapUnit)
    });
  }

  // Closest river first — the primary waterway for bridges and mills.
  results.sort((a, b) => a.offsetMeters - b.offsetMeters);
  return results;
}

/** Compact downstream fact for the city page's regional context. The urban
 * window remains local; this is deliberately metadata rather than geometry. */
function getDownstreamContext(
  river: { cells: number[]; parent?: number; i: number },
  burg: Burg,
  metersPerMapUnit: number
): BurgSiteRiver["downstream"] {
  const { pack } = worldContext;
  const start = river.cells.indexOf(burg.cell);
  const downstreamCells = river.cells.slice(start >= 0 ? start : Math.max(0, river.cells.length - 1));
  let distanceMapUnits = 0;
  for (let i = 1; i < downstreamCells.length; i++) {
    const a = downstreamCells[i - 1];
    const b = downstreamCells[i];
    if (a < 0 || b < 0) continue;
    const pa = pack.cells.p[a];
    const pb = pack.cells.p[b];
    distanceMapUnits += Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  }
  const endCell = downstreamCells.at(-1) ?? river.cells.at(-1) ?? -1;
  const end = endCell >= 0 ? pack.cells.p[endCell] : null;
  const bearingDeg = end ? azimuthDeg((end[0] - burg.x) * metersPerMapUnit, (burg.y - end[1]) * metersPerMapUnit) : 0;
  if (endCell < 0) return { terminal: "mapEdge", distanceMeters: rn(distanceMapUnits * metersPerMapUnit), bearingDeg };
  if (pack.cells.h[endCell] < 20) {
    const feature = pack.features[pack.cells.f[endCell]];
    return {
      terminal: feature?.type === "lake" ? "lake" : "ocean",
      distanceMeters: rn(distanceMapUnits * metersPerMapUnit),
      bearingDeg
    };
  }
  if (river.parent && river.parent !== river.i) {
    return { terminal: "confluence", distanceMeters: rn(distanceMapUnits * metersPerMapUnit), bearingDeg };
  }
  return { terminal: "unknown", distanceMeters: rn(distanceMapUnits * metersPerMapUnit), bearingDeg };
}

/**
 * Route legs radiating from the burg. A route passing through the burg cell
 * contributes two legs (in/out); a route terminating there contributes one.
 * Route points at burg cells are exactly the burg position (routes-generator).
 */
function collectRouteLegs(burg: Burg): { route: Route; leg: [number, number, number][] }[] {
  const { pack } = worldContext;
  const legs: { route: Route; leg: [number, number, number][] }[] = [];

  for (const route of pack.routes) {
    if (route.merged || !route.points?.length) continue;
    if (route.registeredConnectionId !== undefined) {
      const physical = getWorldLandConnectionCurrent(worldContext, useOptionsState.getState().distanceUnit);
      const edge = physical?.snapshot.network.edges.find(e => e.id === route.registeredConnectionId && !e.reverse);
      if (!edge || (edge.from !== burg.i && edge.to !== burg.i)) continue;
      let leg = edge.from === burg.i ? route.points.slice() : route.points.slice().reverse();
      if (edge.crossing) {
        const connection = getConstrainedNetworkConnections(physical!.snapshot.network, physical!.current.environment);
        if (!("connections" in connection)) continue;
        const source = connection.connections.find(c => c.id === edge.id);
        if (source?.kind !== "bridge") continue;
        const endpoint = edge.from === burg.i ? source.crossing.approachA : source.crossing.approachB;
        const scale = getMetersPerMapUnit();
        const terminal = leg.findIndex(p => Math.hypot(p[0] * scale - endpoint[0], p[1] * scale - endpoint[1]) <= 1e-7);
        if (terminal < 1) continue;
        leg = leg.slice(0, terminal + 1);
      }
      if (leg.length >= 2) legs.push({ route, leg });
      continue;
    }
    if (worldContext.options.landConnectionGeneration && route.group !== "searoutes") continue;
    const index = route.points.findIndex(
      point =>
        point[2] === burg.cell &&
        (!route.riverRoadConvergence || Math.hypot(point[0] - burg.x, point[1] - burg.y) < 1e-7)
    );
    if (index === -1) continue;

    const forward = route.points.slice(index);
    const backward = route.points.slice(0, index + 1).reverse();
    if (forward.length >= 2) legs.push({ route, leg: forward });
    if (backward.length >= 2) legs.push({ route, leg: backward });
  }
  return legs;
}

function collectRoadEntries(
  burg: Burg,
  toLocal: (x: number, y: number) => [number, number],
  half: number,
  cityRadiusMeters: number,
  metersPerMapUnit: number
): BurgSiteRoadEntry[] {
  const { pack } = worldContext;
  if (!pack.routes?.length) return [];

  const facilities = convergedBurgFacilities(worldContext, useOptionsState.getState().distanceUnit, burg.i!);
  const entries: BurgSiteRoadEntry[] = [];
  for (const { route, leg } of collectRouteLegs(burg)) {
    const facility = facilities.find(
      f =>
        f.routeIds.includes(route.i) &&
        leg.some(p => Math.hypot(p[0] * metersPerMapUnit - f.near[0], p[1] * metersPerMapUnit - f.near[1]) < 1e-7)
    );
    const terminal = facility
      ? leg.findIndex(
          p => Math.hypot(p[0] * metersPerMapUnit - facility.near[0], p[1] * metersPerMapUnit - facility.near[1]) < 1e-7
        )
      : -1;
    const localPoints = (terminal >= 1 ? leg.slice(0, terminal + 1) : leg).map(([x, y]) => toLocal(x, y));

    // Azimuth where the leg crosses the city radius (gate direction).
    let entryAzimuth: number | null = null;
    let _travelled = 0;
    for (let i = 1; i < localPoints.length; i++) {
      const [px, py] = localPoints[i];
      const dist = Math.hypot(px, py);
      _travelled += Math.hypot(px - localPoints[i - 1][0], py - localPoints[i - 1][1]);
      if (dist >= cityRadiusMeters) {
        entryAzimuth = azimuthDeg(px, py);
        break;
      }
    }
    const [lastX, lastY] = localPoints.at(-1) as [number, number];
    const reachesEdge = entryAzimuth !== null;
    if (entryAzimuth === null) {
      if (Math.hypot(lastX, lastY) < 1) continue; // degenerate leg collapsed on the origin
      entryAzimuth = azimuthDeg(lastX, lastY);
    }

    // First other burg along the leg — the signpost destination behind this gate.
    let nextBurg: BurgSiteRoadEntry["nextBurg"] = null;
    let lengthMapUnits = 0;
    for (let i = 1; i < leg.length; i++) {
      lengthMapUnits += Math.hypot(leg[i][0] - leg[i - 1][0], leg[i][1] - leg[i - 1][1]);
      const cellBurgId = pack.cells.burg[leg[i][2]];
      if (cellBurgId && cellBurgId !== burg.i) {
        const target = pack.burgs[cellBurgId];
        const isDomestic = target ? target.state === burg.state : true;
        let diplomacyRelation: BurgSiteRoadNextBurg["diplomacyRelation"] = isDomestic ? "domestic" : "Neutral";
        if (!isDomestic && target && burg.state && target.state) {
          const stateRel = pack.states[burg.state]?.diplomacy?.[target.state];
          if (typeof stateRel === "string") {
            diplomacyRelation = stateRel as RelationKey;
          }
        }
        const stateName = (target?.state && pack.states[target.state]?.name) || "";
        const pop = target?.population ?? 0;
        let scale: BurgSiteRoadNextBurg["scale"] = "town";
        if (target?.group === "hamlet" || pop < 1) scale = "hamlet";
        else if (target?.group === "village" || pop < 3) scale = "village";
        else if (pop > 10 || target?.capital) scale = "city";

        let role: BurgSiteRoadNextBurg["role"] = "generic";
        if (target?.capital) role = "capital";
        else if (target?.citadel || (target?.walls && pop < 4)) role = "fortress";
        else if (scale === "village" || target?.group === "farm") role = "granary";
        else if (target?.port || target?.group === "trading_post" || (scale === "city" && target?.plaza))
          role = "market";

        const popRate = useOptionsState.getState().populationRate ?? 1000;
        nextBurg = {
          id: cellBurgId,
          name: target?.name ?? "",
          distanceMeters: rn(lengthMapUnits * metersPerMapUnit),
          stateId: target?.state,
          stateName,
          isDomestic,
          diplomacyRelation,
          population: Math.round(pop * popRate),
          scale,
          role,
          capital: Boolean(target?.capital),
          walls: Boolean(target?.walls),
          citadel: Boolean(target?.citadel),
          treasury: target?.treasury,
          wealth: (target as { wealth?: number })?.wealth ?? Math.min(100, Math.round(pop * 10))
        };
        break;
      }
    }

    const clipped = clipPolylineToBox(localPoints, half, !!facility);
    const shared = facility && entries.find(e => e.sharedCrossingId === facility.crossing.id);
    if (shared) {
      shared.sharedBranches!.push({
        routeId: route.i,
        path:
          clipPolylineToBox(
            leg.map(([x, y]) => toLocal(x, y)),
            half,
            true
          )[0] ?? [],
        nextBurg
      });
      if (!shared.sharedRouteIds!.includes(route.i)) shared.sharedRouteIds!.push(route.i);
      if (nextBurg && !shared.nextBurgs!.some(b => b.id === nextBurg.id)) shared.nextBurgs!.push(nextBurg);
      continue;
    }
    entries.push({
      ...(facility
        ? {
            sharedCrossingId: facility.crossing.id,
            sharedRouteIds: [route.i],
            nextBurgs: nextBurg ? [nextBurg] : [],
            sharedBranches: [
              {
                routeId: route.i,
                path:
                  clipPolylineToBox(
                    leg.map(([x, y]) => toLocal(x, y)),
                    half,
                    true
                  )[0] ?? [],
                nextBurg
              }
            ]
          }
        : {}),
      routeId: route.i,
      group: route.group,
      ...(route.name ? { name: route.name } : {}),
      entryAzimuthDeg: entryAzimuth,
      reachesEdge,
      path: clipped[0] ?? [],
      nextBurg
    });
  }

  entries.sort((a, b) => a.entryAzimuthDeg - b.entryAzimuthDeg);
  return entries;
}

function collectWaterbody(
  burg: Burg,
  toLocal: (x: number, y: number) => [number, number],
  half: number
): BurgSiteWaterbody | null {
  const { pack } = worldContext;
  const haven = pack.cells.haven[burg.cell];
  if (!haven) return null;

  const waterFeature = pack.features[pack.cells.f[haven]];
  if (!waterFeature) return null;
  const kind = waterFeature.type === "lake" ? "lake" : "ocean";

  // The shoreline near the town: lakes carry their own boundary chain; for the
  // ocean the land feature's chain traces the coast.
  const chainFeature = kind === "lake" ? waterFeature : pack.features[pack.cells.f[burg.cell]];
  const vertexChain = chainFeature?.vertices ?? [];
  const ring: [number, number][] = vertexChain.map(v => {
    const [x, y] = pack.vertices.p[v];
    return toLocal(x, y);
  });
  if (ring.length > 1) ring.push(ring[0]); // close the ring

  const [havenX, havenY] = toLocal(...pack.cells.p[haven]);
  const shoreline = clipPolylineToBox(ring, half);
  // `haven` is the hydrological outlet / nearest water reference, not a
  // guarantee that the burg is coastal. A non-port inland burg can therefore
  // point at a lake or ocean tens of kilometres away (Taris). Do not turn that
  // into a fabricated coast inside a 1–4 km urban window.
  if (!shoreline.length && !burg.port) return null;

  return {
    kind,
    ...(waterFeature.name ? { name: waterFeature.name } : {}),
    ...(waterFeature.group ? { group: waterFeature.group } : {}),
    isPort: Boolean(burg.port),
    shoreAzimuthDeg: azimuthDeg(havenX, havenY),
    shoreline
  };
}

function collectTerrain(burg: Burg, half: number, metersPerMapUnit: number): BurgSiteTerrain {
  const { pack } = worldContext;
  const exponent = getHeightExponent();

  const size = HEIGHTFIELD_SIZE;
  const spacingMeters = rn((half * 2) / (size - 1), 1);
  const elevationsMeters: number[] = [];
  const waterMask: (0 | 1)[] = [];

  for (let row = 0; row < size; row++) {
    const localY = half - row * spacingMeters; // row 0 = north edge
    for (let col = 0; col < size; col++) {
      const localX = -half + col * spacingMeters;
      const mapX = minmax(burg.x + localX / metersPerMapUnit, 0, worldContext.graphWidth);
      const mapY = minmax(burg.y - localY / metersPerMapUnit, 0, worldContext.graphHeight);
      const h = pack.cells.h[findCell(mapX, mapY)];
      elevationsMeters.push(heightToMeters(h, exponent));
      waterMask.push(h < 20 ? 1 : 0);
    }
  }

  const { downhillAzimuthDeg, gradePercent } = computeSlope(burg, metersPerMapUnit, exponent);

  return {
    elevationMeters: heightToMeters(pack.cells.h[burg.cell], exponent),
    downhillAzimuthDeg,
    gradePercent,
    heightfield: { size, spacingMeters, elevationsMeters, waterMask }
  };
}

/** Least-squares plane fit over the burg cell and its neighbors → slope at the town center. */
function computeSlope(
  burg: Burg,
  metersPerMapUnit: number,
  exponent: number
): { downhillAzimuthDeg: number | null; gradePercent: number } {
  const { pack } = worldContext;
  const cellIds = [burg.cell, ...(pack.cells.c[burg.cell] ?? [])];
  if (cellIds.length < 3) return { downhillAzimuthDeg: null, gradePercent: 0 };

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  const n = cellIds.length;

  for (const cellId of cellIds) {
    const [cx, cy] = pack.cells.p[cellId];
    const x = (cx - burg.x) * metersPerMapUnit;
    const y = (burg.y - cy) * metersPerMapUnit;
    const z = heightToMeters(pack.cells.h[cellId], exponent);
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sxz += x * z;
    syz += y * z;
    sx += x;
    sy += y;
    sz += z;
  }

  // Solve the 2x2 system for the centered plane z = a·x + b·y + c
  const cxx = sxx - (sx * sx) / n;
  const cxy = sxy - (sx * sy) / n;
  const cyy = syy - (sy * sy) / n;
  const cxz = sxz - (sx * sz) / n;
  const cyz = syz - (sy * sz) / n;
  const det = cxx * cyy - cxy * cxy;
  if (Math.abs(det) < 1e-9) return { downhillAzimuthDeg: null, gradePercent: 0 };

  const a = (cxz * cyy - cyz * cxy) / det;
  const b = (cyz * cxx - cxz * cxy) / det;
  const grade = Math.hypot(a, b) * 100;
  if (grade < 0.01) return { downhillAzimuthDeg: null, gradePercent: 0 };

  return { downhillAzimuthDeg: azimuthDeg(-a, -b), gradePercent: rn(grade, 2) };
}

function inferArchetype(args: {
  burg: Burg;
  waterbody: BurgSiteWaterbody | null;
  rivers: BurgSiteRiver[];
  roadLegCount: number;
  terrain: BurgSiteTerrain;
}): BurgSiteArchetype {
  const { burg, waterbody, rivers, roadLegCount, terrain } = args;
  if (waterbody && burg.port) return "harbor";
  if (rivers.some(river => river.crossesSite) && roadLegCount >= 2) return "riverCrossing";

  // Hilltop: town center noticeably above the mean of the land samples on the window edge
  const { size, elevationsMeters, waterMask } = terrain.heightfield;
  const edgeElevations: number[] = [];
  for (let index = 0; index < elevationsMeters.length; index++) {
    const row = Math.floor(index / size);
    const col = index % size;
    const isEdge = row === 0 || col === 0 || row === size - 1 || col === size - 1;
    if (isEdge && !waterMask[index]) edgeElevations.push(elevationsMeters[index]);
  }
  if (edgeElevations.length) {
    const meanEdge = edgeElevations.reduce((sum, value) => sum + value, 0) / edgeElevations.length;
    if (terrain.elevationMeters - meanEdge >= HILLTOP_RELIEF_M) return "hillTop";
  }

  return "crossroads";
}

function legacyCanonicalFrontageBounds(
  burg: Burg,
  riverId: number,
  toLocal: (x: number, y: number) => [number, number]
) {
  const river = worldContext.pack.rivers.find(r => r.i === riverId);
  if (!river) return null;
  const resolved = settlementRiverGeometry(worldContext, river, useOptionsState.getState().distanceUnit);
  if (!("geometry" in resolved)) return null;
  const scale = resolved.metersPerMapUnit;
  const bank = nearestSettlementBank(resolved.geometry, [burg.x * scale, burg.y * scale]);
  if (!bank) return null;
  const samples = [bank.bankPoint, bank.waterPoint].map(p => toLocal(p[0] / scale, p[1] / scale));
  const bounds: RequiredSiteBounds = {
    minX: Math.min(...samples.map(p => p[0])) - FRONTAGE_FRAME_PAD_M,
    minY: Math.min(...samples.map(p => p[1])) - FRONTAGE_FRAME_PAD_M,
    maxX: Math.max(...samples.map(p => p[0])) + FRONTAGE_FRAME_PAD_M,
    maxY: Math.max(...samples.map(p => p[1])) + FRONTAGE_FRAME_PAD_M
  };
  return requiredSiteExtent(bounds) > POPULATION_WINDOW_MAX_M
    ? { beyondBudget: true as const }
    : { bounds, beyondBudget: false as const };
}

function legacyCanonicalSiteWater(burg: Burg, half: number, required?: RequiredSiteBounds): FixedBurgCrossings | null {
  const rivers: FixedBurgCrossings["rivers"][number][] = [];
  let vertices = 0;
  const scale = getMetersPerMapUnit();
  const origin: [number, number] = [burg.x * scale, burg.y * scale];
  const frame: [number, number][] = [
    [origin[0] - half, origin[1] - half],
    [origin[0] + half, origin[1] - half],
    [origin[0] + half, origin[1] + half],
    [origin[0] - half, origin[1] + half]
  ];
  for (const river of worldContext.pack.rivers) {
    const possible = worldRiverOccupiedBounds(
      worldContext,
      river,
      useOptionsState.getState().distanceUnit,
      SETTLEMENT_RIVER_SETTINGS
    );
    if (!possible) return null;
    if (
      possible.maxX < origin[0] - half ||
      possible.minX > origin[0] + half ||
      possible.maxY < origin[1] - half ||
      possible.minY > origin[1] + half
    )
      continue;
    const resolved = settlementRiverGeometry(worldContext, river, useOptionsState.getState().distanceUnit);
    // Remote unresolved reaches cannot affect this frame; a nearby one stops the export.
    const b = resolved.bounds;
    if (!b) return null;
    if (
      b.maxX < origin[0] - half ||
      b.minX > origin[0] + half ||
      b.maxY < origin[1] - half ||
      b.minY > origin[1] + half
    )
      continue;
    if (!("geometry" in resolved)) return null;
    if (!footprintTouchesWater(frame, resolved.geometry.water)) continue;
    const rings = resolved.geometry.water.rings.map(ring =>
      ring.map(p => [p[0] - origin[0], origin[1] - p[1]] as [number, number])
    );
    vertices += rings.reduce((n, ring) => n + ring.length, 0);
    if (
      vertices > FIXED_SITE_CROSSING_BUDGETS.maxWaterVertices ||
      rivers.length >= FIXED_SITE_CROSSING_BUDGETS.maxFacilities
    )
      return null;
    rivers.push({ id: river.i, geometryVersion: resolved.geometryVersion, rings });
  }
  if (!rivers.length) return null;
  const payload: FixedBurgCrossings = {
    schemaVersion: 2,
    coordinateUnit: "metres",
    revision: 0,
    originMeters: origin,
    roadWidthMeters: 5,
    requiredBounds: required ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    rivers,
    crossings: []
  };
  return validFixedBurgCrossings(payload, FIXED_SITE_CROSSING_BUDGETS) ? payload : null;
}
