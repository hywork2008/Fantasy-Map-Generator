/**
 * Shared invariants for Lich realms.
 *
 * Keep these rules independent of a particular generator: capitals, rulers, and
 * undead NPCs all consult the same policy rather than carrying their own limits.
 */
import type { Race } from "../../types/models";
import type { Character, CharacterRoleClass } from "./characterTypes";

export const MAX_LICHES_PER_MAP = 2;

export function raceKeyForId(races: readonly Race[] | undefined, raceId: number | undefined): string | undefined {
  if (raceId === undefined) return undefined;
  return races?.find(race => race.i === raceId)?.key;
}

export function isLichRaceId(races: readonly Race[] | undefined, raceId: number | undefined): boolean {
  return raceKeyForId(races, raceId) === "lich";
}

export function countLichCharacters(characters: readonly Character[], races: readonly Race[] | undefined): number {
  return characters.filter(character => isLichRaceId(races, character.race)).length;
}

export interface LichRulerEligibility {
  roleClass: CharacterRoleClass | undefined;
  stateRaceId: number | undefined;
  /** Explicit authorship may create a Lich ruler before a state has been attached. */
  isExplicitRaceOverride: boolean;
  existingCharacters: readonly Character[];
  races: readonly Race[] | undefined;
}

/** A Lich can exist only as a ruler, within the map-wide cap. */
export function mayCreateLichRuler({
  roleClass,
  stateRaceId,
  isExplicitRaceOverride,
  existingCharacters,
  races
}: LichRulerEligibility): boolean {
  return (
    roleClass === "ruler" &&
    (isExplicitRaceOverride || isLichRaceId(races, stateRaceId)) &&
    countLichCharacters(existingCharacters, races) < MAX_LICHES_PER_MAP
  );
}

/**
 * The map-wide invariant deliberately uses the youngest Lich. This ensures an
 * undead character can never exceed any Lich on the map, including after imports
 * or direct character creation outside the initial-generation pipeline.
 */
export function youngestLichAge(
  characters: readonly Character[],
  races: readonly Race[] | undefined
): number | undefined {
  const ages = characters.filter(character => isLichRaceId(races, character.race)).map(character => character.age);
  return ages.length ? Math.min(...ages) : undefined;
}

export function undeadAgeCap(lichAge: number): number {
  return Math.max(1, lichAge - 1);
}
