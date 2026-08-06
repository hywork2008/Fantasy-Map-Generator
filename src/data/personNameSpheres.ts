/**
 * Cultural sphere locks for person names.
 *
 * Place names keep using culture.base (including fantasy Markov bases 32–40).
 * Person names for long-lived races prefer a **single** real-world name_base_id
 * sphere so the same homeland never mixes Greek + Norse + Japanese labels.
 *
 * Source data: docs/data/historical-person-names/cc0-mythic-ancient-names.csv (CC0).
 */
import type { Culture, Race } from "../types/models";
import { getRaceLifespan } from "./races";

/** Align with advanceAge.LONG_LIVED_LIFESPAN_MIN (keep data/ free of extension imports). */
export const MYTHIC_NAME_LIFESPAN_MIN = 150;

/**
 * Fantasy name bases → real-world person-name sphere (one sphere only).
 * Only used when culture.personNameBase is unset.
 */
export const FANTASY_BASE_PERSON_SPHERE: Readonly<Record<number, number>> = {
  // Elven Markov places → classical Greek mythic / ancient persons
  33: 7,
  // Dark Elven places → Mesopotamian mythic / ancient
  34: 23,
  // Dwarven places → Nordic mythic
  35: 6,
  // Giant places → German heroic legend
  38: 0,
  // Draconic places → Chinese mythic
  39: 11
  // 32 Human Generic, 36 Goblin, 37 Orc, 40 Arachnid: no mythic lock (Markov / short-lived)
};

/**
 * Resolve the person-name cultural sphere for a culture.
 * Priority: culture.personNameBase → fantasy base map → culture.base itself.
 */
export function resolvePersonNameSphere(culture: Pick<Culture, "base" | "personNameBase"> | undefined | null): number {
  if (!culture) return 1; // English fallback
  if (culture.personNameBase !== undefined && culture.personNameBase !== null) {
    return culture.personNameBase;
  }
  const mapped = FANTASY_BASE_PERSON_SPHERE[culture.base];
  if (mapped !== undefined) return mapped;
  return culture.base;
}

/** Whether this race should use mythic/ancient locked names when a pool exists. */
export function raceUsesMythicPersonNames(races: readonly Race[] | undefined, raceId: number | undefined): boolean {
  if (raceId === undefined) return false;
  const life = getRaceLifespan(races, raceId);
  return life >= MYTHIC_NAME_LIFESPAN_MIN;
}
