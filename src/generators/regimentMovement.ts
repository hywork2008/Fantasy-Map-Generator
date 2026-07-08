import { sum } from "d3";
import { appServices } from "../context/appServices";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { Burg, MilitaryRegiment, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { findPath, minmax } from "../utils";
import { isRegimentLockedForBattle } from "./battleLock";
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

/** map units — within this radius a marching regiment always spots a nearby hostile regiment directly (§1.4/§4.5). */
const VISUAL_DETECTION_RADIUS = 400;

/**
 * map units — beyond VISUAL_DETECTION_RADIUS but within this, a city's spies are assumed to
 * report enemy troop movements at ESPIONAGE_DETECTION_CHANCE odds each tick (§4.5's answer:
 * abstracted, high success rate, so hostile regiments converge fairly reliably even outside
 * visual range). Beyond this radius, no report at all — spies cover their own region, not a
 * distant front they have no presence in.
 */
const ESPIONAGE_AWARENESS_RADIUS = 1500;
const ESPIONAGE_DETECTION_CHANCE = 0.85;

/** Must have at least this power edge over a spotted enemy to break off the current march and intercept it instead. */
const ENGAGE_POWER_RATIO = 1.2;

/** Must be outmatched by at least this much to abandon the current march and retreat into the nearest own city instead. */
const RETREAT_POWER_RATIO = 1.5;

/**
 * Map units — a chase-to-intercept reaction order (below) is only issued while the target is
 * within this distance of the regiment's own nearest burg. Repelling an incursion or striking a
 * threat right at the border is fair game; chasing a fleeing enemy deep into their own territory
 * alone is not (docs/plan/military-time-advance-review-findings.md §1.4) — same scale as
 * VISUAL_DETECTION_RADIUS, since beyond "nearby" the regiment shouldn't be initiating a chase at
 * all. A deliberately reckless "hot-headed commander" archetype that ignores this leash may come
 * later.
 */
const MAX_PURSUIT_DEPTH_MAP_UNITS = VISUAL_DETECTION_RADIUS;

/**
 * Smallest organizational sub-unit (docs/plan/military-movement.md §4 answer 3 — "150人ほどのグループが
 * 最小単位で良い", not tied to real-world rank names). Also the floor for any detachment split off a
 * larger field army in dynamic hierarchy mode (Phase 4).
 */
export const BASE_UNIT_TROOPS = 150;

/** A field army must keep at least this many troops of its own after peeling off a detachment — splitting must never gut the main body. */
const MIN_PARENT_TROOPS_AFTER_SPLIT = BASE_UNIT_TROOPS * 2;

/** Share of the parent's current troops sent off as a detachment (subject to the MIN_PARENT_TROOPS_AFTER_SPLIT floor above). */
const DETACHMENT_SHARE = 0.25;

/**
 * A second detected hostile must be at least this far (map units) from the nearest one before it counts
 * as a distinct threat worth peeling off a detachment for, rather than something the regiment's existing
 * march order already deals with just by closing in on the nearest enemy.
 */
const SECOND_THREAT_SEPARATION = 250;

/** How close a detachment must get back to its parent before the two re-merge into one regiment. */
const MERGE_DISTANCE_MAP_UNITS = 30;

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

/**
 * Route-graph cells where 3+ charted road/trail edges meet — a fork that can't be walked around,
 * unlike a plain degree-2 waypoint along a single road. These are de-facto chokepoints even
 * without a settlement on them: garrison one, and an enemy following that road network has no way
 * around it (docs/plan/military-defense.md). Candidate defense nodes alongside burgs, see
 * `buildDefenseNodesByStateAndLandmass`.
 */
function identifyRouteJunctions(landRouteGraph: LandRouteGraph): Set<number> {
  const junctions = new Set<number>();
  for (const [cellId, neighbors] of landRouteGraph.adjacency) {
    if (neighbors.size >= 3) junctions.add(cellId);
  }
  return junctions;
}

/**
 * Every state's defensible chokepoints — its own burgs, plus any route junction it holds — grouped
 * by landmass, the same shape as `buildLandCellsByStateAndLandmass`. `ensureGarrisonMarchOrder`
 * prefers marching a garrison onto one of these real, blockable places instead of an arbitrary
 * owned field cell; it falls back to the full owned-land set when a state holds none on a given
 * landmass (e.g. no charted routes and no burgs nearby yet).
 */
function buildDefenseNodesByStateAndLandmass(
  pack: PackedGraph,
  routeJunctions: Set<number>
): Map<number, Map<number, number[]>> {
  const { cells, burgs } = pack;
  const result = new Map<number, Map<number, number[]>>();

  const addNode = (state: number, landmass: number, cell: number) => {
    if (!result.has(state)) result.set(state, new Map());
    const byLandmass = result.get(state)!;
    if (!byLandmass.has(landmass)) byLandmass.set(landmass, []);
    byLandmass.get(landmass)!.push(cell);
  };

  for (const b of burgs) {
    if (!b.i || b.removed || !b.state) continue;
    addNode(b.state, cells.f[b.cell], b.cell);
  }
  for (const cell of routeJunctions) {
    const owner = cells.state[cell];
    if (!owner) continue;
    addNode(owner, cells.f[cell], cell);
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

/**
 * Plans a march to `destinationCell` (charted road/trail preferred, off-road BFS fallback) and
 * commits it to `r`, unless already marching there. Shared tail for both the frontier-pull
 * garrison logic below and the reaction layer's engage/retreat destinations, so there's one
 * path-planning implementation instead of two near-identical copies.
 */
function planLandMarchOrder(
  r: MilitaryRegiment,
  destinationCell: number,
  pack: PackedGraph,
  landRouteGraph: LandRouteGraph
): void {
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

  const oldNextCell =
    r.path && r.pathIndex !== undefined && r.pathIndex < r.path.length - 1 ? r.path[r.pathIndex + 1] : undefined;

  r.destinationCell = destinationCell;
  r.path = path;
  r.pathIndex = 0;

  // If the new path starts by walking along the exact same edge we are currently on, preserve our progress
  if (oldNextCell !== undefined && path.length > 1 && path[1] === oldNextCell) {
    // leave r.edgeProgress as is
  } else {
    r.edgeProgress = 0;
  }

  r.offRoad = !charted;
}

/** map units — if a garrison regiment's newly-recomputed pull target is still about this close to its current destination, keep marching there instead of replanning. A tiny threatWeight jitter between ticks otherwise flips the nearest-owned-cell pick to a neighboring cell every tick, resetting `edgeProgress` in a loop (docs/debug/0708-military-routes.md). */
const GARRISON_DESTINATION_STABILITY_RADIUS = 60;

/**
 * map units — how far past the current threatened frontier point a reclaimable enclave may sit
 * and still count as "ours to patrol back into". Without this cap, `Burg.stateHistory` alone can
 * qualify a neighbor's *entire current territory* (e.g. after a state split/reconquest long ago)
 * as a reclaim target, sending patrols on unbounded marches deep into what is now the neighbor's
 * legitimate heartland — the "leaves home and never comes back" bug (docs/reviews/0709-military-
 * passing-capture.md). Scaled a bit past MAX_PURSUIT_DEPTH_MAP_UNITS: an enclave is a static
 * target (unlike a fleeing enemy regiment), so a slightly deeper reach is fine, but it must still
 * be anchored to the actual border, not the map at large.
 */
const MAX_RECLAIM_DEPTH_MAP_UNITS = MAX_PURSUIT_DEPTH_MAP_UNITS * 1.5;

/**
 * `neighborState`'s burgs on `landmass` that `ownState` used to own (per `Burg.stateHistory`) —
 * i.e. a lost enclave, not the neighbor's legitimate mainland. Added as extra destination
 * candidates in `ensureGarrisonMarchOrder` so a state's own patrols actually walk into (and, via
 * marchCapture.ts's `onCellEntered` hook, retake) territory the enemy captured and then marched
 * away from, instead of stopping dead at the border forever (see docs/debug — an occupied
 * enclave otherwise never gets reclaimed once the occupying force leaves). `anchorX/anchorY` is
 * the frontier's threat-weighted border point (`target.cx/cy` in the caller) — only enclaves
 * within MAX_RECLAIM_DEPTH_MAP_UNITS of it qualify, see that constant's doc comment.
 */
function reclaimableEnemyCells(
  pack: PackedGraph,
  ownState: number,
  neighborState: number,
  landmass: number,
  anchorX: number,
  anchorY: number
): number[] {
  const { cells, burgs } = pack;
  const result: number[] = [];
  for (const b of burgs) {
    if (!b.i || b.removed || b.state !== neighborState) continue;
    if (cells.f[b.cell] !== landmass) continue;
    if (!b.stateHistory?.includes(ownState)) continue;
    if (Math.hypot(b.x - anchorX, b.y - anchorY) > MAX_RECLAIM_DEPTH_MAP_UNITS) continue;
    result.push(b.cell);
  }
  return result;
}

/**
 * True if `burg` is `ownState`'s own historically-owned city (`Burg.stateHistory`) whose every
 * land neighbor is currently `ownState`'s own territory — an isolated domestic pocket a raiding
 * party captured and marched away from (docs/plan/military-defense.md), not a genuinely
 * contested border town (which would still have at least one enemy-owned neighbor, and so is
 * handled by `reclaimableEnemyCells`/`ensureGarrisonMarchOrder` instead). Exported so Nobility's
 * homeRecapture.ts can apply this same "is this a domestic matter" test when a marching regiment
 * actually arrives — this Generator module stays ignorant of capture/diplomacy rules themselves,
 * it only exposes the detection.
 */
export function isOccupiedHomeBurg(pack: PackedGraph, burg: Burg, ownState: number): boolean {
  if (!burg.i || burg.removed || burg.state === ownState) return false;
  if (!burg.stateHistory?.includes(ownState)) return false;
  const { cells } = pack;
  const neighbors = (cells.c[burg.cell] ?? []).filter(n => cells.h[n] >= 20);
  if (!neighbors.length) return false;
  return neighbors.every(n => cells.state[n] === ownState);
}

/** Every burg on `landmass` that qualifies as `ownState`'s occupied home pocket — see `isOccupiedHomeBurg`. */
function findOccupiedHomeBurgs(pack: PackedGraph, ownState: number, landmass: number): Burg[] {
  const { cells } = pack;
  return pack.burgs.filter(b => cells.f[b.cell] === landmass && isOccupiedHomeBurg(pack, b, ownState));
}

/**
 * Nearest cell `ownState` actually owns on `landmass` to (`x`, `y`), or null if it holds none
 * there. Distinct from the candidate-picking loop in `ensureGarrisonMarchOrder`: that one snaps
 * onto whatever's closest to a threat-pulled point; this one is "closest to home" for a regiment
 * that has nothing threat-related to do and needs a plain way back onto its own soil.
 */
function nearestOwnLandCell(pack: PackedGraph, x: number, y: number, ownLandCells: number[]): number | null {
  const { cells } = pack;
  let nearest: number | null = null;
  let bestDist = Infinity;
  for (const c of ownLandCells) {
    const dx = cells.p[c][0] - x;
    const dy = cells.p[c][1] - y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      nearest = c;
    }
  }
  return nearest;
}

/** Ports redistributeGarrisons's old target-selection (pull toward the primary threatened frontier, proportional to its share of total threat, snapped onto owned land) into a march order instead of an instant reposition. */
function ensureGarrisonMarchOrder(
  r: MilitaryRegiment,
  segments: FrontierSegment[],
  pack: PackedGraph,
  landRouteGraph: LandRouteGraph,
  landCellsByStateAndLandmass: Map<number, Map<number, number[]>>,
  defenseNodesByStateAndLandmass: Map<number, Map<number, number[]>>
): void {
  const { cells } = pack;
  const landmass = cells.f[r.cell];
  const ownLandCells = landCellsByStateAndLandmass.get(r.state)?.get(landmass) ?? [];

  // No frontier work to assign this regiment — if it's presently standing on foreign soil (e.g.
  // it wandered off before MAX_RECLAIM_DEPTH_MAP_UNITS existed, or its last mission's territory
  // changed hands under it), send it back onto its own land instead of leaving it stranded there
  // forever. If it's already home, there's genuinely nothing to do.
  const retreatOrHold = (): void => {
    if (cells.state[r.cell] === r.state) {
      clearMarchOrder(r);
      return;
    }
    const home = nearestOwnLandCell(pack, r.x, r.y, ownLandCells);
    if (home === null) {
      clearMarchOrder(r);
      return;
    }
    planLandMarchOrder(r, home, pack, landRouteGraph);
  };

  const localSegments = segments.filter(seg => seg.landmass === landmass);
  if (!localSegments.length) {
    retreatOrHold();
    return;
  }

  const totalWeight = sum(localSegments.map(seg => seg.threatWeight));
  if (!totalWeight) {
    retreatOrHold();
    return;
  }

  const target = pickPrimaryFrontier(r.x, r.y, localSegments);
  if (!target) {
    retreatOrHold();
    return;
  }

  const pull = minmax(target.threatWeight / totalWeight, 0, 1) * GARRISON_PULL_STRENGTH;
  const pulledX = r.x + (target.cx - r.x) * pull;
  const pulledY = r.y + (target.cy - r.y) * pull;

  // Hysteresis: don't recompute/replan every single tick over a pull point that barely moved —
  // see GARRISON_DESTINATION_STABILITY_RADIUS's doc comment.
  if (r.destinationCell !== undefined && r.path && r.pathIndex !== undefined) {
    const dx = cells.p[r.destinationCell][0] - pulledX;
    const dy = cells.p[r.destinationCell][1] - pulledY;
    if (Math.hypot(dx, dy) < GARRISON_DESTINATION_STABILITY_RADIUS) return;
  }

  // Candidates are this segment's own actual border cells (so holding the literal frontier is
  // never lost) plus every real, blockable chokepoint the state holds on this landmass (burgs/
  // route junctions) — a node behind the border is only chosen over the border cell itself when
  // it's genuinely closer to the pulled stance point (docs/plan/military-defense.md).
  const nodeCells = defenseNodesByStateAndLandmass.get(r.state)?.get(landmass) ?? [];
  const ownCandidates = nodeCells.concat(target.cells);

  const reclaimCells = reclaimableEnemyCells(pack, r.state, target.neighborState, landmass, target.cx, target.cy);
  const candidates = reclaimCells.length ? ownCandidates.concat(reclaimCells) : ownCandidates;
  if (!candidates.length) {
    retreatOrHold();
    return;
  }

  let destinationCell = r.cell;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dx = cells.p[c][0] - pulledX;
    const dy = cells.p[c][1] - pulledY;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      destinationCell = c;
    }
  }

  planLandMarchOrder(r, destinationCell, pack, landRouteGraph);
}

