import { sum } from "d3";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { MilitaryRegiment } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { findPath, minmax } from "../utils";
import {
  analyzeFrontiers,
  analyzeSeaFrontiers,
  type FrontierSegment,
  mergeFrontiers,
  pickPrimaryFrontier
} from "./frontierAnalysis";
import { buildLandRouteGraph, findLandRoutePath, type LandRouteGraph } from "./landRouteGraph";
import { buildSeaRouteGraph, findSeaRouteDistance, findSeaRoutePath, type SeaRouteGraph } from "./seaRouteGraph";

/**
 * Day-granular regiment movement (docs/plan/military-movement.md Phase 2). Deliberately kept
 * out of Military.generate(): that function fully rebuilds `state.military` from scratch every
 * time it runs (on every bordersChanged tick, not just once at map generation), so it has no
 * stable regiment identity to advance incrementally from. This module owns physical position
 * (`cell`/`x`/`y`/`bx`/`by`) exclusively from the moment a regiment first spawns — generate()
 * never touches it again after the initial anchor placement.
 *
 * Replaces the old instant-teleport `redistributeGarrisons`/`redistributeFleet` (removed from
 * military-generator.ts) with: pick a destination the same way those functions picked a final
 * position, then spend a per-tick distance budget (elapsed days × speed) walking a real path
 * toward it instead of snapping there in one step.
 */

/** How far (0..1) a state's regiments are pulled from their current position toward a hostile frontier's garrison stance point (not all the way to the border itself). Same constant/meaning as the old redistributeGarrisons/Fleet. */
const GARRISON_PULL_STRENGTH = 0.5;

/** Foot infantry march pace — draft baseline, docs/plan/military-movement.md §4.1 ("叩き台"). */
const FOOT_SPEED_KM_PER_DAY = 28;

/** Cavalry's short-burst pace — draft baseline, same §4.1 answer. */
const CAVALRY_BURST_SPEED_KM_PER_DAY = 56;

/**
 * Cavalry doesn't sustain its burst pace over long hauls — §4.2's answer: "最大で3日進んで1,2日休む...
 * 長距離の素早い移動を考慮しない". Modeled as one averaged speed over a burst-then-rest cycle rather than
 * a literal day-by-day state machine: advanceTime's deltaYears can span many years in a single call, so
 * simulating individual days would be both wasteful and no more meaningful at this strategic scale.
 * During the "rest" days the unit still moves at foot pace (grazing/resting horses, not frozen in place).
 */
const CAVALRY_BURST_DAYS = 3;
const CAVALRY_REST_DAYS = 1.5;
const CAVALRY_EFFECTIVE_SPEED_KM_PER_DAY =
  (CAVALRY_BURST_SPEED_KM_PER_DAY * CAVALRY_BURST_DAYS + FOOT_SPEED_KM_PER_DAY * CAVALRY_REST_DAYS) /
  (CAVALRY_BURST_DAYS + CAVALRY_REST_DAYS);

/** Fleet pace — draft placeholder (no charted-lane speed was specified in the plan doc yet). */
const FLEET_SPEED_KM_PER_DAY = 50;

/** Speed penalty for marching cross-country with no charted road/trail (§1.2's fallback option (b)). */
const OFF_ROAD_SPEED_MULTIPLIER = 0.6;

/** Miles-per-km, applied only when the user's chosen distanceUnit isn't "km" (§1.1's conversion note). */
const KM_TO_MILES = 0.621371;

function kmToDistanceUnit(km: number, distanceUnit: string): number {
  return distanceUnit === "mi" ? km * KM_TO_MILES : km;
}

/** Map-unit distance this regiment can cover per day, given its type/off-road state and the map's distance scale. */
export function dailySpeedMapUnits(r: MilitaryRegiment, worldContext: WorldContext): number {
  const distanceUnit = useOptionsState.getState().distanceUnit || "km";
  const distanceScale = worldContext.distanceScale || 1;
  const baseKmPerDay = r.n
    ? FLEET_SPEED_KM_PER_DAY
    : r.type === "mounted"
      ? CAVALRY_EFFECTIVE_SPEED_KM_PER_DAY
      : FOOT_SPEED_KM_PER_DAY;
  const speedMapUnits = kmToDistanceUnit(baseKmPerDay, distanceUnit) / distanceScale;
  return r.offRoad ? speedMapUnits * OFF_ROAD_SPEED_MULTIPLIER : speedMapUnits;
}

/** Every state's own land cells, grouped by landmass, so a garrison destination snaps back onto territory the state actually owns. */
function buildLandCellsByStateAndLandmass(pack: PackedGraph): Map<number, Map<number, number[]>> {
  const { cells } = pack;
  const result = new Map<number, Map<number, number[]>>();
  for (const i of cells.i) {
    if (cells.h[i] < 20) continue;
    const owner = cells.state[i];
    if (!owner) continue;
    if (!result.has(owner)) result.set(owner, new Map());
    const byLandmass = result.get(owner)!;
    const landmass = cells.f[i];
    if (!byLandmass.has(landmass)) byLandmass.set(landmass, []);
    byLandmass.get(landmass)!.push(i);
  }
  return result;
}

