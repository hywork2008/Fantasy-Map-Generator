import { simulationContext } from "../../context/simulationContext";
import type { ConflictAutonomy } from "../../types/WorldState";
import { normalizeConflictAutonomy } from "../../utils/conflictAutonomy";
import { getWorldContext } from "./nobilityContext";

/** Returns the saved map policy, preserving autonomous behavior for pre-policy maps. */
export function getConflictAutonomy(): ConflictAutonomy {
  return normalizeConflictAutonomy(getWorldContext().options.conflictAutonomy);
}

/** Whether Nobility may create or advance AI-originated interstate conflict this tick. */
export function mayAdvanceAutonomousConflict(): boolean {
  return getConflictAutonomy() === "autonomous";
}

/**
 * Removes AI war plans and only the march orders aimed at their target burgs.
 * Manual orders and ordinary garrison movement are deliberately preserved.
 */
function clearAutonomousConflictState(): void {
  const { pack } = getWorldContext();
  const goalTargetCellsByState = new Map<number, Set<number>>();

  for (const [stateId, goals] of Object.entries(simulationContext.strategicGoals)) {
    const targetCells = new Set<number>();
    for (const goal of goals) {
      const targetCell = pack.burgs[goal.targetBurg]?.cell;
      if (targetCell !== undefined) targetCells.add(targetCell);
    }
    if (targetCells.size > 0) goalTargetCellsByState.set(Number(stateId), targetCells);
  }

  for (const state of pack.states) {
    if (!state.i || state.removed) continue;
    const targetCells = goalTargetCellsByState.get(state.i);
    if (!targetCells) continue;

    for (const regiment of state.military ?? []) {
      const targetsPlannedSiege =
        regiment.goalTargetBurg !== undefined ||
        (regiment.destinationCell !== undefined && targetCells.has(regiment.destinationCell));
      if (!targetsPlannedSiege) continue;

      regiment.goalTargetBurg = undefined;
      regiment.destinationCell = undefined;
      regiment.path = undefined;
      regiment.pathIndex = undefined;
      regiment.edgeProgress = undefined;
      regiment.offRoad = undefined;
      regiment.actionStatus = "waiting";
    }
  }

  simulationContext.strategicGoals = {};
}

/**
 * Applies a mode selected by the host UI. The host persists the value before calling this through
 * fmg:conflict-autonomy-changed; this function owns Nobility's mode-transition cleanup.
 */
export function applyConflictAutonomy(value: unknown): void {
  if (normalizeConflictAutonomy(value) === "playerDirected") clearAutonomousConflictState();
}
