/**
 * Shared employment commitment check: construction seats/apps xor cull contracts/apps.
 * Spec: docs/plan/player-threat-cull-jobs.md K10 / PR-3a.
 */
import {
  getConstructionHireApplications,
  getConstructionNamedSeats,
  getCullActiveContracts,
  getCullHireApplications
} from "../economyContext";

/** Named construction seat or pending construction application. */
export function characterHasConstructionCommitment(characterId: number): boolean {
  if (getConstructionNamedSeats().some(seat => seat.characterId === characterId)) return true;
  if (getConstructionHireApplications().some(app => app.characterId === characterId)) return true;
  return false;
}

/** Named cull contract or pending cull application (anon null ids ignored). */
export function characterHasCullCommitment(characterId: number): boolean {
  if (getCullActiveContracts().some(c => c.characterId === characterId)) return true;
  if (getCullHireApplications().some(app => app.characterId === characterId)) return true;
  return false;
}

/**
 * True when the character holds any named employment commitment
 * (construction or cull). Used to hard-block dual apply.
 */
export function characterHasEmploymentCommitment(characterId: number): boolean {
  return characterHasConstructionCommitment(characterId) || characterHasCullCommitment(characterId);
}