/**
 * Every hostile regiment `r` currently notices, nearest first — either directly (within
 * VISUAL_DETECTION_RADIUS) or via an abstracted, high-odds spy report (within
 * ESPIONAGE_AWARENESS_RADIUS, at ESPIONAGE_DETECTION_CHANCE odds per tick). Only scans states
 * `r`'s own state has a declared "Enemy" relation with, same gate localSkirmish.ts uses.
 */
function findHostileRegiments(r: MilitaryRegiment, pack: PackedGraph): MilitaryRegiment[] {
  const ownState = pack.states[r.state];
  const detected: { regiment: MilitaryRegiment; dist: number }[] = [];

  for (const otherState of pack.states) {
    if (!otherState.i || otherState.removed || otherState.i === r.state) continue;
    if (ownState?.diplomacy?.[otherState.i] !== "Enemy") continue;

    for (const other of otherState.military ?? []) {
      if (other.a <= 0 || other.isCapitalGuard) continue;
      const dist = Math.hypot(r.x - other.x, r.y - other.y);
      if (dist > ESPIONAGE_AWARENESS_RADIUS) continue;
      if (dist > VISUAL_DETECTION_RADIUS && !appServices.rng.P(ESPIONAGE_DETECTION_CHANCE)) continue;
      detected.push({ regiment: other, dist });
    }
  }

  return detected.sort((a, b) => a.dist - b.dist).map(d => d.regiment);
}

