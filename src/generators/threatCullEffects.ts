/**
 * Host mid-year player/anon cull ecology effects + shared hunt cost helpers.
 * Spec: docs/plan/player-threat-cull-jobs.md PR-1.
 *
 * Invariants:
 * - Never writes `cells.state` (claiming stays separate).
 * - Returns exact `DataTopic[]` for callers to markChanged.
 * - Full-clear removes zero-power monsters and prunes monster markers/notes.
 */
import {
  createEmptyWildernessEcologyState,
  type SimulationContext,
  type WildernessEcologyState
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { biomeHasTag, isForestBiome } from "../data/biomeCatalog";
import type { DataTopic } from "../runtime/worldRuntime";
import { useOptionsState } from "../store/optionsState";
import type { Monster } from "../types/models";
import type { BiomesData } from "../types/WorldState";
import type { RNGService } from "../utils/probabilityUtils";
import { getBiomePredatorBaseDanger } from "./biomePredators";
import { biomePredatorScaleForMode, rebuildDangerField, type ThreatCalculationMode } from "./dangerField";
import { dungeonsAsDangerSources } from "./dungeons-generator";
import { collectStateBorderCells, MAX_HUNT_HOPS, minHopsBetween, minHopsToSet } from "./huntGeometry";
import { getThreatSpawnProfile, resolveThreatCultureMode } from "./threatProfiles";
import { assignWildLandTags } from "./wildLandTags";

/** Match wildernessEcology / design: floor cash kept when funding hunts. */
export const HUNT_RESERVE = 10;

/** PC power cut = ceil(armyYearChunk * this fraction) × intensity. */
export const PC_ARMY_YEAR_FRACTION = 0.25;

/** Pest suppression added per successful intensity unit (before anon scale). */
export const PEST_SUPPRESSION_PER_INTENSITY = 0.25;

/** Annual decay of pestSuppressionByCell on wilderness Jan-1 tick. */
export const PEST_SUPPRESSION_ANNUAL_DECAY = 0.15;

/** Max hops from burg cell when listing pest hinterland targets. */
const PEST_HINTERLAND_HOPS = 3;

export type CullTargetKind = "monster" | "biomePredator" | "residualDanger" | "pest";

export interface CullTargetRef {
  kind: CullTargetKind;
  /** `Monster.i` when kind === "monster"; otherwise null. */
  monsterId: number | null;
  cellId: number;
  /** 1–5; pests map to 1–2. */
  rarity: number;
  /** Power / pressure snapshot at post time. */
  powerSnapshot: number;
  label: string;
}

export interface PlayerCullEffectInput {
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
  readonly target: CullTargetRef;
  /**
   * 0..1 ecology scale from combat.
   * Callers apply anon half-scale before passing (design: intensity * ANON_ECOLOGY_SCALE).
   */
  readonly intensity: number;
  readonly rng?: RNGService;
  /**
   * When set to an active `ThreatCullProject.cellId`, only diagnostic fields
   * (`dangerReduced`) may update — never `progressYears`.
   */
  readonly macroCellId?: number | null;
}

export interface PlayerCullEffectResult {
  readonly cleared: boolean;
  readonly powerReduced: number;
  readonly dangerHint: number;
  /** Caller must writer.markChanged(...topics). */
  readonly topics: readonly DataTopic[];
}

export function yearsToClear(rarity: number): number {
  if (rarity >= 5) return 8;
  if (rarity >= 4) return 5;
  if (rarity >= 3) return 3;
  if (rarity >= 2) return 2;
  return 1;
}

export function setupHuntCost(rarity: number): number {
  if (rarity >= 5) return 40;
  if (rarity >= 4) return 24;
  if (rarity >= 3) return 14;
  if (rarity >= 2) return 8;
  return 5;
}

export function annualHuntCostForRarity(rarity: number): number {
  return Math.max(3, Math.round(setupHuntCost(rarity) * 0.55));
}

/** Army-year power chunk for a living monster (same as macro applyHuntProgress). */
export function armyYearPowerChunk(monster: Pick<Monster, "power" | "basePower" | "rarity">): number {
  const base = monster.basePower ?? monster.power;
  return Math.max(1, Math.ceil(base / yearsToClear(monster.rarity)));
}

/** PC power cut before intensity (ceil(armyChunk * 0.25)). */
export function pcArmyYearChunk(monster: Pick<Monster, "power" | "basePower" | "rarity">): number {
  return Math.max(1, Math.ceil(armyYearPowerChunk(monster) * PC_ARMY_YEAR_FRACTION));
}

export function estimateLocalDangerDrop(beforeDanger: number, powerReduced: number): number {
  return Math.min(beforeDanger, powerReduced * 4);
}

/**
 * Drop zero-power rarity≥3 monster markers and their notes.
 * Safe to call after filtering pack.monsters.
 */
export function pruneDeadMonsterMarkers(world: WorldContext): boolean {
  const pack = world.pack;
  const livingCells = new Set((pack.monsters ?? []).filter(m => m.power > 0 && m.rarity >= 3).map(m => m.cell));
  if (!pack.markers?.length) return false;
  const removedMarkerIds: number[] = [];
  const next = pack.markers.filter(marker => {
    if (marker.type !== "monster") return true;
    if (livingCells.has(marker.cell)) return true;
    removedMarkerIds.push(marker.i);
    return false;
  });
  if (!removedMarkerIds.length) return false;
  pack.markers = next;
  if (world.notes?.length) {
    const removed = new Set(removedMarkerIds.map(id => `marker${id}`));
    world.notes = world.notes.filter(note => !removed.has(note.id));
  }
  return true;
}

export function ensureWildernessState(simulation: SimulationContext): WildernessEcologyState {
  if (!simulation.wilderness) simulation.wilderness = createEmptyWildernessEcologyState();
  if (!simulation.wilderness.cullProjects) simulation.wilderness.cullProjects = {};
  if (!simulation.wilderness.pestSuppressionByCell) simulation.wilderness.pestSuppressionByCell = {};
  return simulation.wilderness;
}

/**
 * Decay pest suppression toward 0 (annual Jan-1 wilderness tick).
 * Drops keys at ≤ 0.
 */
export function decayPestSuppression(wilderness: WildernessEcologyState): boolean {
  const map = wilderness.pestSuppressionByCell;
  if (!map) return false;
  let changed = false;
  for (const key of Object.keys(map)) {
    const cellId = Number(key);
    const next = (map[cellId] ?? 0) - PEST_SUPPRESSION_ANNUAL_DECAY;
    if (next <= 0) {
      delete map[cellId];
      changed = true;
    } else if (next !== map[cellId]) {
      map[cellId] = next;
      changed = true;
    }
  }
  return changed;
}

function resolveThreatCalculation(): ThreatCalculationMode {
  const culturesSet = useOptionsState.getState().culturesSet;
  const profile = getThreatSpawnProfile(culturesSet);
  return profile?.threatCalculation ?? useOptionsState.getState().threatCalculation ?? "additive";
}

/**
 * Immediate danger rebuild from living monsters + dungeon bosses + biome predators
 * (with pest suppression applied). Never mutates political ownership.
 */
export function rebuildDangerAfterCull(world: WorldContext, simulation: SimulationContext): void {
  const cells = world.pack?.cells;
  if (!cells) return;
  if (!cells.danger || cells.danger.length !== cells.i.length) {
    cells.danger = new Uint8Array(cells.i.length);
  }
  const culturesSet = useOptionsState.getState().culturesSet;
  const dangerSources = [...(world.pack.monsters ?? []), ...dungeonsAsDangerSources(world.pack.dungeons)];
  const wilderness = ensureWildernessState(simulation);
  rebuildDangerField(cells, dangerSources, resolveThreatCalculation(), {
    biomesData: world.biomesData,
    biomePredatorScale: biomePredatorScaleForMode(resolveThreatCultureMode(culturesSet)),
    reducePredatorsOnGovernedLand: true,
    pestSuppressionByCell: wilderness.pestSuppressionByCell
  });
  assignWildLandTags(cells);
}

/**
 * Single host entry for mid-year PC/anon cull success (and partial).
 * Callers must markChanged(...result.topics).
 */
export function resolvePlayerCullEffect(input: PlayerCullEffectInput): PlayerCullEffectResult {
  const { world, simulation, target } = input;
  const intensity = Math.max(0, Math.min(1, input.intensity));
  const empty: PlayerCullEffectResult = {
    cleared: false,
    powerReduced: 0,
    dangerHint: 0,
    topics: []
  };
  if (!(intensity > 0) || !world.pack?.cells) return empty;

  const cells = world.pack.cells;
  const beforeDanger = cells.danger?.[target.cellId] ?? 0;
  const topics = new Set<DataTopic>();
  let cleared = false;
  let powerReduced = 0;
  let touchedMonster = false;
  let touchedPest = false;

  if (target.kind === "monster" && target.monsterId !== null) {
    const monsters = world.pack.monsters ?? [];
    const monster = monsters.find(entry => entry && entry.i === target.monsterId);
    if (!monster || monster.power <= 0) {
      // Target already gone — still rebuild/clean if needed.
      const pruned = pruneDeadMonsterMarkers(world);
      if (pruned) topics.add("map.annotations");
      rebuildDangerAfterCull(world, simulation);
      topics.add("simulation.cells");
      return {
        cleared: true,
        powerReduced: 0,
        dangerHint: 0,
        topics: [...topics]
      };
    }

    if (monster.basePower === undefined) monster.basePower = monster.power;
    const pcChunk = pcArmyYearChunk(monster);
    const cut = Math.max(1, Math.round(pcChunk * intensity));
    const before = monster.power;
    monster.power = Math.max(0, monster.power - cut);
    powerReduced = before - monster.power;
    touchedMonster = true;
    topics.add("map.annotations");

    if (monster.power <= 0) {
      monster.power = 0;
      world.pack.monsters = monsters.filter(entry => entry && entry.power > 0);
      pruneDeadMonsterMarkers(world);
      cleared = true;
    }
  } else if (target.kind === "pest" || target.kind === "biomePredator") {
    const wilderness = ensureWildernessState(simulation);
    if (!wilderness.pestSuppressionByCell) wilderness.pestSuppressionByCell = {};
    const map = wilderness.pestSuppressionByCell;
    const add = PEST_SUPPRESSION_PER_INTENSITY * intensity;
    const prev = map[target.cellId] ?? 0;
    map[target.cellId] = Math.min(1, prev + add);
    touchedPest = true;
    // Diagnostic "power" for pay/UI: report suppression delta * 100 as hint scale.
    powerReduced = Math.round((map[target.cellId] - prev) * 100);
    cleared = map[target.cellId] >= 0.99;
  } else {
    // residualDanger: v2 — no-op ecology in PR-1 beyond rebuild skip.
    return empty;
  }

  if (touchedMonster || touchedPest) {
    rebuildDangerAfterCull(world, simulation);
    topics.add("simulation.cells");
  }

  const afterDanger = cells.danger?.[target.cellId] ?? 0;
  const dangerHint = Math.max(0, beforeDanger - afterDanger);

  // Join-macro diagnostics only (never progressYears).
  // Prefer observed danger drop; fall back to power proxy when the field was unpainted.
  if (input.macroCellId != null && powerReduced > 0) {
    const wilderness = ensureWildernessState(simulation);
    const project = wilderness.cullProjects[input.macroCellId];
    if (project) {
      const drop = estimateLocalDangerDrop(beforeDanger, powerReduced);
      project.dangerReduced += drop > 0 ? drop : Math.max(dangerHint, powerReduced);
    }
  }

  return {
    cleared,
    powerReduced,
    dangerHint,
    topics: [...topics]
  };
}

/**
 * Candidate cull targets near a burg for the future job board (PR-2).
 * - Living monsters within MAX_HUNT_HOPS of the state border and of the burg cell.
 * - Pest hinterland: cells within 1–PEST_HINTERLAND_HOPS with predator base danger > 0.
 * residualDanger is not listed in v1 (design §3.4).
 */
export function getCullTargetsNearBurg(
  world: WorldContext,
  simulation: SimulationContext,
  burgId: number
): CullTargetRef[] {
  const pack = world.pack;
  const cells = pack?.cells;
  const burg = pack?.burgs?.[burgId];
  if (!cells || !burg?.i || burg.removed) return [];
  const stateId = burg.state ?? 0;
  if (!(stateId > 0)) return [];

  const burgCell = burg.cell;
  if (burgCell == null || burgCell < 0) return [];

  const borderCells = collectStateBorderCells(stateId, cells);
  const results: CullTargetRef[] = [];
  const seenMonster = new Set<number>();
  const seenPestCell = new Set<number>();

  // Monsters near border + burg.
  for (const monster of pack.monsters ?? []) {
    if (!monster || monster.power <= 0) continue;
    if (borderCells.length) {
      const hopsBorder = minHopsToSet(monster.cell, borderCells, cells, MAX_HUNT_HOPS);
      if (hopsBorder === null) continue;
    } else {
      // Inland-only state: still allow if within hops of burg.
    }
    const hopsBurg = minHopsBetween(burgCell, monster.cell, cells, MAX_HUNT_HOPS);
    if (hopsBurg === null) continue;
    if (seenMonster.has(monster.i)) continue;
    seenMonster.add(monster.i);
    results.push({
      kind: "monster",
      monsterId: monster.i,
      cellId: monster.cell,
      rarity: monster.rarity,
      powerSnapshot: monster.power,
      label: monster.name || monster.type || `Monster ${monster.i}`
    });
  }

  // Active macro projects for this state (join-hunt flavor — still monster targets).
  for (const project of Object.values(simulation.wilderness?.cullProjects ?? {})) {
    if (project.stateId !== stateId || project.monsterId === null) continue;
    if (seenMonster.has(project.monsterId)) continue;
    const monster = (pack.monsters ?? []).find(m => m?.i === project.monsterId);
    if (!monster || monster.power <= 0) continue;
    const hopsBurg = minHopsBetween(burgCell, monster.cell, cells, MAX_HUNT_HOPS);
    if (hopsBurg === null) continue;
    seenMonster.add(monster.i);
    results.push({
      kind: "monster",
      monsterId: monster.i,
      cellId: monster.cell,
      rarity: monster.rarity,
      powerSnapshot: monster.power,
      label: `${monster.name || monster.type} (royal hunt)`
    });
  }

  // Pest hinterland (does not require painted cells.danger > 0).
  const biomesData = world.biomesData;
  const queue = [{ cell: burgCell, hops: 0 }];
  const visited = new Set<number>([burgCell]);
  while (queue.length) {
    const { cell, hops } = queue.shift()!;
    if (hops > 0 && hops <= PEST_HINTERLAND_HOPS && !seenPestCell.has(cell)) {
      const base = getBiomePredatorBaseDanger(cells.biomeCode?.[cell], cells.h[cell] ?? 0, biomesData);
      if (base > 0) {
        seenPestCell.add(cell);
        const rarity = base >= 12 ? 2 : 1;
        results.push({
          kind: "pest",
          monsterId: null,
          cellId: cell,
          rarity,
          powerSnapshot: base,
          label: pestLabelForBiome(cells.biomeCode?.[cell], cells.h[cell] ?? 0, biomesData, rarity)
        });
      }
    }
    if (hops >= PEST_HINTERLAND_HOPS) continue;
    for (const neighbor of cells.c[cell] ?? []) {
      if (visited.has(neighbor) || cells.h[neighbor] < 20) continue;
      visited.add(neighbor);
      queue.push({ cell: neighbor, hops: hops + 1 });
    }
  }

  // Prefer monsters first, then higher rarity/power.
  results.sort((a, b) => {
    const kindOrder = (k: CullTargetKind) => (k === "monster" ? 0 : 1);
    return (
      kindOrder(a.kind) - kindOrder(b.kind) ||
      b.rarity - a.rarity ||
      b.powerSnapshot - a.powerSnapshot ||
      a.cellId - b.cellId
    );
  });
  return results;
}

function pestLabelForBiome(
  biomeCode: number | undefined,
  height: number,
  biomesData: BiomesData | null | undefined,
  rarity: number
): string {
  if (rarity >= 2 && height >= 62) return "Mountain cats";
  if (rarity >= 2) return "Bear problem";
  if (biomesData && biomeCode != null) {
    if (isForestBiome(biomesData, biomeCode) && biomeHasTag(biomesData, biomeCode, "cold")) {
      return "Wolf cull";
    }
  }
  return "Boar drive";
}