/** Dense cells.c BFS/Dijkstra fallback for land cells with no charted road/trail (§1.2 option (a)). Avoids open water; otherwise unrestricted (crossing hostile territory is the point — it's an invasion). */
function findOffRoadLandPath(pack: PackedGraph, start: number, end: number): number[] | null {
  if (start === end) return [start];
  const { cells } = pack;
  const getCost = (current: number, next: number) => {
    if (cells.h[next] < 20) return Infinity;
    return Math.hypot(cells.p[next][0] - cells.p[current][0], cells.p[next][1] - cells.p[current][1]);
  };
  return findPath(start, id => id === end, getCost, pack);
}

function clearMarchOrder(r: MilitaryRegiment): void {
  if (r.destinationCell === undefined && !r.path) return;
  r.destinationCell = undefined;
  r.path = undefined;
  r.pathIndex = undefined;
  r.edgeProgress = undefined;
  r.offRoad = undefined;
}

/** Ports redistributeGarrisons's old target-selection (pull toward the primary threatened frontier, proportional to its share of total threat, snapped onto owned land) into a march order instead of an instant reposition. */
function ensureGarrisonMarchOrder(
  r: MilitaryRegiment,
  segments: FrontierSegment[],
  pack: PackedGraph,
  landRouteGraph: LandRouteGraph,
  landCellsByStateAndLandmass: Map<number, Map<number, number[]>>
): void {
  const { cells } = pack;
  const landmass = cells.f[r.cell];
  const localSegments = segments.filter(seg => seg.landmass === landmass);
  if (!localSegments.length) {
    clearMarchOrder(r);
    return;
  }

  const totalWeight = sum(localSegments.map(seg => seg.threatWeight));
  if (!totalWeight) {
    clearMarchOrder(r);
    return;
  }

  const target = pickPrimaryFrontier(r.x, r.y, localSegments);
  if (!target) {
    clearMarchOrder(r);
    return;
  }

  const pull = minmax(target.threatWeight / totalWeight, 0, 1) * GARRISON_PULL_STRENGTH;
  const pulledX = r.x + (target.cx - r.x) * pull;
  const pulledY = r.y + (target.cy - r.y) * pull;

  const ownLandCells = landCellsByStateAndLandmass.get(r.state)?.get(landmass);
  if (!ownLandCells?.length) {
    clearMarchOrder(r);
    return;
  }

  let destinationCell = r.cell;
  let bestDist = Infinity;
  for (const c of ownLandCells) {
    const dx = cells.p[c][0] - pulledX;
    const dy = cells.p[c][1] - pulledY;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      destinationCell = c;
    }
  }

  if (destinationCell === r.cell) {
    clearMarchOrder(r);
    return;
  }
  if (r.destinationCell === destinationCell && r.path && r.pathIndex !== undefined) return; // already marching there

  const charted = findLandRoutePath(landRouteGraph, r.cell, destinationCell);
  const path = charted ?? findOffRoadLandPath(pack, r.cell, destinationCell);
  if (!path || path.length < 2) {
    clearMarchOrder(r);
    return;
  }

  r.destinationCell = destinationCell;
  r.path = path;
  r.pathIndex = 0;
  r.edgeProgress = 0;
  r.offRoad = !charted;
}

/** Ports redistributeFleet's old target-selection (pull toward the nearest reachable enemy port, along the charted sea route) into a march order instead of an instant reposition. */
function ensureFleetMarchOrder(
  r: MilitaryRegiment,
  segments: FrontierSegment[],
  pack: PackedGraph,
  seaRouteGraph: SeaRouteGraph
): void {
  const ownLandmass = pack.cells.f[r.cell];
  const localSegments = segments.filter(seg => seg.origin === "sea" && seg.landmass === ownLandmass);
  if (!localSegments.length) {
    clearMarchOrder(r);
    return;
  }

  const totalWeight = sum(localSegments.map(seg => seg.threatWeight));
  if (!totalWeight) {
    clearMarchOrder(r);
    return;
  }

  const target = pickPrimaryFrontier(r.x, r.y, localSegments);
  if (!target) {
    clearMarchOrder(r);
    return;
  }

  let enemyPortCell = -1;
  let bestEnemyDist = Infinity;
  for (const b of pack.burgs) {
    if (!b.i || b.removed || b.state !== target.neighborState || !b.port) continue;
    const d = findSeaRouteDistance(seaRouteGraph, r.cell, b.cell);
    if (d !== null && d < bestEnemyDist) {
      bestEnemyDist = d;
      enemyPortCell = b.cell;
    }
  }
  if (enemyPortCell === -1) {
    clearMarchOrder(r);
    return;
  }

  const fullPath = findSeaRoutePath(seaRouteGraph, r.cell, enemyPortCell);
  if (!fullPath || fullPath.length < 2) {
    clearMarchOrder(r);
    return;
  }

  const pull = minmax(target.threatWeight / totalWeight, 0, 1) * GARRISON_PULL_STRENGTH;
  const stepIndex = Math.round(pull * (fullPath.length - 1));
  const destinationCell = fullPath[stepIndex];

  if (destinationCell === r.cell) {
    clearMarchOrder(r);
    return;
  }
  if (r.destinationCell === destinationCell && r.path && r.pathIndex !== undefined) return; // already marching there

  r.destinationCell = destinationCell;
  r.path = fullPath.slice(0, stepIndex + 1); // march only up to the garrison stance point, not all the way to the enemy's own port
  r.pathIndex = 0;
  r.edgeProgress = 0;
  r.offRoad = false;
}