/** Nearest hostile regiment `r` currently notices, or null if none — see findHostileRegiments. */
function findNearestHostileRegiment(r: MilitaryRegiment, pack: PackedGraph): MilitaryRegiment | null {
  return findHostileRegiments(r, pack)[0] ?? null;
}

/** Nearest burg belonging to `r`'s own state — "home" for the retreat and chase-leash reactions below. */
function findNearestOwnBurg(r: MilitaryRegiment, pack: PackedGraph): { cell: number; x: number; y: number } | null {
  let nearest: { cell: number; x: number; y: number } | null = null;
  let nearestDist = Infinity;
  for (const b of pack.burgs) {
    if (!b.i || b.removed || b.state !== r.state) continue;
    const dist = Math.hypot(r.x - b.x, r.y - b.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = { cell: b.cell, x: b.x, y: b.y };
    }
  }
  return nearest;
}

/**
 * The "moving decision" reaction layer (docs/plan/military-movement.md §1.4, Phase 3) — a third
 * layer alongside strategic-planner.ts's national tension and localSkirmish.ts's adjacent-contact
 * resolution. On spotting a nearby hostile regiment, a land regiment either breaks off its current
 * march to close in for the kill (comfortably stronger) or retreats into the nearest own city to
 * garrison there (badly outmatched) — otherwise it holds its existing march order, since the fight
 * is close enough that gambling on it isn't worth abandoning the frontier assignment.
 *
 * Land only for now — naval reaction (detecting/responding to enemy fleets) is a follow-up; fleets
 * keep the plain frontier-pull behavior from Phase 2. Returns true if a reaction destination was
 * set/held this tick, so the caller skips the normal frontier-pull march order for this regiment.
 */
