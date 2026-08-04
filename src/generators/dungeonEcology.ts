/**
 * Spontaneous High Fantasy dungeon appearance over decades–centuries.
 * Spec: docs/plan/high-fantasy-dungeons.md §5.6
 *
 * Self-gates to once per calendar year (Jan 1). Does not claim land.
 */
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { DataTopic } from "../runtime/worldRuntime";
import { useOptionsState } from "../store/optionsState";
import type { RNGService } from "../utils/probabilityUtils";
import { getDungeonSpawnProfile } from "./dungeonProfiles";
import { Dungeons } from "./dungeons-generator";

export interface DungeonEcologyInput {
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
  readonly rng: RNGService;
}

export interface DungeonEcologyResult {
  readonly topics: readonly DataTopic[];
  readonly spawned: number;
}

let lastEvaluatedYear: number | null = null;

/** Test helper: reset annual gate. */
export function resetDungeonEcologyGate(): void {
  lastEvaluatedYear = null;
}

export function advanceDungeonEcology(input: DungeonEcologyInput): DungeonEcologyResult {
  const { world, simulation, rng } = input;
  const culturesSet = useOptionsState.getState().culturesSet;
  const profile = getDungeonSpawnProfile(culturesSet);
  if (!profile) return { topics: [], spawned: 0 };
  if (simulation.currentMonth !== 1 || simulation.currentDay !== 1) return { topics: [], spawned: 0 };

  const year = simulation.currentYear;
  if (lastEvaluatedYear === year) return { topics: [], spawned: 0 };
  lastEvaluatedYear = year;

  const pack = world.pack;
  if (!pack.cells?.i?.length) return { topics: [], spawned: 0 };

  const active = pack.dungeons ?? [];
  if (active.length >= profile.maxActive) return { topics: [], spawned: 0 };

  // Annual spawn probability ≈ 1 / meanYears, reduced as the map fills.
  const fill = active.length / Math.max(1, profile.maxActive);
  const baseP = 1 / Math.max(20, profile.spontaneousMeanYears);
  const p = baseP * (1 - fill * 0.85);
  if (!rng.P(p)) return { topics: [], spawned: 0 };

  const dungeon = Dungeons.spawnOne(world, {
    year,
    random: () => rng.rand()
  });
  if (!dungeon) return { topics: [], spawned: 0 };
  return { topics: ["map.annotations", "simulation.cells"], spawned: 1 };
}
