/**
 * Fantasy polity composition and race-scaled character rosters.
 *
 * - Mono is the map default (enemy colonies, distant folk, most diplomatic realms).
 * - Rare mixed polities: human / elf / dwarf cosmopolitan courts only; staff from those three.
 *
 * Lore: docs/world/help/multi-race-geopolitics.md
 */
import { isBoundServitorRaceKey, resolveRaceIdWithBoundServitor } from "../../data/raceBoundServitors";
import { canAppearInMixedCourt } from "../../data/raceCivicStance";
import { HUMAN_RACE_ID, UNKNOWN_RACE_ID } from "../../data/races";
import type { Culture, Race, State, StateRacialComposition } from "../../types/models";
import { P } from "../hostUtils";
import { getWorldContext, hasCharactersContext } from "./charactersContext";
import { isEnemyDedicatedRaceKey } from "./raceSkillBias";

/** Weighted pick among positive weights keyed by id. */
function pickWeightedId(weights: Record<number, number>): number {
  const entries = Object.entries(weights)
    .map(([k, w]) => [Number(k), w] as const)
    .filter(([, w]) => w > 0);
  if (!entries.length) return HUMAN_RACE_ID;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [id, w] of entries) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return entries[entries.length - 1]![0];
}

/** Reference lifespan for "human-scale" named-character density (weight ≈ 1). */
export const REFERENCE_LIFESPAN_YEARS = 75;

/**
 * Relative frequency of *named* characters of this race (0.2–1.4).
 * Long-lived folk are scarce; short-lived folk slightly over-represented.
 */
export function raceCharacterDensity(race: Pick<Race, "lifespan"> | undefined | null): number {
  const life = race?.lifespan ?? REFERENCE_LIFESPAN_YEARS;
  // elf 750 → ~0.32, dwarf 350 → ~0.46, human 75 → 1.0, goblin 50 → ~1.22
  const raw = Math.sqrt(REFERENCE_LIFESPAN_YEARS / Math.max(30, life));
  return Math.max(0.2, Math.min(1.4, raw));
}

export function getRaceByIdSafe(raceId: number | undefined): Race | undefined {
  if (raceId === undefined || !hasCharactersContext()) return undefined;
  try {
    return getWorldContext().pack.races?.[raceId];
  } catch {
    return undefined;
  }
}

/** Whether the state's culture is a mono-racial purity polity. */
export function isMonoRacialCulture(culture: Pick<Culture, "monoRacial"> | undefined | null): boolean {
  return !!culture?.monoRacial;
}

export function resolveStateRacialComposition(
  state: Pick<State, "racialComposition" | "culture">,
  culture?: Pick<Culture, "monoRacial"> | null
): StateRacialComposition {
  if (state.racialComposition === "mono" || state.racialComposition === "mixed") {
    return state.racialComposition;
  }
  return isMonoRacialCulture(culture) ? "mono" : "mixed";
}

/** Persist composition on the state object from its culture (call at character gen). */
export function ensureStateRacialComposition(state: State, culture?: Culture | null): StateRacialComposition {
  const composition = resolveStateRacialComposition(state, culture);
  state.racialComposition = composition;
  return composition;
}

/**
 * How many of `offices` to fill after the ruler, given the court's dominant race density.
 * Always returns an integer in [0, offices.length].
 */
export function selectCentralOfficeCount(officeCount: number, density: number): number {
  if (officeCount <= 0) return 0;
  // density 1 → all; 0.32 (elf) → ~2 of 5; 0.2 → at least 1 when count ≥ 3
  const n = Math.round(officeCount * Math.min(1, density));
  return Math.max(officeCount >= 1 ? 1 : 0, Math.min(officeCount, n));
}

/** Subset of offices to generate (stable order, first N by density). */
export function selectCentralOffices<T>(offices: readonly T[], density: number): T[] {
  const n = selectCentralOfficeCount(offices.length, density);
  return offices.slice(0, n) as T[];
}

/**
 * Sample a race id for a new court character.
 * Mono: culture race, or bound servitor when role is merchant/ordinary under a host (draconic→wyrmkin).
 * Mixed (rare): only diplomatic-core races (human / elf / dwarf); majority boosted.
 */
