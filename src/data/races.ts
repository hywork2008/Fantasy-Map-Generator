/**
 * Built-in race catalog.
 *
 * Race = species / folk traits (gender policy, future lifespan, etc.).
 * Culture = language, names, expansion style — and a reference to a race.
 *
 * Index 0 is reserved for "Unknown" (Wildlands / unset), matching culture id 0.
 */
import type { CharacterGenderMode, Race, RaceKey } from "../types/models";

export interface RaceDefinition {
  key: RaceKey;
  name: string;
  characterGender?: CharacterGenderMode;
}

/** Stable catalog order → race `i` at generation / migration. */
export const RACE_DEFINITIONS: readonly RaceDefinition[] = [
  { key: "unknown", name: "Unknown" },
  { key: "human", name: "Human" },
  { key: "elf", name: "Elf" },
  { key: "dark_elf", name: "Dark Elf" },
  { key: "dwarf", name: "Dwarf" },
  { key: "goblin", name: "Goblin" },
  { key: "orc", name: "Orc" },
  { key: "giant", name: "Giant" },
  { key: "draconic", name: "Draconic" },
  { key: "arachnid", name: "Arachnid" },
  { key: "serpent", name: "Serpent" },
  /** All-female warrior folk — Amazones polities force female characters. */
  { key: "amazones", name: "Amazones", characterGender: "female_only" }
] as const;

export const DEFAULT_RACE_KEY: RaceKey = "human";
export const UNKNOWN_RACE_ID = 0;
export const HUMAN_RACE_ID = 1;

/** Fresh race table for a new map (full catalog, fixed ids). */
export function createDefaultRaces(): Race[] {
  return RACE_DEFINITIONS.map((def, i) => {
    const race: Race = { i, key: def.key, name: def.name };
    if (def.characterGender) race.characterGender = def.characterGender;
    return race;
  });
}

export function raceIdByKey(races: readonly Race[], key: RaceKey | string | undefined): number {
  if (!key) return HUMAN_RACE_ID;
  const found = races.find(r => r.key === key);
  return found?.i ?? HUMAN_RACE_ID;
}

export function getRaceById(races: readonly Race[] | undefined, raceId: number | undefined): Race | undefined {
  if (!races || raceId === undefined || raceId < 0) return undefined;
  return races[raceId];
}