function applyReactionMarchOrder(r: MilitaryRegiment, pack: PackedGraph, landRouteGraph: LandRouteGraph): boolean {
  if (r.n) return false;

  const enemy = findNearestHostileRegiment(r, pack);
  if (!enemy) return false;

  if (!enemy.n && r.a >= enemy.a * ENGAGE_POWER_RATIO) {
    // Border skirmishes and repelling incursions are fine regardless of exactly whose cell the
    // enemy is standing on; chasing them far past MAX_PURSUIT_DEPTH_MAP_UNITS from home is not
    // — see the constant's doc comment.
    const home = findNearestOwnBurg(r, pack);
    if (home && Math.hypot(enemy.x - home.x, enemy.y - home.y) > MAX_PURSUIT_DEPTH_MAP_UNITS) return false;
    planLandMarchOrder(r, enemy.cell, pack, landRouteGraph);
    return true;
  }

  if (enemy.a >= r.a * RETREAT_POWER_RATIO) {
    const refuge = findNearestOwnBurg(r, pack);
    if (refuge !== null) {
      planLandMarchOrder(r, refuge.cell, pack, landRouteGraph);
      return true;
    }
  }

  return false;
}

/**
 * If `r`'s state holds any occupied home burg on this landmass (`isOccupiedHomeBurg`) that sits
 * closer to `r` than the state's own primary external frontier point does, sends `r` to retake
 * it instead of the usual frontier-pull garrison duty. The distance comparison is what keeps this
 * from pulling a genuinely needed frontline regiment off the border: a regiment already close to
 * the real front just isn't offered this mission (docs/plan/military-defense.md — "leave it to
 * whichever safer interior force is available, not the front line"). No willingness/force-ratio
 * check happens here — this Generator module only decides *who marches where*; whether the
 * arrival actually succeeds in retaking the burg is Nobility's homeRecapture.ts's call once the
 * regiment gets there (`onCellEntered`).
 */
