/**
 * Phase 4 wild oikoumene: hunt/cull projects + rewilding.
 * Spec: docs/plan/wild-oikoumene-frontier.md
 *
 * Invariants:
 * - Lowering danger never assigns `cells.state` (claiming stays separate).
 * - Danger is always rebuilt from living monsters after cull/recovery.
 * - wildLand tags are refreshed after danger changes.
 */
import {
  createEmptyWildernessEcologyState,
  type SimulationContext,
  type ThreatCullProject,
  type WildernessEcologyState
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { DataTopic } from "../runtime/worldRuntime";
import { useOptionsState } from "../store/optionsState";
import type { Monster, State } from "../types/models";
import type { RNGService } from "../utils/probabilityUtils";
import { STATE_EXPAND_DANGER_BAN } from "./dangerExpandPolicy";
import { rebuildDangerFromMonsters, type ThreatCalculationMode } from "./dangerField";
import { getThreatSpawnProfile } from "./threatProfiles";
import { assignWildLandTags, WILD_LAND_MARGIN_DANGER_MIN } from "./wildLandTags";

const HUNT_RESERVE = 10;
const MAX_CULL_PROJECTS_PER_STATE = 2;
const MAX_HUNT_HOPS = 4;
/** Fraction of basePower restored each year when not under active hunt. */
const REWILD_POWER_RECOVERY = 0.08;
/** Ambient residual danger creep on unclaimed margin cells (post-rebuild add). */
const REWILD_AMBIENT_CREEP = 2;

export interface WildernessEcologyInput {
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
  readonly rng: RNGService;
}

export interface WildernessEcologyResult {
  readonly topics: readonly DataTopic[];
  readonly started: readonly number[];
  readonly progressed: readonly number[];
  readonly cleared: readonly number[];
  readonly abandoned: readonly number[];
}

export function createEmptyWildernessEcologyResult(): WildernessEcologyResult {
  return { topics: [], started: [], progressed: [], cleared: [], abandoned: [] };
}

/** Read-only summaries for the Tools frontier panel. */
export function getThreatCullProjectSummaries(
  world: WorldContext,
  simulation: SimulationContext
): readonly ThreatCullProject[] {
  if (!isFantasyThreatMap(world)) return [];
  return Object.values(simulation.wilderness?.cullProjects ?? {}).sort((a, b) => a.cellId - b.cellId);
}

/**
 * Annual host tick: fund hunts near state borders, weaken/remove monsters,
 * allow unhunted threats to recover, rebuild danger, refresh wildLand.
 * Never mutates political ownership.
 */
export function advanceWildernessEcology(input: WildernessEcologyInput): WildernessEcologyResult {
  const { world, simulation, rng } = input;
  const cells = world.pack?.cells;
  if (!cells || !isFantasyThreatMap(world)) return createEmptyWildernessEcologyResult();
  if (simulation.currentMonth !== 1 || simulation.currentDay !== 1) return createEmptyWildernessEcologyResult();

  const wilderness = ensureWildernessState(simulation);
  const year = simulation.currentYear;
  if (wilderness.lastEvaluatedYear === year) return createEmptyWildernessEcologyResult();
  wilderness.lastEvaluatedYear = year;

  const monsters = world.pack.monsters ?? [];
  ensureMonsterBasePower(monsters);
  const threatCalculation = resolveThreatCalculation();

  const started: number[] = [];
  const progressed: number[] = [];
  const cleared: number[] = [];
  const abandoned: number[] = [];
  const huntedMonsterIds = new Set<number>();

  // 1) Advance existing cull projects.
  for (const project of Object.values(wilderness.cullProjects)) {
    const state = world.pack.states?.[project.stateId];
    if (!state || state.removed) {
      abandoned.push(project.cellId);
      delete wilderness.cullProjects[project.cellId];
      continue;
    }

    const cost = annualHuntCost(project, monsters);
    if ((state.treasury ?? 0) < cost + HUNT_RESERVE) {
      project.lastOutcome = "abandoned";
      abandoned.push(project.cellId);
      delete wilderness.cullProjects[project.cellId];
      continue;
    }

    state.treasury = Math.max(0, (state.treasury ?? 0) - cost);
    project.progressYears += 1;
    const beforeDanger = cells.danger?.[project.cellId] ?? 0;
    const result = applyHuntProgress(project, world, monsters, rng);
    const afterLocal = estimateLocalDangerDrop(beforeDanger, result.powerReduced);
    project.dangerReduced += afterLocal;

    if (result.cleared) {
      project.lastOutcome = "cleared";
      cleared.push(project.cellId);
      delete wilderness.cullProjects[project.cellId];
    } else {
      project.lastOutcome = "progress";
      progressed.push(project.cellId);
      if (project.monsterId !== null) huntedMonsterIds.add(project.monsterId);
    }
  }

  // 2) Start new hunts for states that still have capacity and treasury.
  for (const state of world.pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    let active = countStateCulls(wilderness, state.i);
    if (active >= MAX_CULL_PROJECTS_PER_STATE) continue;

    while (active < MAX_CULL_PROJECTS_PER_STATE) {
      if ((state.treasury ?? 0) < HUNT_RESERVE + 6) break;
      const target = selectHuntTarget(state, world, wilderness, monsters, rng);
      if (!target) break;

      const setupCost = setupHuntCost(target.rarity);
      if ((state.treasury ?? 0) < setupCost + HUNT_RESERVE) break;

      state.treasury = Math.max(0, (state.treasury ?? 0) - setupCost);
      const project: ThreatCullProject = {
        cellId: target.cellId,
        stateId: state.i,
        monsterId: target.monsterId,
        establishedYear: year,
        progressYears: 0,
        lastOutcome: "progress",
        dangerReduced: 0
      };
      // First funded year applies immediately so annual advance always shows progress.
      const firstYear = applyHuntProgress(project, world, monsters, rng);
      project.progressYears = 1;
      project.dangerReduced = estimateLocalDangerDrop(cells.danger?.[project.cellId] ?? 0, firstYear.powerReduced);
      if (firstYear.cleared) {
        project.lastOutcome = "cleared";
        cleared.push(project.cellId);
        started.push(project.cellId);
        // Do not keep a cleared project in the sparse map.
      } else {
        project.lastOutcome = "progress";
        wilderness.cullProjects[target.cellId] = project;
        started.push(target.cellId);
        progressed.push(target.cellId);
        active += 1;
        if (target.monsterId !== null) huntedMonsterIds.add(target.monsterId);
      }
    }
  }

  // 3) Rewild: unhunted monsters recover toward basePower.
  for (const monster of monsters) {
    if (!monster || monster.power <= 0) continue;
    if (huntedMonsterIds.has(monster.i)) continue;
    const base = monster.basePower ?? monster.power;
    if (monster.power >= base) continue;
    const step = Math.max(1, Math.round(base * REWILD_POWER_RECOVERY));
    monster.power = Math.min(base, monster.power + step);
  }

  // Drop dead monsters from the pack list and clean markers/notes.
  world.pack.monsters = monsters.filter(monster => monster && monster.power > 0);
  pruneDeadMonsterMarkers(world);

  // 4) Rebuild danger purely from living monsters (claiming land stays separate).
  if (!cells.danger || cells.danger.length !== cells.i.length) {
    cells.danger = new Uint8Array(cells.i.length);
  }
  rebuildDangerFromMonsters(cells, world.pack.monsters, threatCalculation);
  applyAmbientRewildCreep(cells, world);
  assignWildLandTags(cells);

  const topics: DataTopic[] = ["simulation.cells"];
  if (started.length || progressed.length || cleared.length || abandoned.length) {
    topics.push("simulation.states");
  }

  return { topics, started, progressed, cleared, abandoned };
}

function isFantasyThreatMap(world: WorldContext): boolean {
  const culturesSet = useOptionsState.getState().culturesSet;
  if (getThreatSpawnProfile(culturesSet)) return true;
  // Also allow when monsters already exist (loaded fantasy map with unlocked culture set).
  return (world.pack.monsters?.length ?? 0) > 0;
}

function ensureWildernessState(simulation: SimulationContext): WildernessEcologyState {
  if (!simulation.wilderness) simulation.wilderness = createEmptyWildernessEcologyState();
  if (!simulation.wilderness.cullProjects) simulation.wilderness.cullProjects = {};
  return simulation.wilderness;
}

function ensureMonsterBasePower(monsters: readonly Monster[]): void {
  for (const monster of monsters) {
    if (monster && monster.basePower === undefined) monster.basePower = monster.power;
  }
}

function resolveThreatCalculation(): ThreatCalculationMode {
  const culturesSet = useOptionsState.getState().culturesSet;
  const profile = getThreatSpawnProfile(culturesSet);
  return profile?.threatCalculation ?? useOptionsState.getState().threatCalculation ?? "additive";
}

function countStateCulls(wilderness: WildernessEcologyState, stateId: number): number {
  return Object.values(wilderness.cullProjects).filter(project => project.stateId === stateId).length;
}

function yearsToClear(rarity: number): number {
  if (rarity >= 5) return 8;
  if (rarity >= 4) return 5;
  if (rarity >= 3) return 3;
  if (rarity >= 2) return 2;
  return 1;
}

function setupHuntCost(rarity: number): number {
  if (rarity >= 5) return 40;
  if (rarity >= 4) return 24;
  if (rarity >= 3) return 14;
  if (rarity >= 2) return 8;
  return 5;
}

function annualHuntCost(project: ThreatCullProject, monsters: readonly Monster[]): number {
  const monster = project.monsterId === null ? null : monsters.find(entry => entry.i === project.monsterId);
  const rarity = monster?.rarity ?? 1;
  return Math.max(3, Math.round(setupHuntCost(rarity) * 0.55));
}

function applyHuntProgress(
  project: ThreatCullProject,
  _world: WorldContext,
  monsters: Monster[],
  rng: RNGService
): { cleared: boolean; powerReduced: number } {
  if (project.monsterId === null) {
    // No living target (already cleared elsewhere) — close the project.
    return { cleared: true, powerReduced: 0 };
  }

  const monster = monsters.find(entry => entry.i === project.monsterId);
  if (!monster || monster.power <= 0) return { cleared: true, powerReduced: 0 };

  const base = monster.basePower ?? monster.power;
  const years = yearsToClear(monster.rarity);
  const chunk = Math.max(1, Math.ceil(base / years));
  // Slight variance so multi-year hunts are not perfectly linear.
  const swing = rng.rand() < 0.25 ? 1 : 0;
  const before = monster.power;
  monster.power = Math.max(0, monster.power - chunk - swing);
  const powerReduced = before - monster.power;

  if (monster.power <= 0) {
    monster.power = 0;
    return { cleared: true, powerReduced };
  }
  // Extra clear chance after the planned duration.
  if (project.progressYears >= years && rng.rand() < 0.35) {
    monster.power = 0;
    return { cleared: true, powerReduced: before };
  }
  return { cleared: false, powerReduced };
}

function estimateLocalDangerDrop(beforeDanger: number, powerReduced: number): number {
  return Math.min(beforeDanger, powerReduced * 4);
}

type HuntTarget = { cellId: number; monsterId: number | null; rarity: number; score: number };

function selectHuntTarget(
  state: State,
  world: WorldContext,
  wilderness: WildernessEcologyState,
  monsters: readonly Monster[],
  rng: RNGService
): HuntTarget | null {
  const cells = world.pack.cells;
  const occupied = new Set(Object.keys(wilderness.cullProjects).map(Number));
  const borderCells = collectStateBorderCells(state.i, cells);
  if (!borderCells.length) return null;

  const candidates: HuntTarget[] = [];

  for (const monster of monsters) {
    if (!monster || monster.power <= 0) continue;
    if (occupied.has(monster.cell)) continue;
    const hops = minHopsToSet(monster.cell, borderCells, cells, MAX_HUNT_HOPS);
    if (hops === null) continue;
    const danger = cells.danger?.[monster.cell] ?? 0;
    // Prefer threats that block expansion (high danger) but still near the realm.
    const score =
      danger * 2 +
      monster.rarity * 12 -
      hops * 8 +
      (danger >= STATE_EXPAND_DANGER_BAN ? 30 : danger >= WILD_LAND_MARGIN_DANGER_MIN ? 10 : 0) +
      rng.rand() * 3;
    candidates.push({ cellId: monster.cell, monsterId: monster.i, rarity: monster.rarity, score });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || a.cellId - b.cellId);
  return candidates[0];
}

function collectStateBorderCells(stateId: number, cells: WorldContext["pack"]["cells"]): number[] {
  const borders: number[] = [];
  for (let i = 0; i < cells.i.length; i++) {
    if (cells.state[i] !== stateId || cells.h[i] < 20) continue;
    const touchesWild = (cells.c[i] ?? []).some(
      neighbor => cells.h[neighbor] >= 20 && (cells.state[neighbor] ?? 0) === 0
    );
    if (touchesWild) borders.push(i);
  }
  return borders;
}

function minHopsToSet(
  start: number,
  goals: readonly number[],
  cells: WorldContext["pack"]["cells"],
  maxHops: number
): number | null {
  const goalSet = new Set(goals);
  if (goalSet.has(start)) return 0;
  const queue = [{ cell: start, hops: 0 }];
  const visited = new Set<number>([start]);
  while (queue.length) {
    const { cell, hops } = queue.shift()!;
    if (hops >= maxHops) continue;
    for (const neighbor of cells.c[cell] ?? []) {
      if (visited.has(neighbor) || cells.h[neighbor] < 20) continue;
      if (goalSet.has(neighbor)) return hops + 1;
      visited.add(neighbor);
      queue.push({ cell: neighbor, hops: hops + 1 });
    }
  }
  return null;
}

function pruneDeadMonsterMarkers(world: WorldContext): void {
  const pack = world.pack;
  const livingCells = new Set((pack.monsters ?? []).filter(m => m.power > 0 && m.rarity >= 3).map(m => m.cell));
  if (!pack.markers?.length) return;
  const removedMarkerIds: number[] = [];
  pack.markers = pack.markers.filter(marker => {
    if (marker.type !== "monster") return true;
    if (livingCells.has(marker.cell)) return true;
    removedMarkerIds.push(marker.i);
    return false;
  });
  if (!removedMarkerIds.length || !world.notes?.length) return;
  const removed = new Set(removedMarkerIds.map(id => `marker${id}`));
  world.notes = world.notes.filter(note => !removed.has(note.id));
}

/**
 * Soft ecological pressure so cleared wilderness does not stay permanently safe:
 * unclaimed margin-class cells creep danger slightly even without a named monster.
 * Capped well below the expand ban so it creates texture, not instant monster domains.
 */
function applyAmbientRewildCreep(cells: WorldContext["pack"]["cells"], world: WorldContext): void {
  if (!cells.danger) return;
  const hasMonsters = (world.pack.monsters?.length ?? 0) > 0;
  if (!hasMonsters) return;

  for (let i = 0; i < cells.i.length; i++) {
    if (cells.h[i] < 20 || (cells.state[i] ?? 0) > 0) continue;
    const danger = cells.danger[i] ?? 0;
    // Only reinforce existing threat gradient cells; do not invent danger far from threats.
    if (danger <= 0 || danger >= STATE_EXPAND_DANGER_BAN - 5) continue;
    const nearThreat = (cells.c[i] ?? []).some(n => (cells.danger[n] ?? 0) > danger);
    if (!nearThreat && danger < WILD_LAND_MARGIN_DANGER_MIN) continue;
    cells.danger[i] = Math.min(STATE_EXPAND_DANGER_BAN - 1, danger + REWILD_AMBIENT_CREEP);
  }
}
