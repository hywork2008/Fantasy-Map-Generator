/**
 * How long one "generation" is on *this* map (docs/plan/advance-time-history-mode.md §7).
 *
 * A history run is only worth doing if it outlives the people alive at the start of it — a
 * 10-year run on a human map produces almost no successions, and the same 10 years on an elven
 * map produces none at all. Rather than asking the user to guess a year count, the UI offers
 * "advance N generations" and converts it here, from the ages and lifespans of the rulers the map
 * actually has. A human-centric map lands around 25–40 years per generation; a map of elves and
 * dragons lands in the hundreds, which is the correct answer rather than a problem to clamp away.
 *
 * Deliberately kept in the host rather than the Characters extension: Advance Time's dialog is
 * core UI, and this only needs the pack's race table plus a read-only look at the roster.
 */
import { DEFAULT_RACE_LIFESPAN, getRaceLifespan } from "../../data/races";
import type { PackedGraph } from "../../types/PackedGraph";

/** Fallback when a map has no living landed rulers to measure (a fresh non-CK3 map, say). */
export const DEFAULT_YEARS_PER_GENERATION = 30;

/** The minimal shape this needs; the full Character type belongs to the Characters extension. */
interface RulerLike {
  readonly age?: number;
  readonly dead?: boolean;
  readonly race?: number;
  readonly culture?: number;
  readonly titles?: readonly { readonly landed?: boolean; readonly entityType?: string }[];
}

function isLivingLandedRuler(character: RulerLike): boolean {
  if (character.dead) return false;
  if (!(typeof character.age === "number") || !Number.isFinite(character.age)) return false;
  return (character.titles ?? []).some(title => title.landed === true && title.entityType === "state");
}

/** Mirrors the Characters extension's resolveCharacterRaceId(): explicit race, else the culture's. */
function resolveRaceId(pack: PackedGraph, character: RulerLike): number | undefined {
  if (character.race !== undefined && character.race !== null) return character.race;
  if (character.culture === undefined) return undefined;
  const culture = pack.cultures?.[character.culture] as { race?: number } | undefined;
  return culture?.race ?? undefined;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Median remaining lifespan of the map's living landed rulers, rounded to whole years.
 *
 * The median rather than the mean on purpose: one 700-year-old elf among thirty humans should not
 * turn a human map's generation into two centuries.
 */
export function yearsPerRulerGeneration(pack: PackedGraph | undefined): number {
  const characters = (pack as unknown as { characters?: readonly RulerLike[] } | undefined)?.characters;
  if (!pack || !characters?.length) return DEFAULT_YEARS_PER_GENERATION;

  const remaining: number[] = [];
  for (const character of characters) {
    if (!isLivingLandedRuler(character)) continue;
    const raceId = resolveRaceId(pack, character);
    const lifespan = raceId === undefined ? DEFAULT_RACE_LIFESPAN : getRaceLifespan(pack.races, raceId);
    remaining.push(Math.max(1, lifespan - (character.age ?? 0)));
  }

  if (!remaining.length) return DEFAULT_YEARS_PER_GENERATION;
  return Math.max(1, Math.round(median(remaining)));
}
