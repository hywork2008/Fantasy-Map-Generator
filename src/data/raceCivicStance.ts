/**
 * How each race relates to multi-folk politics on High/Dark Fantasy maps.
 *
 * - **diplomatic** (human, elf, dwarf): can war *or* ally; rare mixed polities.
 * - **distant** (dark elf, giant, draconic, amazones): civilized but keep distance; mono.
 * - **enemy_colony** (goblin, orc, arachnid): own colonies/lairs; hostile ecology; mono war courts.
 *
 * Multi-race states are uncommon — mono is the map default.
 * Lore: docs/world/help/multi-race-geopolitics.md
 */
import type { RaceKey } from "../types/models";

export type RaceCivicStance = "diplomatic" | "distant" | "enemy_colony";

/** Human / high elf / dwarf — “still people you can talk to” relative to other folk. */
export const DIPLOMATIC_CORE_RACE_KEYS: ReadonlySet<string> = new Set(["human", "elf", "dwarf"]);

/** Keep their own realms; not full enemies, not open multi-folk cities. */
export const DISTANT_RACE_KEYS: ReadonlySet<string> = new Set(["dark_elf", "giant", "draconic", "amazones"]);

/**
 * Self-contained hostile colonies / nests / warbands.
 * No mixed-court staffing; martial mono courts only (see characters raceSkillBias).
 */
export const ENEMY_COLONY_RACE_KEYS: ReadonlySet<string> = new Set(["goblin", "orc", "arachnid"]);

export function raceCivicStance(raceKey: RaceKey | string | undefined | null): RaceCivicStance {
  if (!raceKey) return "diplomatic";
  if (ENEMY_COLONY_RACE_KEYS.has(raceKey)) return "enemy_colony";
  if (DISTANT_RACE_KEYS.has(raceKey)) return "distant";
  if (DIPLOMATIC_CORE_RACE_KEYS.has(raceKey)) return "diplomatic";
  // unknown / future keys: treat as distant (closed) rather than cosmopolitan
  if (raceKey === "unknown") return "distant";
  return "distant";
}

export function isDiplomaticCoreRaceKey(raceKey: string | undefined | null): boolean {
  return !!raceKey && DIPLOMATIC_CORE_RACE_KEYS.has(raceKey);
}

export function isDistantRaceKey(raceKey: string | undefined | null): boolean {
  return raceCivicStance(raceKey) === "distant";
}

export function isEnemyColonyRaceKey(raceKey: string | undefined | null): boolean {
  return !!raceKey && ENEMY_COLONY_RACE_KEYS.has(raceKey);
}

/**
 * Chance a culture of this race is multi-folk (`monoRacial = false`).
 * Only diplomatic-core races can roll mixed; all others are always mono.
 */
export function mixedPolityChanceForRaceKey(raceKey: RaceKey | string | undefined | null): number {
  if (!isDiplomaticCoreRaceKey(raceKey)) return 0;
  if (raceKey === "human") return 0.18;
  if (raceKey === "elf" || raceKey === "dwarf") return 0.1;
  return 0;
}

/**
 * Default `Culture.monoRacial` when unset at culture binding.
 * @param roll01 unit interval random (injectable for tests)
 */
export function defaultMonoRacialForRaceKey(
  raceKey: RaceKey | string | undefined | null,
  roll01: () => number = Math.random
): boolean {
  const pMixed = mixedPolityChanceForRaceKey(raceKey);
  if (pMixed <= 0) return true;
  return roll01() >= pMixed;
}

/** Races allowed as minority / random staff in a rare mixed court. */
export function canAppearInMixedCourt(raceKey: string | undefined | null): boolean {
  return isDiplomaticCoreRaceKey(raceKey);
}
