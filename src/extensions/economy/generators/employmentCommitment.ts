/**
 * Shared employment commitment check: construction seats/apps xor cull xor escort.
 * Spec: docs/plan/player-threat-cull-jobs.md K10 / PR-3a; escort board same xor rule.
 */
import {
  getConstructionHireApplications,
  getConstructionNamedSeats,
  getCullActiveContracts,
  getCullHireApplications,
  getEscortActiveContracts,
  getEscortHireApplications
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

/** Named escort contract or pending escort application. */
export function characterHasEscortCommitment(characterId: number): boolean {
  if (getEscortActiveContracts().some(c => c.characterId === characterId)) return true;
  if (getEscortHireApplications().some(app => app.characterId === characterId)) return true;
  return false;
}

/**
 * True when the character holds any named employment commitment
 * (construction, cull, or escort). Used to hard-block dual apply.
 */
export function characterHasEmploymentCommitment(characterId: number): boolean {
  return (
    characterHasConstructionCommitment(characterId) ||
    characterHasCullCommitment(characterId) ||
    characterHasEscortCommitment(characterId)
  );
}
