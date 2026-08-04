/**
 * Person-name picker: sphere-locked mythic/ancient CC0 lists for long-lived races.
 * Applies sphere-local variation so small pools do not collapse onto one form
 * (e.g. 8× "Inanna" in a dark-elf court).
 *
 * Falls back to Names.getCulture Markov when no pool or short-lived race.
 */

import type { Gender } from "../extensions/characters/characterTypes";
import type { Culture, Race } from "../types/models";
import { MYTHIC_NAMES_BY_BASE, type MythicAncientNameEntry } from "./mythicAncientNames";
import { raceUsesMythicPersonNames, resolvePersonNameSphere } from "./personNameSpheres";
import { normalizePersonNameKey, type PersonNameRandom, uniquifyMythicPersonName } from "./personNameVariation";

export type { PersonNameRandom };

function pickEntry(
  pool: readonly MythicAncientNameEntry[],
  gender: Gender | undefined,
  rnd: PersonNameRandom,
  /** Prefer entries whose exact form is still free. */
  used: ReadonlySet<string>
): MythicAncientNameEntry | null {
  if (!pool.length) return null;

  const byGender = (e: MythicAncientNameEntry): boolean => {
    if (gender !== "male" && gender !== "female") return true;
    return e.gender === gender || e.gender === "unknown";
  };

  const eligible = pool.filter(byGender);
  const candidates = eligible.length ? eligible : pool;

  const unused = candidates.filter(e => !used.has(normalizePersonNameKey(e.name)));
  const pickFrom = unused.length ? unused : candidates;
  return pickFrom[Math.floor(rnd() * pickFrom.length)] ?? null;
}

/**
 * Collect already-used character names for uniqueness (case-insensitive).
 * Optional `extraUsed` for batch generation before names hit pack.characters.
 */
export function collectUsedPersonNames(
  characters: readonly { name?: string; dead?: boolean }[] | undefined,
  extraUsed?: Iterable<string>
): Set<string> {
  const used = new Set<string>();
  if (characters) {
    for (const c of characters) {
      if (!c.name || c.dead) continue;
      used.add(normalizePersonNameKey(c.name));
    }
  }
  if (extraUsed) {
    for (const n of extraUsed) used.add(normalizePersonNameKey(n));
  }
  return used;
}

/**
 * Try to roll a mythic/ancient person name for this culture + race.
 * Returns null if the race is short-lived or the sphere has no CC0 pool
 * (caller should fall back to Markov Names.getCulture).
 */
export function tryRollMythicPersonName(options: {
  culture: Pick<Culture, "base" | "personNameBase"> | undefined | null;
  raceId: number | undefined;
  races: readonly Race[] | undefined;
  gender?: Gender;
  random?: PersonNameRandom;
  /** Living characters already named (for uniqueness). */
  existingCharacters?: readonly { name?: string; dead?: boolean }[];
  /** Names reserved in the current generation batch. */
  reservedNames?: Iterable<string>;
}): string | null {
  const { culture, raceId, races, gender } = options;
  const rnd = options.random ?? Math.random;
  if (!raceUsesMythicPersonNames(races, raceId)) return null;

  const sphere = resolvePersonNameSphere(culture);
  const pool = MYTHIC_NAMES_BY_BASE[sphere];
  if (!pool?.length) return null;

  const used = collectUsedPersonNames(options.existingCharacters, options.reservedNames);
  const entry = pickEntry(pool, gender, rnd, used);
  if (!entry) return null;

  const peerNames = pool.map(e => e.name);
  const name = uniquifyMythicPersonName({
    baseName: entry.name,
    sphereId: sphere,
    used,
    poolSize: pool.length,
    peerNames,
    random: rnd
  });

  return name;
}

/** Sphere id + pool size (for tests / UI). */
export function mythicPoolInfo(culture: Pick<Culture, "base" | "personNameBase"> | undefined | null): {
  sphereId: number;
  size: number;
} {
  const sphereId = resolvePersonNameSphere(culture);
  return { sphereId, size: MYTHIC_NAMES_BY_BASE[sphereId]?.length ?? 0 };
}