function applyRecaptureMarchOrder(
  r: MilitaryRegiment,
  segments: FrontierSegment[],
  pack: PackedGraph,
  landRouteGraph: LandRouteGraph
): boolean {
  if (r.n) return false;

  const landmass = pack.cells.f[r.cell];
  const occupiedBurgs = findOccupiedHomeBurgs(pack, r.state, landmass);
  if (!occupiedBurgs.length) return false;

  let nearestBurg: Burg | null = null;
  let nearestDist = Infinity;
  for (const b of occupiedBurgs) {
    const dist = Math.hypot(r.x - b.x, r.y - b.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestBurg = b;
    }
  }
  if (!nearestBurg) return false;

  const localSegments = segments.filter(seg => seg.landmass === landmass);
  const primaryFrontier = pickPrimaryFrontier(r.x, r.y, localSegments);
  if (primaryFrontier) {
    const frontierDist = Math.hypot(primaryFrontier.cx - r.x, primaryFrontier.cy - r.y);
    if (nearestDist >= frontierDist) return false; // more urgently needed at the real front
  }

  planLandMarchOrder(r, nearestBurg.cell, pack, landRouteGraph);
  return true;
}

/**
 * Turns a committed strategic siege goal (docs/reviews/0709-military-passing-capture.md follow-up,
 * docs/plan/strategy.md) into an actual march order — previously `strategic-planner.ts` would
 * escalate `tension` to 100 (declaring war) and then just wait forever for regiments to wander
 * into range on their own, since nothing ever sent them there. `activeSiegeTargetBurgs` is
 * injected by the caller (Nobility's strategic-planner.ts owns what counts as "the ruler has
 * committed to this war" — tension/diplomacy semantics) so this Generator module stays ignorant
 * of siege business rules; it only knows "these burgs are march destinations for this state."
 *
 * Only regiments whose own nearest frontier segment (`pickPrimaryFrontier`, the same border duty
 * `ensureGarrisonMarchOrder` would otherwise assign them to) faces the *same* neighbor state the
 * target burg belongs to are sent — a border guard watching a different rival stays at its own
 * post instead of piling onto one war and leaving another front empty.
 */
