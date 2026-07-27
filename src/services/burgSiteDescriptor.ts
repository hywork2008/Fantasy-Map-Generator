import { worldContext } from "../context/worldContext";
import { Rivers } from "../generators/river-generator";
import { useOptionsState } from "../store/optionsState";
import type { Burg, Route } from "../types/models";
import { findCell, minmax, rn } from "../utils";
import { heightToMeters as heightToMetersRaw, normalizeHeightExponent } from "../utils/height";

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
  /**
   * Raw map-geometry distance (m) from the town center to the centerline before
   * bank snapping. FMG draws rivers exaggeratedly wide and shifts river burgs
   * toward the DRAWN bank, so for on-river towns this is an artifact of drawn
   * width (often ~1 km) rather than real-world separation.
   */
  rawOffsetMeters: number;
  /**
   * True when the centerline was rigidly translated so the town center sits on
   * the bank (offset = trueWidth/2 + bank margin). Applied only to
   * throughBurgCell rivers; shape, flow azimuth and bank side are preserved.
   */
  snappedToBank: boolean;
  /**
   * Centerline polyline(s) clipped to the extent box, upstream → downstream,
   * local meters. widthsMeters[i] is the true width at points[i].
   */
  segments: { points: [number, number][]; widthsMeters: number[] }[];
}

