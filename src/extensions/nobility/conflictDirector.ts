import { type StrategicGoal, simulationContext } from "../../context/simulationContext";
import type { ConflictAutonomy } from "../../types/WorldState";
import { normalizeConflictAutonomy } from "../../utils/conflictAutonomy";
import { getWorldContext, hasNobilityContext } from "./nobilityContext";
import type { ConflictAuthorization } from "./types";

export interface PlayerConflictIntent {
  attackerStateId: number;
  defenderStateId: number;
}

export type StartPlayerConflictResult = { started: true } | { started: false; reason: "invalid-state" | "same-state" };

/** Returns the saved map policy, preserving autonomous behavior for pre-policy maps. */
export function getConflictAutonomy(): ConflictAutonomy {
  return normalizeConflictAutonomy(getWorldContext().options.conflictAutonomy);
}

/** Whether Nobility may create or advance AI-originated interstate conflict this tick. */
export function mayAdvanceAutonomousConflict(): boolean {
  return getConflictAutonomy() === "autonomous";
}

/** True when this state pair may fight under the map's current conflict-autonomy policy. */
export function mayAdvanceConflict(attackerStateId: number, defenderStateId: number): boolean {
  if (!hasNobilityContext()) return true;
  return mayAdvanceAutonomousConflict() || isPlayerConflictAuthorized(attackerStateId, defenderStateId);
}

/** Avoids running the political-AI branch in player-directed mode until the player starts a conflict. */
export function mayAdvanceAnyConflict(): boolean {
  if (mayAdvanceAutonomousConflict()) return true;
  return getWorldContext().pack.states.some(state => Object.keys(state.conflictAuthorizations ?? {}).length > 0);
}

export function isPlayerConflictAuthorized(attackerStateId: number, defenderStateId: number): boolean {
  return getWorldContext().pack.states[attackerStateId]?.conflictAuthorizations?.[defenderStateId]?.origin === "player";
}

/**
 * Records a user-authorized conflict in both states, then ensures its diplomacy is hostile.
 * The record is part of `State`, so the existing map serializer persists it without a new save slot.
 */
export function startPlayerConflict({
  attackerStateId,
  defenderStateId
}: PlayerConflictIntent): StartPlayerConflictResult {
  if (attackerStateId === defenderStateId) return { started: false, reason: "same-state" };

  const { pack } = getWorldContext();
  const attacker = pack.states[attackerStateId];
  const defender = pack.states[defenderStateId];
  if (!attacker || !defender || attacker.removed || defender.removed || !attacker.i || !defender.i) {
    return { started: false, reason: "invalid-state" };
  }

  const authorization: ConflictAuthorization = {
    origin: "player",
    startedAt: {
      year: simulationContext.currentYear,
      month: simulationContext.currentMonth,
      day: simulationContext.currentDay
    }
  };
  attacker.conflictAuthorizations = { ...attacker.conflictAuthorizations, [defenderStateId]: authorization };
  defender.conflictAuthorizations = { ...defender.conflictAuthorizations, [attackerStateId]: authorization };
  if (attacker.diplomacy) attacker.diplomacy[defenderStateId] = "Enemy";
  if (defender.diplomacy) defender.diplomacy[attackerStateId] = "Enemy";
  return { started: true };
}

/** Ends a player-approved conflict and removes only its associated pending strategic goals. */
export function endPlayerConflict({ attackerStateId, defenderStateId }: PlayerConflictIntent): void {
  const { pack } = getWorldContext();
  const attacker = pack.states[attackerStateId];
  const defender = pack.states[defenderStateId];
  if (attacker?.conflictAuthorizations) delete attacker.conflictAuthorizations[defenderStateId];
  if (defender?.conflictAuthorizations) delete defender.conflictAuthorizations[attackerStateId];

  discardStrategicGoals(
    (stateId, goal) =>
      (stateId === attackerStateId && goal.targetState === defenderStateId) ||
      (stateId === defenderStateId && goal.targetState === attackerStateId)
  );
}

/** Removes selected goals and the automatic march orders aimed at their target burgs. */
function discardStrategicGoals(shouldDiscard: (stateId: number, goal: StrategicGoal) => boolean): void {
  const { pack } = getWorldContext();
  const goalTargetCellsByState = new Map<number, Set<number>>();
  const goalTargetBurgsByState = new Map<number, Set<number>>();

  for (const [stateId, goals] of Object.entries(simulationContext.strategicGoals)) {
    const numericStateId = Number(stateId);
    const targetCells = new Set<number>();
    const targetBurgs = new Set<number>();
    for (const goal of goals) {
      if (!shouldDiscard(numericStateId, goal)) continue;
      targetBurgs.add(goal.targetBurg);
      const targetCell = pack.burgs[goal.targetBurg]?.cell;
      if (targetCell !== undefined) targetCells.add(targetCell);
    }
    if (targetCells.size > 0) goalTargetCellsByState.set(numericStateId, targetCells);
    if (targetBurgs.size > 0) goalTargetBurgsByState.set(numericStateId, targetBurgs);
  }

  for (const state of pack.states) {
    if (!state.i || state.removed) continue;
    const targetCells = goalTargetCellsByState.get(state.i);
    const targetBurgs = goalTargetBurgsByState.get(state.i);
    if (!targetCells && !targetBurgs) continue;

    for (const regiment of state.military ?? []) {
      const targetsPlannedSiege =
        (regiment.goalTargetBurg !== undefined && targetBurgs?.has(regiment.goalTargetBurg)) ||
        (regiment.destinationCell !== undefined && targetCells?.has(regiment.destinationCell));
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

  for (const [stateId, goals] of Object.entries(simulationContext.strategicGoals)) {
    const numericStateId = Number(stateId);
    const retainedGoals = goals.filter(goal => !shouldDiscard(numericStateId, goal));
    if (retainedGoals.length) simulationContext.strategicGoals[numericStateId] = retainedGoals;
    else delete simulationContext.strategicGoals[numericStateId];
  }
}

function clearAutonomousConflictState(): void {
  discardStrategicGoals(() => true);
}

/**
 * Applies a mode selected by the host UI. The host persists the value before calling this through
 * fmg:conflict-autonomy-changed; this function owns Nobility's mode-transition cleanup.
 */
export function applyConflictAutonomy(value: unknown): void {
  if (normalizeConflictAutonomy(value) === "playerDirected") clearAutonomousConflictState();
}
