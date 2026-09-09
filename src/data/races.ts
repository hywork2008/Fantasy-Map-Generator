/**
 * Built-in race catalog.
 *
 * Race = species / folk traits (gender, lifespan, looks baselines, beauty ideals, fertility).
 * Culture = language, names, expansion style — and a reference to a race.
 *
 * Index 0 is reserved for "Unknown" (Wildlands / unset), matching culture id 0.
 *
 * Lifespans / beauty ideals are Western-fantasy genre defaults (Tolkien-ish /
 * D&D tabletop scale). Fertility is calibrated for **population simulation**:
 * long-lived races sit near replacement lifetime births (not human-scale
 * spacing stretched only a little). See docs/plan/characters/appearance-and-reproduction.md §3.
 *
 * Court sex ratio when `characterGender` is omitted follows typical lifespan
 * (short-lived ≈ feudal male bias; long-lived ≈ near parity / slight female majority).
 * See `maleShareForLifespan` in src/extensions/characters/raceAge.ts.
 *
 * World rule (beauty & pairing): same-race judgment uses phenotype + race ideals;
 * most cross-race looks are "incomprehensible / odd" (physique-only), but selected
 * asymmetric pairs have aesthetic readability (e.g. Human→Elf: fair-folk beauty
 * on the human scale). Cross-race pairing remains socially deviant.
 * See docs/world/help/races-beauty-and-pairing.md and appearance.ts.
 */
import type {
  AppearanceAxes,
  AppearanceRanges,
  CharacterRaceAppearance,
  Race,
  RaceBeautyIdeal,
  RaceCharacterAppearance,
  RaceFertility,
  RaceKey
} from "../types/models";
import { raceCatalog } from "./raceCatalog";
import type { RaceDefinition } from "./raceDefinition";
import { supernaturalForRaceKey } from "./raceSupernatural";

export type { RaceDefinition } from "./raceDefinition";

/** Generated from docs/plan/data/races.csv by npm run races:import. */
export const RACE_DEFINITIONS: readonly RaceDefinition[] = raceCatalog;
const humanLooks = RACE_DEFINITIONS[1].looksBaseline;
const humanIdeal = RACE_DEFINITIONS[1].beautyIdeal;
const humanFertility = RACE_DEFINITIONS[1].fertility;

export const DEFAULT_RACE_KEY: RaceKey = "human";
export const UNKNOWN_RACE_ID = 0;
export const HUMAN_RACE_ID = 1;

export const DEFAULT_RACE_LIFESPAN = RACE_DEFINITIONS[1].lifespan;
export const DEFAULT_RACE_MAX_LIFESPAN = RACE_DEFINITIONS[1].maxLifespan;

export const DEFAULT_RACE_FERTILITY: RaceFertility = { ...humanFertility };

/** Fresh race table for a new map (full catalog, fixed ids). */
export function createDefaultRaces(): Race[] {
  return RACE_DEFINITIONS.map((def, i) => definitionToRace(def, i));
}

function definitionToRace(def: RaceDefinition, i: number): Race {
  const race: Race = {
    i,
    key: def.key,
    name: def.name,
    lifespan: def.lifespan,
    maxLifespan: def.maxLifespan,
    looksBaseline: { ...def.looksBaseline },
    beautyIdeal: { weights: { ...def.beautyIdeal.weights } },
    fertility: { ...def.fertility },
    ...(def.looksRange ? { looksRange: cloneLooksRange(def.looksRange) } : {}),
    ...(def.characterAppearance ? { characterAppearance: cloneCharacterAppearance(def.characterAppearance) } : {}),
    ...(def.environmentalSurvival ? { environmentalSurvival: { ...def.environmentalSurvival } } : {}),
    supernatural: { ...supernaturalForRaceKey(def.key) }
  };
  if (def.characterGender) race.characterGender = def.characterGender;
  return race;
}

/** Fill missing catalog fields on a loaded race (lifespan, looks, fertility, ideals). */
export function applyCatalogLifespanDefaults(race: Race): Race {
  return applyCatalogRaceDefaults(race);
}

/**
 * Backfill / refresh catalog-derived race fields for older saves.
 * Built-in keys always re-sync lifespan + fertility from the current catalog so
 * balance patches (e.g. god-line giant deep time) apply without New Map.
 * Looks, beauty ideals, and character appearance options only fill when missing
 * (no race appearance editor yet).
 */