export function sampleRaceIdForState(
  state: Pick<State, "culture" | "racialComposition">,
  culture: Pick<Culture, "race" | "monoRacial"> | undefined | null,
  races: readonly Race[] | undefined | null,
  options?: { roleClass?: string }
): number {
  const majorityRace = culture?.race ?? HUMAN_RACE_ID;
  const composition = resolveStateRacialComposition(state, culture);
  if (composition === "mono") {
    const hostId = majorityRace > 0 ? majorityRace : HUMAN_RACE_ID;
    return resolveRaceIdWithBoundServitor(hostId, options?.roleClass, races);
  }

  if (!races?.length) return majorityRace > 0 ? majorityRace : HUMAN_RACE_ID;

  const weights: Record<number, number> = {};
  for (const race of races) {
    if (!race || race.removed || race.i === UNKNOWN_RACE_ID) continue;
    // Bound thralls and enemy colonies never staff free mixed courts.
    if (isEnemyDedicatedRaceKey(race.key)) continue;
    if (isBoundServitorRaceKey(race.key)) continue;
    // Distant folk and others stay out of rare cosmopolitan courts.
    if (!canAppearInMixedCourt(race.key) && race.i !== majorityRace) continue;
    // If majority is somehow non-diplomatic, still only seat diplomatic-core minorities.
    if (!canAppearInMixedCourt(race.key)) continue;
    let w = raceCharacterDensity(race);
    if (race.i === majorityRace) w *= 2.8; // cultural majority in mixed realms
    weights[race.i] = Math.max(0.05, w);
  }
  if (!Object.keys(weights).length) return majorityRace > 0 ? majorityRace : HUMAN_RACE_ID;
  return pickWeightedId(weights);
}

/** Prefer a culture that matches the race for name generation; fall back to state culture. */
export function pickCultureIdForRace(
  raceId: number,
  fallbackCultureId: number,
  cultures: readonly Culture[] | undefined | null
): number {
  if (!cultures?.length) return fallbackCultureId;
  const matches = cultures.filter(c => c.i && !c.removed && c.race === raceId);
  if (!matches.length) return fallbackCultureId;
  return matches[Math.floor(Math.random() * matches.length)]!.i;
}

/**
 * Bundle for createPerson: culture (names) + raceOverride.
 * Pass `roleClass` so draconic mono courts staff merchants/ordinary as wyrmkin.
 */
export function resolvePersonCultureAndRace(
  state: Pick<State, "i" | "culture" | "racialComposition">,
  pack: {
    cultures?: Culture[];
    races?: Race[];
  },
  options?: { roleClass?: string }
): { cultureId: number; raceId: number } {
  const culture = pack.cultures?.[state.culture];
  const raceId = sampleRaceIdForState(state, culture, pack.races, options);
  const composition = resolveStateRacialComposition(state, culture);
  if (composition === "mono") {
    // Bound servitors keep the host culture for names/language.
    return { cultureId: state.culture, raceId };
  }
  // Mixed: name-base from a culture of that race when possible
  const cultureId = pickCultureIdForRace(raceId, state.culture, pack.cultures);
  return { cultureId, raceId };
}

/**
 * Probability that a sparse role (frontier lord, field officer) is filled,
 * scaled by race density so long-lived mono courts stay thin.
 */
export function shouldGenerateSparseRole(density: number): boolean {
  // density 1 → always; 0.32 → ~45% after floor
  return P(Math.min(1, Math.max(0.25, density * 0.9 + 0.15)));
}

export function densityForState(
  state: Pick<State, "culture" | "racialComposition">,
  pack: { cultures?: Culture[]; races?: Race[] }
): number {
  const culture = pack.cultures?.[state.culture];
  const raceId = culture?.race ?? HUMAN_RACE_ID;
  const race = pack.races?.[raceId];
  // Mixed polities use human-scale full courts even if majority is long-lived
  // (multi-folk staff fill seats). Mono long-lived courts stay thin.
  const composition = resolveStateRacialComposition(state, culture);
  if (composition === "mixed") {
    return Math.max(0.85, raceCharacterDensity(race));
  }
  return raceCharacterDensity(race);
}
