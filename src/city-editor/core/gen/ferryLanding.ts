import { flowingRivers } from "../riverFlow";
import type { CityDocument, Point } from "../types";
import { documentWaterTest } from "../waterGeometry";
import { nearestOnPolyline } from "./geom";

type RiverConnection = NonNullable<CityDocument["riverConnections"]>[number];

/** Ground kept for a ferry landing: the jetty, moored boats and the people and
 * carts waiting on the bank. */
export const FERRY_LANDING_RESERVE_METERS = 24;
/** Half-width of the towpath a boat is hauled up after drifting downstream. */
const TOWPATH_HALF_WIDTH_METERS = 6;
/** A rowed or poled ferry through the water (m/s). */
const BOAT_SPEED_METERS_PER_SECOND = 1;
/** Used when FMG gives no surface velocity. */
const DEFAULT_CURRENT_METERS_PER_SECOND = 0.5;

/**
 * A ferry heads straight across, as a bridge does, rather than fighting the
 * current. The current carries it downstream of the far landing, and it is
 * hauled back up along the bank. The return crossing does the same on this
 * bank, so the two crossings meet mid-river in a figure of eight. The current
 * is slack near the banks, so each crossing leaves and arrives square to the
 * bank and drifts in mid-stream.
 */
export interface FerryPlan {
  /** Town-bank landing. */
  landing: Point;
  /** Far-bank landing, square across the river from `landing`. */
  farLanding: Point;
  farInFrame: boolean;
  /** Unit vector across the river, from `landing` toward the far bank. */
  across: Point;
  /** `landing` → far bank downstream of `farLanding`. */
  outbound: Point[];
  /** `farLanding` → town bank downstream of `landing`. */
  inbound: Point[];
  /** Hauled upstream along each bank to its landing. */
  townTow: [Point, Point];
  farTow: [Point, Point];
}

const plans = new WeakMap<RiverConnection, { document: CityDocument; plan: FerryPlan | null }>();

const isBridge = (connection: RiverConnection) =>
  connection.crossing.kind === "fixedBridge" || connection.crossing.kind === "movableBridge";

/** The figure-of-eight crossing for a ferry, or null for a bridge or a river
 * with no known flow. */
export function ferryPlan(document: CityDocument, connection: RiverConnection): FerryPlan | null {
  const cached = plans.get(connection);
  if (cached?.document === document) return cached.plan;
  const plan = isBridge(connection) ? null : planFerry(document, connection);
  plans.set(connection, { document, plan });
  return plan;
}

function planFerry(document: CityDocument, connection: RiverConnection): FerryPlan | null {
  const landing = connection.banks[0];
  const test = documentWaterTest(document);
  const wet = (p: Point) =>
    test([
      [p[0] - 0.2, p[1] - 0.2],
      [p[0] + 0.2, p[1] - 0.2],
      [p[0], p[1] + 0.2]
    ]);
  // Downstream along the nearest centreline.
  let flow: Point | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const river of flowingRivers(document)) {
    const near = nearestOnPolyline(landing, river.points);
    if (near.dist >= best) continue;
    const i = Math.min(Math.max(near.segIndex, 0), river.points.length - 2);
    const a = river.points[i],
      b = river.points[i + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) continue;
    best = near.dist;
    flow = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  }
  if (!flow) return null;
  const add = (p: Point, v: Point, k: number): Point => [p[0] + v[0] * k, p[1] + v[1] * k];
  // Across the river: the side of the landing that is water.
  let across: Point = [-flow[1], flow[0]];
  const far = connection.banks[1];
  if (
    wet(add(landing, across, 8)) === wet(add(landing, across, -8))
      ? (far[0] - landing[0]) * across[0] + (far[1] - landing[1]) * across[1] < 0
      : !wet(add(landing, across, 8))
  )
    across = [-across[0], -across[1]];
  // Far bank square across. Outside the surveyed water's coverage counts as
  // wet, so fall back on the crossing width there.
  const width = Math.max(connection.crossing.widthMeters, Math.hypot(far[0] - landing[0], far[1] - landing[1]), 20);
  let farLanding = add(landing, across, width);
  for (let s = 4; s <= width * 1.5; s += 4) {
    const p = add(landing, across, s);
    if (wet(p)) continue;
    farLanding = shore(add(landing, across, s - 4), p, wet);
    break;
  }
  const span = Math.hypot(farLanding[0] - landing[0], farLanding[1] - landing[1]);
  const current = connection.currentMetersPerSecond ?? DEFAULT_CURRENT_METERS_PER_SECOND;
  const drift = Math.min(Math.max((current * span) / BOAT_SPEED_METERS_PER_SECOND, 6), span * 0.4);
  const townArrival = bankNear(add(landing, flow, drift), across, wet);
  const farArrival = bankNear(add(farLanding, flow, drift), [-across[0], -across[1]], wet);
  const half = document.frame.extentMeters / 2;
  return {
    landing: [...landing],
    farLanding,
    farInFrame: Math.max(Math.abs(farLanding[0]), Math.abs(farLanding[1])) <= half - 1,
    across,
    outbound: cubic(landing, add(landing, across, span / 3), add(farArrival, across, -span / 3), farArrival),
    inbound: cubic(farLanding, add(farLanding, across, -span / 3), add(townArrival, across, span / 3), townArrival),
    townTow: [townArrival, [...landing]],
    farTow: [farArrival, farLanding]
  };
}

