/**
 * Annual underground realm tick — Phase 4 of docs/plan/underground-realm-and-supernatural-areas.md §4.3a.
 *
 * Self-gates to once per calendar year (Jan 1), same convention as dungeonEcology.ts. No-op on
 * non-Fantasy maps (`cells.subterraneanVoid` absent — generation never created it) and on maps
 * with no live Deep Worms.
 */
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { DataTopic } from "../runtime/worldRuntime";
import { growVoidFromWormActivity } from "./deepWormEcology";

export interface UndergroundEcologyInput {
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
}

export interface UndergroundEcologyResult {
  readonly topics: readonly DataTopic[];
  readonly cellsChanged: number;
}

let lastEvaluatedYear: number | null = null;

/** Test helper: reset annual gate. */
export function resetUndergroundEcologyGate(): void {
  lastEvaluatedYear = null;
}

export function advanceUndergroundEcology(input: UndergroundEcologyInput): UndergroundEcologyResult {
  const { world, simulation } = input;
  if (simulation.currentMonth !== 1 || simulation.currentDay !== 1) return { topics: [], cellsChanged: 0 };

  const year = simulation.currentYear;
  if (lastEvaluatedYear === year) return { topics: [], cellsChanged: 0 };
  lastEvaluatedYear = year;

  const { cells, monsters } = world.pack;
  if (!cells.subterraneanVoid || !monsters?.length) return { topics: [], cellsChanged: 0 };

  const touched = growVoidFromWormActivity(monsters, cells, cells.subterraneanVoid);
  if (!touched.length) return { topics: [], cellsChanged: 0 };
  return { topics: ["simulation.cells"], cellsChanged: touched.length };
}