/** Spends `budget` map units walking `r` along its current path, updating cell/x/y/bx/by, and clears the march order once the destination is reached. No-op if the regiment has no active path. */
export function advanceAlongPath(pack: PackedGraph, r: MilitaryRegiment, budget: number): void {
  if (!r.path || r.pathIndex === undefined || budget <= 0) return;
  const { cells } = pack;
  let remaining = budget;
  let progress = r.edgeProgress ?? 0;

  while (remaining > 0 && r.pathIndex < r.path.length - 1) {
    const fromCell = r.path[r.pathIndex];
    const toCell = r.path[r.pathIndex + 1];
    const edgeLength = Math.hypot(cells.p[toCell][0] - cells.p[fromCell][0], cells.p[toCell][1] - cells.p[fromCell][1]);
    const remainingOnEdge = edgeLength - progress;

    if (remainingOnEdge <= remaining) {
      remaining -= Math.max(remainingOnEdge, 0);
      r.pathIndex += 1;
      r.cell = toCell;
      progress = 0;
    } else {
      progress += remaining;
      remaining = 0;
    }
  }

  if (r.pathIndex >= r.path.length - 1) {
    const finalCell = r.path[r.path.length - 1];
    r.cell = finalCell;
    r.x = cells.p[finalCell][0];
    r.y = cells.p[finalCell][1];
    clearMarchOrder(r);
  } else {
    r.edgeProgress = progress;
    const fromCell = r.path[r.pathIndex];
    const toCell = r.path[r.pathIndex + 1];
    const edgeLength = Math.hypot(cells.p[toCell][0] - cells.p[fromCell][0], cells.p[toCell][1] - cells.p[fromCell][1]);
    const frac = edgeLength > 0 ? progress / edgeLength : 0;
    r.x = cells.p[fromCell][0] + (cells.p[toCell][0] - cells.p[fromCell][0]) * frac;
    r.y = cells.p[fromCell][1] + (cells.p[toCell][1] - cells.p[fromCell][1]) * frac;
  }

  r.bx = r.x;
  r.by = r.y;
}

/**
 * Advances every state's regiments by `deltaYears` worth of marching (called from a
 * per-tick hook, e.g. Nobility's registerTimeTickHook — unlike Military.generate(), this
 * should run every tick regardless of bordersChanged, since marching is continuous).
 * Returns true if any regiment's position actually changed, so the caller knows whether to
 * re-render the military layer.
 */
export function advanceAllRegimentMovement(pack: PackedGraph, worldContext: WorldContext, deltaYears: number): boolean {
  if (deltaYears <= 0) return false;

  const currentYear = worldContext.options.year ?? 0;
  const seaRouteGraph = buildSeaRouteGraph(pack);
  const landRouteGraph = buildLandRouteGraph(pack);
  const frontiers = mergeFrontiers(
    analyzeFrontiers(pack, currentYear),
    analyzeSeaFrontiers(pack, seaRouteGraph, currentYear)
  );
  const landCellsByStateAndLandmass = buildLandCellsByStateAndLandmass(pack);
  const days = deltaYears * 365;

  let anyMoved = false;

  for (const state of pack.states) {
    if (!state.i || state.removed || !state.military?.length) continue;
    const segments = frontiers.get(state.i) ?? [];

    for (const r of state.military) {
      if (r.isCapitalGuard) continue;

      if (r.n) ensureFleetMarchOrder(r, segments, pack, seaRouteGraph);
      else ensureGarrisonMarchOrder(r, segments, pack, landRouteGraph, landCellsByStateAndLandmass);

      if (!r.path || r.pathIndex === undefined) continue;

      const budget = dailySpeedMapUnits(r, worldContext) * days;
      const beforeX = r.x;
      const beforeY = r.y;
      advanceAlongPath(pack, r, budget);
      if (r.x !== beforeX || r.y !== beforeY) anyMoved = true;
    }
  }

  return anyMoved;
}