export function applyCatalogRaceDefaults(race: Race): Race {
  const def = RACE_DEFINITIONS.find(d => d.key === race.key);
  if (def) {
    race.lifespan = def.lifespan;
    race.maxLifespan = def.maxLifespan;
    race.fertility = { ...def.fertility };
    race.environmentalSurvival = def.environmentalSurvival ? { ...def.environmentalSurvival } : undefined;
    race.supernatural = { ...supernaturalForRaceKey(def.key) };
  } else {
    if (race.lifespan === undefined) race.lifespan = DEFAULT_RACE_LIFESPAN;
    if (race.maxLifespan === undefined) race.maxLifespan = DEFAULT_RACE_MAX_LIFESPAN;
    if (!race.fertility) race.fertility = { ...DEFAULT_RACE_FERTILITY };
    if (!race.supernatural) race.supernatural = { ...supernaturalForRaceKey(race.key) };
  }
  if (race.maxLifespan! < race.lifespan!) {
    race.maxLifespan = race.lifespan;
  }
  if (!race.looksBaseline && def) race.looksBaseline = { ...def.looksBaseline };
  if (!race.looksRange && def?.looksRange) race.looksRange = cloneLooksRange(def.looksRange);
  if (!race.beautyIdeal && def) race.beautyIdeal = { weights: { ...def.beautyIdeal.weights } };
  if (!race.characterAppearance && def?.characterAppearance) {
    race.characterAppearance = cloneCharacterAppearance(def.characterAppearance);
  }
  if (!race.fertility) race.fertility = { ...DEFAULT_RACE_FERTILITY };
  return race;
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

export function getRaceLifespan(races: readonly Race[] | undefined, raceId: number | undefined): number {
  const race = getRaceById(races, raceId);
  if (race?.lifespan !== undefined) return race.lifespan;
  const def = race ? RACE_DEFINITIONS.find(d => d.key === race.key) : undefined;
  return def?.lifespan ?? DEFAULT_RACE_LIFESPAN;
}

export function getRaceMaxLifespan(races: readonly Race[] | undefined, raceId: number | undefined): number {
  const race = getRaceById(races, raceId);
  if (race?.maxLifespan !== undefined) return race.maxLifespan;
  const def = race ? RACE_DEFINITIONS.find(d => d.key === race.key) : undefined;
  return def?.maxLifespan ?? DEFAULT_RACE_MAX_LIFESPAN;
}

export function getRaceFertility(races: readonly Race[] | undefined, raceId: number | undefined): RaceFertility {
  const race = getRaceById(races, raceId);
  if (race?.fertility) return race.fertility;
  const def = race ? RACE_DEFINITIONS.find(d => d.key === race.key) : undefined;
  return def ? { ...def.fertility } : { ...DEFAULT_RACE_FERTILITY };
}

export function getRaceLooksRange(
  races: readonly Race[] | undefined,
  raceId: number | undefined
): AppearanceRanges | undefined {
  const race = getRaceById(races, raceId);
  if (race?.looksRange) return race.looksRange;
  const def = race ? RACE_DEFINITIONS.find(d => d.key === race.key) : undefined;
  return def?.looksRange ? cloneLooksRange(def.looksRange) : undefined;
}

export function getRaceLooksBaseline(races: readonly Race[] | undefined, raceId: number | undefined): AppearanceAxes {
  const race = getRaceById(races, raceId);
  if (race?.looksBaseline) {
    return {
      stature: race.looksBaseline.stature ?? 50,
      build: race.looksBaseline.build ?? 50,
      symmetry: race.looksBaseline.symmetry ?? 50,
      refinement: race.looksBaseline.refinement ?? 50,
      vitality: race.looksBaseline.vitality ?? 55,
      ornament: race.looksBaseline.ornament ?? 45
    };
  }
  const def = race ? RACE_DEFINITIONS.find(d => d.key === race.key) : undefined;
  return def ? { ...def.looksBaseline } : { ...humanLooks };
}

export function getRaceBeautyIdeal(races: readonly Race[] | undefined, raceId: number | undefined): RaceBeautyIdeal {
  const race = getRaceById(races, raceId);
  if (race?.beautyIdeal) return race.beautyIdeal;
  const def = race ? RACE_DEFINITIONS.find(d => d.key === race.key) : undefined;
  return def ? { weights: { ...def.beautyIdeal.weights } } : humanIdeal;
}

/**
 * Roll a character's race-specific fantasy appearance from the catalogued options.
 * `randomInt` is injected so callers share their seeded world-generation RNG.
 */
export function rollCharacterRaceAppearance(
  race: Pick<Race, "characterAppearance"> | undefined,
  randomInt: (min: number, max: number) => number
): CharacterRaceAppearance | undefined {
  const appearance = race?.characterAppearance;
  if (!appearance) return undefined;

  if (appearance.kind === "demon") {
    const hornAnimal = appearance.hornAnimals[randomInt(0, appearance.hornAnimals.length - 1)];
    return hornAnimal ? { kind: "demon", hornAnimal } : undefined;
  }

  const animal = appearance.animals[randomInt(0, appearance.animals.length - 1)];
  if (!animal) return undefined;
  const min = Math.max(1, Math.ceil(appearance.furryScale.min));
  const max = Math.max(min, Math.min(10, Math.floor(appearance.furryScale.max)));
  return { kind: "beastfolk", animal, furryScale: randomInt(min, max) };
}

function cloneLooksRange(range: AppearanceRanges): AppearanceRanges {
  const out: AppearanceRanges = {};
  for (const [axis, span] of Object.entries(range) as [keyof AppearanceRanges, { min: number; max: number }][]) {
    if (!span) continue;
    out[axis] = { min: span.min, max: span.max };
  }
  return out;
}

function cloneCharacterAppearance(appearance: RaceCharacterAppearance): RaceCharacterAppearance {
  if (appearance.kind === "demon") return { kind: "demon", hornAnimals: [...appearance.hornAnimals] };
  return {
    kind: "beastfolk",
    animals: [...appearance.animals],
    furryScale: { ...appearance.furryScale }
  };
}