function applyStrategicMarchOrder(
  r: MilitaryRegiment,
  segments: FrontierSegment[],
  pack: PackedGraph,
  landRouteGraph: LandRouteGraph,
  activeSiegeTargetBurgs: number[]
): boolean {
  if (r.n || !activeSiegeTargetBurgs.length) return false;

  const landmass = pack.cells.f[r.cell];
  const localSegments = segments.filter(seg => seg.landmass === landmass);
  if (!localSegments.length) return false;

  const primaryFrontier = pickPrimaryFrontier(r.x, r.y, localSegments);
  if (!primaryFrontier) return false;

  let targetBurgObj: Burg | null = null;
  let nearestDist = Infinity;
  for (const targetBurg of activeSiegeTargetBurgs) {
    const burg = pack.burgs[targetBurg];
    if (!burg || burg.state !== primaryFrontier.neighborState) continue;
    if (pack.cells.f[burg.cell] !== landmass) continue;
    const dist = Math.hypot(r.x - burg.x, r.y - burg.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      targetBurgObj = burg;
    }
  }
  if (!targetBurgObj) return false;

  planLandMarchOrder(r, targetBurgObj.cell, pack, landRouteGraph);
  return true;
}

/**
 * Peels a ~BASE_UNIT_TROOPS detachment (proportionally sharing `r`'s unit composition) off `r`,
 * appends it to `state.military` with `parentId` pointing back at `r`, and sends it marching
 * toward `targetCell`. Returns null (no-op) if `r` can't spare the troops without dropping below
 * MIN_PARENT_TROOPS_AFTER_SPLIT. Part of docs/plan/military-movement.md §1.3/Phase 4's dynamic
 * hierarchy mode — never called unless militaryHierarchy is "dynamic".
 */
function splitDetachment(
  r: MilitaryRegiment,
  state: State,
  targetCell: number,
  pack: PackedGraph,
  landRouteGraph: LandRouteGraph
): MilitaryRegiment | null {
  const military = state.military!;
  const detachmentTroops = Math.max(BASE_UNIT_TROOPS, Math.round(r.a * DETACHMENT_SHARE));
  if (r.a - detachmentTroops < MIN_PARENT_TROOPS_AFTER_SPLIT) return null;

  const fraction = detachmentTroops / r.a;
  const detachmentUnits: Record<string, number> = {};
  for (const [name, amount] of Object.entries(r.u)) {
    const take = Math.round(amount * fraction);
    if (take <= 0) continue;
    detachmentUnits[name] = take;
    r.u[name] = amount - take;
  }
  const takenTotal = sum(Object.values(detachmentUnits));
  if (!takenTotal) return null;
  r.a -= takenTotal;
  r.t -= takenTotal;

  const detachment: MilitaryRegiment = {
    i: military.length,
    t: takenTotal,
    a: takenTotal,
    s: r.s,
    cell: r.cell,
    x: r.x,
    y: r.y,
    bx: r.x,
    by: r.y,
    u: detachmentUnits,
    n: 0,
    type: r.type,
    name: `${r.name} Detachment`,
    state: r.state,
    parentId: r.i
  };

  military.push(detachment);
  planLandMarchOrder(detachment, targetCell, pack, landRouteGraph);
  return detachment;
}

