/**
 * Shared invariants for Lich realms.
 *
 * Keep these rules independent of a particular generator: capitals, rulers, and
 * undead NPCs all consult the same policy rather than carrying their own limits.
 */
import type { Race } from "../../types/models";
import type { Character, CharacterRoleClass } from "./characterTypes";

/** Minimal race identity used by policy lookups (id-indexed or sparse tables). */
export type RaceIdentity = Pick<Race, "i" | "key"> & { removed?: boolean };

export const MAX_LICHES_PER_MAP = 2;

export const LICH_RACE_KEY = "lich";
export const UNDEAD_THRALL_RACE_KEYS = ["zombie", "skeleton"] as const;
export const UNDEAD_RACE_KEYS = [LICH_RACE_KEY, ...UNDEAD_THRALL_RACE_KEYS] as const;

const UNDEAD_THRALL_RACE_KEY_SET = new Set<string>(UNDEAD_THRALL_RACE_KEYS);
const UNDEAD_RACE_KEY_SET = new Set<string>(UNDEAD_RACE_KEYS);
const MORTAL_BASE_EXCLUDED_RACE_KEYS = new Set<string>(["demon", "fallen_angel", "unknown", ...UNDEAD_RACE_KEYS]);

export function isLichRaceKey(key: string | undefined | null): key is typeof LICH_RACE_KEY {
  return key === LICH_RACE_KEY;
}

export function isUndeadThrallRaceKey(key: string | undefined | null): key is (typeof UNDEAD_THRALL_RACE_KEYS)[number] {
  return !!key && UNDEAD_THRALL_RACE_KEY_SET.has(key);
}

export function isUndeadRaceKey(key: string | undefined | null): key is (typeof UNDEAD_RACE_KEYS)[number] {
  return !!key && UNDEAD_RACE_KEY_SET.has(key);
}

export function raceKeyForId(
  races: readonly RaceIdentity[] | undefined,
  raceId: number | undefined
): string | undefined {
  if (raceId === undefined || !races) return undefined;
  const indexed = races[raceId];
  if (indexed?.i === raceId) return indexed.key;
  return races.find(race => race.i === raceId)?.key;
}

export function isLichRaceId(races: readonly RaceIdentity[] | undefined, raceId: number | undefined): boolean {
  return isLichRaceKey(raceKeyForId(races, raceId));
}

export function isLichCharacter(
  character: Pick<Character, "race">,
  races: readonly RaceIdentity[] | undefined
): boolean {
  return isLichRaceId(races, character.race);
}

/** True when a culture's majority race is Lich. */
export function isLichCulture(
  races: readonly RaceIdentity[] | undefined,
  culture: { race?: number } | undefined
): boolean {
  return isLichRaceId(races, culture?.race);
}

/** True when `cultures[cultureId]` is a Lich folk. */
export function isLichCultureId(
  races: readonly RaceIdentity[] | undefined,
  cultures: readonly { race?: number }[] | undefined,
  cultureId: number | undefined
): boolean {
  if (cultureId === undefined) return false;
  return isLichCulture(races, cultures?.[cultureId]);
}

/** True when a state's culture majority race is Lich. */
export function isLichState(
  races: readonly RaceIdentity[] | undefined,
  cultures: readonly { race?: number }[] | undefined,
  state: { culture?: number } | undefined
): boolean {
  return isLichCultureId(races, cultures, state?.culture);
}

export function countLichCharacters(
  characters: readonly Character[],
  races: readonly RaceIdentity[] | undefined
): number {
  return characters.filter(character => isLichRaceId(races, character.race)).length;
}

export interface LichRulerEligibility {
  roleClass: CharacterRoleClass | undefined;
  stateRaceId: number | undefined;
  /** Explicit authorship may create a Lich ruler before a state has been attached. */
  isExplicitRaceOverride: boolean;
  existingCharacters: readonly Character[];
  races: readonly RaceIdentity[] | undefined;
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
 * When a generated person cannot remain Lich, demote to a thrall rather than a living race.
 * Zombie is preferred; Skeleton is the fallback; otherwise `humanRaceId`.
 */
export function fallbackRaceIdWhenLichDisallowed(
  races: readonly RaceIdentity[] | undefined,
  humanRaceId: number
): number {
  if (!races?.length) return humanRaceId;
  const zombie = races.find(race => race.key === "zombie" && !race.removed);
  if (zombie) return zombie.i;
  const skeleton = races.find(race => race.key === "skeleton" && !race.removed);
  if (skeleton) return skeleton.i;
  return humanRaceId;
}

/** Living folk that an undead body may remember as its mortal origin. */
export function isEligibleMortalBaseRace(race: RaceIdentity): boolean {
  return race.i > 0 && !race.removed && !MORTAL_BASE_EXCLUDED_RACE_KEYS.has(race.key);
}

/**
 * The map-wide invariant deliberately uses the youngest Lich. This ensures an
 * undead character can never exceed any Lich on the map, including after imports
 * or direct character creation outside the initial-generation pipeline.
 */
export function youngestLichAge(
  characters: readonly Character[],
  races: readonly RaceIdentity[] | undefined
): number | undefined {
  const ages = characters.filter(character => isLichRaceId(races, character.race)).map(character => character.age);
  return ages.length ? Math.min(...ages) : undefined;
}

export function undeadAgeCap(lichAge: number): number {
  return Math.max(1, lichAge - 1);
}
