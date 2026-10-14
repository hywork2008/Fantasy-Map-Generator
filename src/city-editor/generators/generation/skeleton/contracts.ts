// Skeleton-first generation contracts (docs/city-editor/plan/skeleton-first-generation.md §4).
// K1–K5 decide the town's lines as vectors before any mesh exists.

import type { WallShape } from "../../../types/generation";
import type { Point } from "../../../types/geometry";

/** Water that no wall, road or building may enter: sea, lake, or a channel too wide to bridge. */
export interface SkeletonWater {
  kind: "sea" | "lake" | "channel";
  /** Closed ring, interior is water. */
  polygon: Point[];
}

/** A bridgeable river, already clipped to land. */
export interface SkeletonRiver {
  index: number;
  centerline: Point[];
  /** Largest half width along the river, metres. Conservative for clearances. */
  halfWidth: number;
}

export interface SkeletonRoad {
  /** Index in geo.importedRoads, independent of filtered skeleton road IDs. */
  sourceRoadIndex?: number;
  id: number;
  /** Core-side first, frame-side last. */
  path: Point[];
  /** An FMG road: its outer course is an input and is never rerouted by the skeleton. */
  fixed: boolean;
  /** The road leaves the town window over dry land (it was not cut short by water). */
  reachesFrame: boolean;
}

/** K1: everything the skeleton reads, normalised once per generation request. */
export interface SkeletonInputs {
  /** Half of the town window (`townExtentMeters / 2`). The skeleton stays inside it. */
  half: number;
  cellSize: number;
  core: Point;
  cityRadius: number;
  walls: boolean;
  walledAreaShare: number;
  water: SkeletonWater[];
  rivers: SkeletonRiver[];
  roads: SkeletonRoad[];
  /** FMG's certified bridges (`fixedCrossings.crossings`); a fixed road's bridge takes its skew from here. */
  fixedBridges: { point: Point; skewDegrees: number }[];
  /** Upper bound on a bridge's skew from `resolveBridgeSkewLimit`. */
  bridgeSkewLimit: number;
  /** `bastioned` is a candidate (age of exploration or later). */
  bastionEra: boolean;
  requiredExternalRoads: number;
  wallWidth: number;
  minGateSpacing: number;
}

/** K2: the built-up area as a star polygon around the core. */
export interface SkeletonCore {
  core: Point;
  urbanRadius: number;
  /** Radius per ray, limited by hard water (`rays.length` rays, evenly spaced from east, CCW). */
  rays: number[];
  urban: Point[];
  urbanArea: number;
  /** Bands of bridgeable rivers that skirt the town instead of passing through it
   * (course more than half the city radius from the core). The town and its wall
   * keep to their own side, as with hard water. */
  edgeRivers: { index: number; band: Point[] }[];
}

export interface SkeletonWall {
  shape: WallShape;
  sides?: number;
  /** Closed ring, counter-clockwise. */
  polygon: Point[];
  /** Ring vertex index pairs [i, i + 1] that cross a river at right angles (water gates).
   * `shared` > 1 when several channels (a braid, two mouths) pass under one segment,
   * which is then square to their mean flow rather than to each channel. */
  waterGates: { riverIndex: number; edge: number; point: Point; shared: number }[];
  /** `bastioned` only: middle of each curtain between bastions, where gates belong. */
  curtainMidpoints?: Point[];
}

export interface SkeletonGate {
  point: Point;
  /** Wall ring edge the gate sits on. */
  edge: number;
  /** Unit vector pointing out of the town. */
  outward: Point;
  roadIds: number[];
}

export interface SkeletonBridge {
  roadId: number;
  riverIndex: number;
  point: Point;
  skewDegrees: number;
  /** The road was bent locally to meet the skew limit. */
  straightened: boolean;
}

/** K4 result for one road. `path` may differ from the input near gates and bridges. */
export interface SkeletonRoute {
  id: number;
  path: Point[];
  gateIndex: number | null;
  reachesFrame: boolean;
  /** A synthetic road with no usable gate site (e.g. only sea beyond the curtain) is not built. */
  dropped: boolean;
}

export interface Skeleton {
  attempt: number;
  core: SkeletonCore;
  wall: SkeletonWall | null;
  routes: SkeletonRoute[];
  gates: SkeletonGate[];
  bridges: SkeletonBridge[];
}

export type SkeletonFailureReason =
  | "core-in-water"
  | "urban-area-too-small"
  | "wall-shape-invalid"
  | "wall-river-parallel"
  | "wall-river-crossing"
  | "bridge-skew"
  | "gate-unreachable-inside"
  | "gate-unreachable-outside"
  | "too-few-external-roads";

export interface SkeletonFailure {
  reason: SkeletonFailureReason;
  message: string;
  details?: string[];
}

export interface SkeletonMeshLine {
  id: string;
  kind: "wall" | "bank" | "water" | "road" | "river";
  points: Point[];
  closed: boolean;
}
export interface SkeletonMeshChain extends SkeletonMeshLine {
  /** Ordered in the direction of points; closed chains return to their first vertex. */
  edges: import("../../../types/document").EdgeRef[];
  /** Separate connected runs when a clipped input leaves and re-enters the frame. */
  runs: import("../../../types/document").EdgeRef[][];
}
