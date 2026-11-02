import { growPlanBox, type PlanBox, planBoxCorners } from "../../../buildings/placementContract";
import {
  RETAINING_MAX_METERS,
  SMALL_LOT_MAX_M2,
  STEEP_BUILDING_SLOPE,
  UNBUILDABLE_SLOPE
} from "../terrainField/constants";
import type { PlotIndex } from "./plotIndex";
import { orientedBoxesOverlap } from "./sat";

/** Provisional masonry thickness. A slope that would reach a neighbour narrows to this. */
export const RETAINING_WALL_THICKNESS_METERS = 0.8;

/** Horizontal run per metre of rise for a fill slope (gradient 1:2). */
export const SLOPE_RUN_PER_RISE = 2;

export type PlotEdge = { kind: "wall" } | { kind: "slope"; runMeters: number };

export type PlacementReject = "overlap" | "slope" | "retaining" | "water" | "cliff" | "way";

export interface PlacementCandidate {
  id: string;
  box: PlanBox;
  /** Rise/run of the ground under the footprint centre. */
  slope: number;
  /** Building area, before the plot margin. Steep ground only takes a small building. */
  areaM2: number;
  /** Largest absolute difference between the plot level and the ground on the outline. */
  edgeDropMeters: number;
  onWater?: boolean;
  onCliff?: boolean;
  onWay?: boolean;
}

export interface PlacementDecision {
  ok: boolean;
  reason?: PlacementReject;
  edge: PlotEdge;
}

function hits(box: PlanBox, others: readonly { id: string; box: PlanBox }[], selfId: string): boolean {
  const corners = planBoxCorners(box);
  for (const other of others) {
    if (other.id === selfId) continue;
    if (orientedBoxesOverlap(corners, planBoxCorners(other.box))) return true;
  }
  return false;
}

/**
 * Overlap, slope class, retaining height, water, cliff and way.
 * A fill slope that reaches another plot becomes a wall. A wall that still reaches is rejected.
 */
export function validatePlacement(candidate: PlacementCandidate, index: PlotIndex): PlacementDecision {
  const slopeRun = Math.max(0, candidate.edgeDropMeters) * SLOPE_RUN_PER_RISE;
  const reach = Math.max(slopeRun, RETAINING_WALL_THICKNESS_METERS);
  const nearby = index.search(growPlanBox(candidate.box, reach));
  const footprintOverlap = hits(candidate.box, nearby, candidate.id);
  const slopeReaches = slopeRun > 0 && hits(growPlanBox(candidate.box, slopeRun), nearby, candidate.id);
  const wallReaches = hits(growPlanBox(candidate.box, RETAINING_WALL_THICKNESS_METERS), nearby, candidate.id);
  const edge: PlotEdge = slopeReaches ? { kind: "wall" } : { kind: "slope", runMeters: slopeRun };
  if (footprintOverlap || (edge.kind === "wall" && wallReaches)) return { ok: false, reason: "overlap", edge };
  if (candidate.slope > UNBUILDABLE_SLOPE) return { ok: false, reason: "slope", edge };
  if (candidate.slope > STEEP_BUILDING_SLOPE && candidate.areaM2 > SMALL_LOT_MAX_M2)
    return { ok: false, reason: "slope", edge };
  if (edge.kind === "wall" && candidate.edgeDropMeters > RETAINING_MAX_METERS + 1e-6)
    return { ok: false, reason: "retaining", edge };
  if (candidate.onWater) return { ok: false, reason: "water", edge };
  if (candidate.onCliff) return { ok: false, reason: "cliff", edge };
  if (candidate.onWay) return { ok: false, reason: "way", edge };
  return { ok: true, edge };
}