/**
 * If `r` has spotted a second hostile force distinct from the nearest one (which its current
 * march/reaction order is already closing in on or fleeing from), and can spare the troops,
 * peels off a detachment to go deal with it — the "split to cover multiple fronts" half of
 * docs/plan/military-movement.md §1.3/Phase 4. A regiment only ever splits off one detachment
 * per tick; further threats are left for the next tick (or for the detachment itself, once it's
 * had a chance to react). Returns the new detachment (already pushed onto `state.military`), or
 * null if no split happened.
 */
function maybeSplitDetachment(
  r: MilitaryRegiment,
  state: State,
  pack: PackedGraph,
  landRouteGraph: LandRouteGraph
): MilitaryRegiment | null {
  if (r.a - BASE_UNIT_TROOPS < MIN_PARENT_TROOPS_AFTER_SPLIT) return null;

  const hostiles = findHostileRegiments(r, pack);
  if (hostiles.length < 2) return null;

  const primary = hostiles[0];
  const secondary = hostiles.find(h => Math.hypot(h.x - primary.x, h.y - primary.y) > SECOND_THREAT_SEPARATION);
  if (!secondary) return null;

  return splitDetachment(r, state, secondary.cell, pack, landRouteGraph);
}

/** Folds a returning detachment's troops back into its parent field army. */
function mergeDetachmentIntoParent(parent: MilitaryRegiment, detachment: MilitaryRegiment): void {
  for (const [name, amount] of Object.entries(detachment.u)) {
    parent.u[name] = (parent.u[name] ?? 0) + amount;
  }
  parent.a += detachment.a;
  parent.t += detachment.t;
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

  const path = fullPath.slice(0, stepIndex + 1);
  const oldNextCell =
    r.path && r.pathIndex !== undefined && r.pathIndex < r.path.length - 1 ? r.path[r.pathIndex + 1] : undefined;

  r.destinationCell = destinationCell;
  r.path = path; // march only up to the garrison stance point, not all the way to the enemy's own port
  r.pathIndex = 0;

  // If the new path starts by walking along the exact same edge we are currently on, preserve our progress
  if (oldNextCell !== undefined && path.length > 1 && path[1] === oldNextCell) {
    // leave r.edgeProgress as is
  } else {
    r.edgeProgress = 0;
  }

  r.offRoad = false;
}

/**
 * Spends `budget` map units walking `r` along its current path, updating cell/x/y/bx/by, and
 * clears the march order once the destination is reached. No-op if the regiment has no active
 * path. `onCellEntered`, if given, fires once for every cell `r` newly enters this call (a single
 * big `deltaYears` tick can cross several cells/burgs in one go) — the seam Nobility's
 * marchCapture.ts hooks into to raid/capture settlements a regiment marches through, without this
 * core Generator module needing to know anything about states/diplomacy/capture business rules.
 */