/** Dry side of the shore between a wet and a dry point. */
function shore(wetPoint: Point, dryPoint: Point, wet: (p: Point) => boolean): Point {
  let lo = wetPoint,
    hi = dryPoint;
  for (let i = 0; i < 14; i++) {
    const mid: Point = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    if (wet(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** The bank nearest `p` on the line through it, with `toWater` pointing into the river. */
function bankNear(p: Point, toWater: Point, wet: (p: Point) => boolean): Point {
  const startWet = wet(p);
  const step = startWet ? -2 : 2;
  let previous = p;
  for (let i = 1; i <= 100; i++) {
    const next: Point = [p[0] + toWater[0] * step * i, p[1] + toWater[1] * step * i];
    if (wet(next) !== startWet) return startWet ? shore(previous, next, wet) : shore(next, previous, wet);
    previous = next;
  }
  return p;
}

function cubic(a: Point, b: Point, c: Point, d: Point, samples = 24): Point[] {
  return Array.from({ length: samples + 1 }, (_, i): Point => {
    const t = i / samples,
      u = 1 - t;
    return [
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]
    ];
  });
}

/** Landings of every ferry crossing on the map: the town landing, and the far
 * one when it lies inside the frame. A bridge has no landing. */
export function ferryLandings(document: CityDocument): Point[] {
  return (document.riverConnections ?? []).flatMap(connection => {
    if (isBridge(connection)) return [];
    const plan = ferryPlan(document, connection);
    if (!plan) return connection.farRoad.length ? connection.banks : [connection.banks[0]];
    return plan.farInFrame ? [plan.landing, plan.farLanding] : [plan.landing];
  });
}

function octagon([x, y]: Point, r: number): Point[] {
  return Array.from({ length: 8 }, (_, i): Point => {
    const angle = (i * Math.PI) / 4 + Math.PI / 8;
    return [x + Math.cos(angle) * r, y + Math.sin(angle) * r];
  });
}

function corridor([a, b]: [Point, Point], half: number): Point[] | null {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 1) return null;
  const nx = (-(b[1] - a[1]) / length) * half,
    ny = ((b[0] - a[0]) / length) * half;
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny]
  ];
}

/** Ground around each ferry landing and along its towpath. Riverside works
 * (mills, bleaching fields, tanneries, yards, piers) go elsewhere so the
 * landing stays usable. */
export function ferryLandingReserves(document: CityDocument): Point[][] {
  const reserves = ferryLandings(document).map(p => octagon(p, FERRY_LANDING_RESERVE_METERS));
  for (const connection of document.riverConnections ?? []) {
    const plan = ferryPlan(document, connection);
    if (!plan) continue;
    for (const tow of plan.farInFrame ? [plan.townTow, plan.farTow] : [plan.townTow]) {
      const ring = corridor(tow, TOWPATH_HALF_WIDTH_METERS);
      if (ring) reserves.push(ring);
    }
  }
  return reserves;
}
