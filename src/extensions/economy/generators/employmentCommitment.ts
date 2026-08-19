/**
 * Shared employment commitment check: construction seats/apps xor cull xor escort xor research.
 * Spec: docs/plan/player-threat-cull-jobs.md K10 / PR-3a; escort board same xor rule;
 * docs/plan/player-character-technology-bias.md K4.
 */
import {
  getConstructionHireApplications,
  getConstructionNamedSeats,
  getCullActiveContracts,
  getCullHireApplications,
  getEscortActiveContracts,
  getEscortHireApplications,
  getResearchHireApplications,
  getResearchInstructMissions,
  getResearchNamedSeats
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

/** Named research seat or pending research application. */
export function characterHasResearchCommitment(characterId: number): boolean {
  if (getResearchNamedSeats().some(seat => seat.characterId === characterId)) return true;
  if (getResearchHireApplications().some(app => app.characterId === characterId)) return true;
  if (getResearchInstructMissions().some(mission => mission.characterId === characterId)) return true;
  return false;
}

/**
 * True when the character holds any named employment commitment
 * (construction, cull, escort, or research). Used to hard-block dual apply.
 */
export function characterHasEmploymentCommitment(characterId: number): boolean {
  return (
    characterHasConstructionCommitment(characterId) ||
    characterHasCullCommitment(characterId) ||
    characterHasEscortCommitment(characterId) ||
    characterHasResearchCommitment(characterId)
  );
}