export interface BurgSiteRoadEntry {
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
  nextBurg: { id: number; name: string; distanceMeters: number } | null;
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

export interface BurgSiteDescriptor {
  version: 1;
  burg: {
    id: number;
    name: string;
    group: string;
    type: string;
    /** Deterministic seed shared with the watabou preview links. */
    seed: string;
    /** Absolute number of inhabitants (population points × populationRate × urbanization). */
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
    /** Burg position in FMG map units (the local origin). */
    originMapUnits: [number, number];
    metersPerMapUnit: number;
    /** Side length of the square generation window centered on the origin. */
    extentMeters: number;
    /** Suggested built-up radius derived from population (walled-town density model). */
    cityRadiusMeters: number;
  };
  climate: { temperatureC: number; biomeId: number };
  terrain: BurgSiteTerrain;
  rivers: BurgSiteRiver[];
  waterbody: BurgSiteWaterbody | null;
  roads: BurgSiteRoadEntry[];
  /** Count of land route legs — the natural number of town gates. */
  suggestedGates: number;
  suggestedArchetype: BurgSiteArchetype;
}

const DESCRIPTOR_VERSION = 1;
const HEIGHTFIELD_SIZE = 17;
/** Typical population density inside medieval town walls, people per hectare. */
const WALLED_DENSITY_PER_HA = 150;
const CITY_RADIUS_MIN_M = 80;
const CITY_RADIUS_MAX_M = 1500;
const EXTENT_MIN_M = 1500;
const EXTENT_MAX_M = 4500;
/** Minimum believable river width for bridge-scale rendering. */
const RIVER_MIN_WIDTH_M = 2;
/** Bank strip between the town center and an on-cell river: min(this cap, ratio × cityRadius). */
const RIVER_BANK_MARGIN_MAX_M = 150;
const RIVER_BANK_MARGIN_RATIO = 0.3;
/** Relief (m) of the town center above its surroundings that suggests a hilltop site. */
const HILLTOP_RELIEF_M = 30;

const UNIT_METERS: Record<string, number> = {
  km: 1000,
  mi: 1609.344,
  lg: 4828.032,
  vr: 1066.8,
  nmi: 1852
};

type WeightedPoint = { x: number; y: number; w: number };

export function getBurgSiteDescriptor(burgId: number): BurgSiteDescriptor | null {
  const { pack } = worldContext;
  const burg = pack.burgs?.[burgId];
  if (!burg?.i || burg.removed) return null;

  const metersPerMapUnit = getMetersPerMapUnit();
  const population = rn((burg.population ?? 0) * worldContext.populationRate * worldContext.urbanization);
  const cityRadiusMeters = getCityRadiusMeters(population);
  const extentMeters = minmax(rn(cityRadiusMeters * 6), EXTENT_MIN_M, EXTENT_MAX_M);
  const half = extentMeters / 2;

  const toLocal = (x: number, y: number): [number, number] => [
    (x - burg.x) * metersPerMapUnit,
    (burg.y - y) * metersPerMapUnit
  ];

  const rivers = collectRivers(burg, toLocal, half, cityRadiusMeters);
  const roads = collectRoadEntries(burg, toLocal, half, cityRadiusMeters, metersPerMapUnit);
  const waterbody = collectWaterbody(burg, toLocal, half);
  const terrain = collectTerrain(burg, half, metersPerMapUnit);

  const roadLegCount = roads.filter(road => road.group !== "searoutes").length;
  const suggestedArchetype = inferArchetype({ burg, waterbody, rivers, roadLegCount, terrain });

  return {
    version: DESCRIPTOR_VERSION,
    burg: {
      id: burgId,
      name: burg.name ?? "",
      group: burg.group ?? "",
      type: burg.type ?? "Generic",
      seed: String(burg.MFCG ?? worldContext.seed + String(burg.i).padStart(4, "0")),
      population,
      capital: Boolean(burg.capital),
      port: Boolean(burg.port),
      citadel: Boolean(burg.citadel),
      plaza: Boolean(burg.plaza),
      walls: Boolean(burg.walls),
      temple: Boolean(burg.temple),
      shanty: Boolean(burg.shanty)
    },
    frame: {
      originMapUnits: [burg.x, burg.y],
      metersPerMapUnit: rn(metersPerMapUnit, 2),
      extentMeters,
      cityRadiusMeters
    },
    climate: {
      temperatureC: worldContext.grid.cells.temp[pack.cells.g[burg.cell]],
      biomeId: pack.cells.biomeCode[burg.cell]
    },
    terrain,
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
  return worldContext.distanceScale * (UNIT_METERS[unit] ?? 1000);
}

function getCityRadiusMeters(population: number): number {
  const areaHa = Math.max(population, 50) / WALLED_DENSITY_PER_HA;
  const radius = Math.sqrt((areaHa * 1e4) / Math.PI);
  return minmax(rn(radius), CITY_RADIUS_MIN_M, CITY_RADIUS_MAX_M);
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
  half: number
): { points: [number, number][]; widthsMeters: number[] }[] {
  const runs: { points: [number, number][]; widthsMeters: number[] }[] = [];
  let current: { points: [number, number][]; widthsMeters: number[] } | null = null;

  const pushPoint = (x: number, y: number, w: number) => {
    if (!current) current = { points: [], widthsMeters: [] };
    const last = current.points.at(-1);
    if (last && Math.abs(last[0] - x) < 0.01 && Math.abs(last[1] - y) < 0.01) return;
    current.points.push([rn(x, 1), rn(y, 1)]);
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

function clipPolylineToBox(points: [number, number][], half: number): [number, number][][] {
  const weighted = points.map(([x, y]) => ({ x, y, w: 0 }));
  return clipWeightedPolylineToBox(weighted, half).map(run => run.points);
}

interface PolylineApproach {
  dist: number;
  index: number;
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
    best = { dist, index: i, tangent: [tx, ty], crossZ, px, py };
  }
  return best;
}

function collectRivers(
  burg: Burg,
  toLocal: (x: number, y: number) => [number, number],
  half: number,
  cityRadiusMeters: number
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
    if (!river.cells?.length || !river.cells.some(cell => neighborhood.has(cell))) continue;

    const validPoints = river.points && river.points.length === river.cells.length ? river.points : null;
    const meandered = Rivers.addMeandering(river.cells, validPoints);
    if (meandered.length < 2) continue;

    const banks = Rivers.getRiverBanks(meandered, river.widthFactor ?? 1, river.sourceWidth ?? 0.1);
    let points: WeightedPoint[] = meandered.map(([x, y], index) => {
      const [lx, ly] = toLocal(x, y);
      const trueWidthKm = Rivers.getWidth(banks.widths[index] / 2);
      return { x: lx, y: ly, w: Math.max(rn(trueWidthKm * 1000, 1), RIVER_MIN_WIDTH_M) };
    });

    const rawApproach = closestApproachToOrigin(points);
    if (!rawApproach) continue;
    const rawOffsetMeters = rn(rawApproach.dist, 1);

    // FMG draws rivers exaggeratedly wide and shifts river burgs toward the
    // DRAWN bank, so the raw centerline distance of an on-cell river is a
    // drawn-width artifact (often ~1 km — far outside the city window). Rigidly
    // translate the centerline so the town center sits on the bank in
    // true-width space; shape, azimuth and bank side are preserved.
    const throughBurgCell = river.cells.includes(burg.cell);
    let snappedToBank = false;
    if (throughBurgCell) {
      const trueHalfWidth = points[rawApproach.index].w / 2;
      const target = trueHalfWidth + Math.min(RIVER_BANK_MARGIN_MAX_M, cityRadiusMeters * RIVER_BANK_MARGIN_RATIO);
      let ux: number;
      let uy: number;
      if (rawApproach.dist > 1) {
        ux = -rawApproach.px / rawApproach.dist;
        uy = -rawApproach.py / rawApproach.dist;
      } else {
        // centerline passes (almost) through the town center — pick the side the
        // same way FMG's shiftTowardsRiverBank does (cell parity)
        const side = burg.cell % 2 ? 1 : -1;
        ux = -rawApproach.tangent[1] * side;
        uy = rawApproach.tangent[0] * side;
      }
      const shift = rawApproach.dist - target;
      points = points.map(point => ({ x: point.x + ux * shift, y: point.y + uy * shift, w: point.w }));
      snappedToBank = true;
    }

    const approach = (snappedToBank ? closestApproachToOrigin(points) : null) ?? rawApproach;

    const segments = clipWeightedPolylineToBox(points, half);
    if (!segments.length) continue; // never enters the generation window

    const offsetMeters = rn(approach.dist, 1);
    results.push({
      riverId: river.i,
      name: river.name ?? "",
      type: river.type ?? "",
      widthMeters: points[approach.index].w,
      axisAzimuthDeg: azimuthDeg(approach.tangent[0], approach.tangent[1]),
      offsetMeters,
      offsetRatio: rn(offsetMeters / cityRadiusMeters, 2),
      cityBank: approach.crossZ > 0 ? "left" : "right",
      crossesSite: offsetMeters < cityRadiusMeters,
      throughBurgCell,
      rawOffsetMeters,
      snappedToBank,
      segments
    });
  }

  // Closest river first — the primary waterway for bridges and mills.
  results.sort((a, b) => a.offsetMeters - b.offsetMeters);
  return results;
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
    const index = route.points.findIndex(point => point[2] === burg.cell);
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

  const entries: BurgSiteRoadEntry[] = [];
  for (const { route, leg } of collectRouteLegs(burg)) {
    const localPoints = leg.map(([x, y]) => toLocal(x, y));

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
        nextBurg = {
          id: cellBurgId,
          name: target?.name ?? "",
          distanceMeters: rn(lengthMapUnits * metersPerMapUnit)
        };
        break;
      }
    }

    const clipped = clipPolylineToBox(localPoints, half);
    entries.push({
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

  return {
    kind,
    ...(waterFeature.name ? { name: waterFeature.name } : {}),
    ...(waterFeature.group ? { group: waterFeature.group } : {}),
    isPort: Boolean(burg.port),
    shoreAzimuthDeg: azimuthDeg(havenX, havenY),
    shoreline: clipPolylineToBox(ring, half)
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