export function advanceAlongPath(
  pack: PackedGraph,
  r: MilitaryRegiment,
  budget: number,
  onCellEntered?: (r: MilitaryRegiment, cell: number) => void
): void {
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
      onCellEntered?.(r, toCell);
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
 * re-render the military layer. `onCellEntered` is threaded straight through to
 * `advanceAlongPath` — see its doc comment. `activeSiegeTargetsByState` (stateId -> burg ids)
 * is injected by the caller (Nobility's strategic-planner.ts, via `getActiveSiegeTargets()`) so
 * this Generator module never imports simulationContext/diplomacy semantics directly — see
 * `applyStrategicMarchOrder`.
 */
export function advanceAllRegimentMovement(
  pack: PackedGraph,
  worldContext: WorldContext,
  deltaYears: number,
  onCellEntered?: (r: MilitaryRegiment, cell: number) => void,
  activeSiegeTargetsByState?: Map<number, number[]>
): boolean {
  if (deltaYears <= 0) return false;

  const currentYear = worldContext.options.year ?? 0;
  const seaRouteGraph = buildSeaRouteGraph(pack);
  const landRouteGraph = buildLandRouteGraph(pack);
  const frontiers = mergeFrontiers(
    analyzeFrontiers(pack, currentYear),
    analyzeSeaFrontiers(pack, seaRouteGraph, currentYear)
  );
  const landCellsByStateAndLandmass = buildLandCellsByStateAndLandmass(pack);
  const routeJunctions = identifyRouteJunctions(landRouteGraph);
  const defenseNodesByStateAndLandmass = buildDefenseNodesByStateAndLandmass(pack, routeJunctions);
  const days = deltaYears * 365;
  const hierarchyEnabled = useOptionsState.getState().militaryHierarchy === "dynamic";

  let anyMoved = false;

  for (const state of pack.states) {
    if (!state.i || state.removed || !state.military?.length) continue;
    const segments = frontiers.get(state.i) ?? [];
    const military = state.military;

    // Phase 4 (dynamic hierarchy mode only): merge any detachment that has closed back in on its
    // parent, before this tick's reaction/march-order pass runs. Position is one tick stale (from
    // the end of the previous tick) — an acceptable approximation, since the next tick's pass
    // would catch anything just missed here anyway.
    if (hierarchyEnabled) {
      for (let idx = military.length - 1; idx >= 0; idx--) {
        const r = military[idx];
        if (r.parentId === undefined) continue;
        const parent = military.find(p => p.i === r.parentId);
        if (!parent) {
          r.parentId = undefined; // orphaned (parent itself was merged/removed elsewhere) — carry on as an independent regiment
          continue;
        }
        if (Math.hypot(r.x - parent.x, r.y - parent.y) <= MERGE_DISTANCE_MAP_UNITS) {
          // A pending UI attack may still hold a reference to this detachment or its parent —
          // defer the merge until the lock releases (see battleLock.ts).
          if (isRegimentLockedForBattle(r) || isRegimentLockedForBattle(parent)) continue;
          mergeDetachmentIntoParent(parent, r);
          military.splice(idx, 1);
        }
      }
    }

    const freshlySplit = new Set<MilitaryRegiment>();

    for (const r of military) {
      if (r.isCapitalGuard) continue;
      if (freshlySplit.has(r)) continue; // already given its mission order + movement budget below, this same tick

      if (r.n) {
        ensureFleetMarchOrder(r, segments, pack, seaRouteGraph);
      } else if (hierarchyEnabled && r.parentId !== undefined) {
        // A live detachment: keep reacting to its own local threats independently; once it has
        // none left to react to, head back toward its parent instead of the usual frontier pull
        // (which belongs to the parent's mission, not the detachment's).
        const reacted = applyReactionMarchOrder(r, pack, landRouteGraph);
        if (!reacted) {
          const parent = military.find(p => p.i === r.parentId);
          if (parent) planLandMarchOrder(r, parent.cell, pack, landRouteGraph);
        }
      } else {
        const reacted = applyReactionMarchOrder(r, pack, landRouteGraph);
        if (!reacted) {
          const recapturing = applyRecaptureMarchOrder(r, segments, pack, landRouteGraph);
          if (!recapturing) {
            const attacking = applyStrategicMarchOrder(
              r,
              segments,
              pack,
              landRouteGraph,
              activeSiegeTargetsByState?.get(r.state) ?? []
            );
            if (!attacking)
              ensureGarrisonMarchOrder(
                r,
                segments,
                pack,
                landRouteGraph,
                landCellsByStateAndLandmass,
                defenseNodesByStateAndLandmass
              );
          }
        }

        if (hierarchyEnabled) {
          // Splitting off a detachment appends it to `military` (the array this for-of loop is
          // iterating), so it would otherwise get visited again later in this same pass — and
          // immediately override its brand-new mission order, since sitting right next to
          // whatever threat `r` itself is reacting to would make its own reaction layer want to
          // retreat from that same nearby threat instead of marching off toward its assigned one.
          // Mark it so this pass leaves it alone; from next tick on it's a normal live detachment.
          const detachment = maybeSplitDetachment(r, state, pack, landRouteGraph);
          if (detachment) {
            freshlySplit.add(detachment);
            const detachmentBudget = dailySpeedMapUnits(detachment, worldContext) * days;
            advanceAlongPath(pack, detachment, detachmentBudget, onCellEntered);
            anyMoved = true;
          }
        }
      }

      if (!r.path || r.pathIndex === undefined) continue;

      const budget = dailySpeedMapUnits(r, worldContext) * days;
      const beforeX = r.x;
      const beforeY = r.y;
      advanceAlongPath(pack, r, budget, onCellEntered);
      if (r.x !== beforeX || r.y !== beforeY) anyMoved = true;
    }
  }

  return anyMoved;
}
