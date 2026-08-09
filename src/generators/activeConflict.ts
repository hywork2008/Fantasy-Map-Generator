import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import type { ConflictAutonomy } from "../types/WorldState";
import { normalizeConflictAutonomy } from "../utils/conflictAutonomy";

type ConflictAuthorization = { origin?: unknown };
type ConflictAuthorizationsByState = Record<string, Record<string, ConflictAuthorization>>;

function conflictAutonomy(): ConflictAutonomy {
  return normalizeConflictAutonomy(worldContext.options.conflictAutonomy);
}

function hasPlayerAuthorization(stateId: number): boolean {
  const nobility = simulationContext.extensions.nobility;
  if (typeof nobility !== "object" || nobility === null || Array.isArray(nobility)) return false;

  const authorizations = (nobility as Record<string, unknown>).conflictAuthorizationsByState;
  if (typeof authorizations !== "object" || authorizations === null || Array.isArray(authorizations)) return false;

  const byState = authorizations as ConflictAuthorizationsByState;
  if (Object.values(byState[String(stateId)] ?? {}).some(authorization => authorization?.origin === "player")) {
    return true;
  }

  return Object.values(byState).some(againstState => againstState[String(stateId)]?.origin === "player");
}

function hasCommittedStrategicGoal(stateId: number): boolean {
  if ((simulationContext.strategicGoals[stateId] ?? []).some(goal => goal.tension >= 100)) return true;

  return Object.values(simulationContext.strategicGoals).some(goals =>
    goals.some(goal => goal.tension >= 100 && goal.targetState === stateId)
  );
}

/**
 * Whether a state is participating in a conflict that is actually progressing.
 *
 * Player-directed maps require a persisted player authorization. Autonomous maps require a
 * committed strategic goal; a historical `diplomacy: "Enemy"` relation alone is never enough.
 */
export function isStateInActiveConflict(stateId: number): boolean {
  if (!Number.isInteger(stateId) || stateId <= 0) return false;
  return conflictAutonomy() === "playerDirected" ? hasPlayerAuthorization(stateId) : hasCommittedStrategicGoal(stateId);
}
