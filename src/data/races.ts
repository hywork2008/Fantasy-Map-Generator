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
  CharacterGenderMode,
  CharacterRaceAppearance,
  Race,
  RaceBeautyIdeal,
  RaceCharacterAppearance,
  RaceFertility,
  RaceKey
} from "../types/models";

export interface RaceDefinition {
  key: RaceKey;
  name: string;
  characterGender?: CharacterGenderMode;
  lifespan: number;
  maxLifespan: number;
  looksBaseline: AppearanceAxes;
  beautyIdeal: RaceBeautyIdeal;
  fertility: RaceFertility;
  characterAppearance?: RaceCharacterAppearance;
}

const humanLooks: AppearanceAxes = {
  stature: 50,
  build: 50,
  symmetry: 50,
  refinement: 50,
  vitality: 55,
  ornament: 45
};

/** R_max ≈ 8.7 — pre-modern completed fertility under continuous pairing. */
const humanFertility: RaceFertility = {
  fertilityStart: 16,
  fertilityEnd: 45,
  interbirthYears: 3.5,
  litterMean: 1.05,
  litterMax: 3
};

const humanIdeal: RaceBeautyIdeal = {
  weights: { symmetry: 1.2, refinement: 0.8, vitality: 0.9, stature: 0.3, build: 0.2, ornament: 0.2 }
};

/**
 * Stable catalog order → race `i` at generation / migration.
 */
export const RACE_DEFINITIONS: readonly RaceDefinition[] = [
  {
    key: "unknown",
    name: "Unknown",
    lifespan: 75,
    maxLifespan: 100,
    looksBaseline: { ...humanLooks },
    beautyIdeal: humanIdeal,
    fertility: humanFertility
  },
  {
    key: "human",
    name: "Human",
    lifespan: 75,
    maxLifespan: 100,
    looksBaseline: { ...humanLooks },
    beautyIdeal: humanIdeal,
    fertility: humanFertility
  },
  {
    key: "elf",
    name: "Elf",
    lifespan: 750,
    maxLifespan: 1000,
    looksBaseline: { stature: 55, build: 35, symmetry: 65, refinement: 75, vitality: 60, ornament: 40 },
    beautyIdeal: {
      weights: { refinement: 1.4, symmetry: 1.1, stature: 0.4, build: -0.6, vitality: 0.5, ornament: 0.2 }
    },
    // R_max ≈ 2.5 (near-replacement; low adult mortality ⇒ must not explode)
    fertility: {
      fertilityStart: 100,
      fertilityEnd: 400,
      interbirthYears: 120,
      litterMean: 1.0,
      litterMax: 2
    }
  },
  {
    key: "dark_elf",
    name: "Dark Elf",
    lifespan: 700,
    maxLifespan: 950,
    looksBaseline: { stature: 50, build: 40, symmetry: 60, refinement: 70, vitality: 50, ornament: 55 },
    beautyIdeal: {
      weights: { refinement: 1.2, symmetry: 1.0, ornament: 0.7, vitality: 0.4, build: -0.3, stature: 0.3 }
    },
    // R_max ≈ 3.0 (slightly above high elves; higher war attrition assumed)
    fertility: {
      fertilityStart: 80,
      fertilityEnd: 380,
      interbirthYears: 100,
      litterMean: 1.0,
      litterMax: 2
    }
  },
  {
    key: "dwarf",
    name: "Dwarf",
    lifespan: 350,
    maxLifespan: 450,
    looksBaseline: { stature: 30, build: 70, symmetry: 50, refinement: 45, vitality: 60, ornament: 50 },
    beautyIdeal: {
      weights: { build: 1.2, vitality: 0.9, ornament: 0.6, symmetry: 0.7, stature: -0.4, refinement: 0.2 }
    },
    // R_max ≈ 4.2 (slow recovery, stable clans)
    fertility: {
      fertilityStart: 40,
      fertilityEnd: 160,
      interbirthYears: 30,
      litterMean: 1.05,
      litterMax: 2
    }
  },
  {
    key: "goblin",
    name: "Goblin",
    lifespan: 50,
    maxLifespan: 70,
    looksBaseline: { stature: 25, build: 40, symmetry: 40, refinement: 30, vitality: 50, ornament: 55 },
    beautyIdeal: {
      weights: { vitality: 1.0, ornament: 0.8, build: 0.5, symmetry: 0.3, refinement: -0.4, stature: 0.2 }
    },
    // R_max ≈ 33 (boom / bust; high juvenile death in macro demography later)
    fertility: {
      fertilityStart: 10,
      fertilityEnd: 35,
      interbirthYears: 1.5,
      litterMean: 2.0,
      litterMax: 5
    }
  },
  {
    key: "orc",
    name: "Orc",
    lifespan: 60,
    maxLifespan: 80,
    looksBaseline: { stature: 65, build: 75, symmetry: 45, refinement: 30, vitality: 65, ornament: 60 },
    beautyIdeal: {
      weights: { build: 1.4, stature: 1.0, ornament: 0.8, vitality: 0.9, refinement: -0.7, symmetry: 0.2 }
    },
    // R_max ≈ 14.6 (fast breeders, below goblin clutches)
    fertility: {
      fertilityStart: 12,
      fertilityEnd: 40,
      interbirthYears: 2.5,
      litterMean: 1.3,
      litterMax: 4
    }
  },
  {
    // God-line distant folk (Yotunn cultures): apex might + cyclopean craft; not hill-ogre colonies.
    // Deep-time continuity sits just below high elves / well below draconic (skills already apex).
    // Skills/personality: raceSkillBias / racePersonalityBias.
    key: "giant",
    name: "Giant",
    lifespan: 800,
    maxLifespan: 1200,
    looksBaseline: { stature: 90, build: 80, symmetry: 45, refinement: 35, vitality: 55, ornament: 40 },
    beautyIdeal: {
      weights: { stature: 1.5, build: 1.0, vitality: 0.7, symmetry: 0.4, refinement: -0.3, ornament: 0.2 }
    },
    // R_max ≈ 2.7 — near-replacement + century-scale spacing so polity-age lore tracks millennia
    // (not the old 250y / short-window profile that capped growth-age estimates ~1–2K years).
    fertility: {
      fertilityStart: 100,
      fertilityEnd: 450,
      interbirthYears: 130,
      litterMean: 1.0,
      litterMax: 2
    }
  },
  {
    key: "draconic",
    name: "Draconic",
    lifespan: 1200,
    maxLifespan: 2000,
    looksBaseline: { stature: 70, build: 65, symmetry: 55, refinement: 50, vitality: 70, ornament: 55 },
    beautyIdeal: {
      weights: { vitality: 1.2, stature: 0.9, ornament: 0.8, build: 0.7, symmetry: 0.5, refinement: 0.4 }
    },
    // R_max ≈ 2.5 (very slow; scarce clutches)
    fertility: {
      fertilityStart: 100,
      fertilityEnd: 500,
      interbirthYears: 160,
      litterMean: 1.0,
      litterMax: 3
    }
  },
  {
    key: "arachnid",
    name: "Arachnid",
    // Spider-kin: nest-bound predators. Trap-and-eat ecology makes multi-folk
    // co-residence unworkable — enemy-dedicated characters only (see raceSkillBias).
    lifespan: 60,
    maxLifespan: 100,
    looksBaseline: { stature: 40, build: 45, symmetry: 35, refinement: 40, vitality: 55, ornament: 70 },
    beautyIdeal: {
      weights: { ornament: 1.3, vitality: 0.8, refinement: 0.5, build: 0.4, symmetry: -0.2, stature: 0.3 }
    },
    // R_max ≈ 55 (egg-sac boom; most offspring do not reach adulthood in lore)
    fertility: {
      fertilityStart: 8,
      fertilityEnd: 30,
      interbirthYears: 1.2,
      litterMean: 3.0,
      litterMax: 8
    }
  },
  {
    key: "amazones",
    name: "Amazones",
    characterGender: "female_only",
    lifespan: 80,
    maxLifespan: 110,
    looksBaseline: { stature: 55, build: 60, symmetry: 52, refinement: 50, vitality: 65, ornament: 50 },
    beautyIdeal: {
      weights: { vitality: 1.2, build: 1.0, stature: 0.6, symmetry: 0.7, refinement: 0.4, ornament: 0.3 }
    },
    // R_max ≈ 9.5 (human-like; warrior attrition)
    fertility: {
      fertilityStart: 16,
      fertilityEnd: 42,
      interbirthYears: 3.0,
      litterMean: 1.1,
      litterMax: 3
    }
  },
  {
    // Bound servitors of draconic realms only — no independent cultures/states.
    // Fill merchant, craft, and desk roles dragons will not take (see raceBoundServitors).
    key: "wyrmkin",
    name: "Wyrmkin",
    lifespan: 55,
    maxLifespan: 75,
    looksBaseline: { stature: 38, build: 42, symmetry: 48, refinement: 42, vitality: 55, ornament: 68 },
    beautyIdeal: {
      weights: { ornament: 1.3, vitality: 0.8, symmetry: 0.5, refinement: 0.4, build: 0.3, stature: -0.2 }
    },
    // R_max ≈ 12 (short-lived thrall stock under long-lived masters)
    fertility: {
      fertilityStart: 14,
      fertilityEnd: 40,
      interbirthYears: 2.5,
      litterMean: 1.2,
      litterMax: 3
    }
  },
  {
    // Appended to preserve the ids of all races that existed in older saves.
    // Independent High/Dark Fantasy culture: Vharok (cultures-generator). Distant civic stance.
    key: "demon",
    name: "Demon",
    lifespan: 180,
    maxLifespan: 3000,
    looksBaseline: { stature: 55, build: 58, symmetry: 55, refinement: 52, vitality: 68, ornament: 72 },
    beautyIdeal: {
      weights: { ornament: 1.3, vitality: 1.0, symmetry: 0.7, stature: 0.5, build: 0.4, refinement: 0.2 }
    },
    // Human-shaped folk with one animal-inspired pair of horns per character.
    characterAppearance: {
      kind: "demon",
      hornAnimals: ["antelope", "bison", "buffalo", "gazelle", "goat", "ibex", "oryx", "ram", "yak"]
    },
    fertility: {
      fertilityStart: 24,
      fertilityEnd: 110,
      interbirthYears: 12,
      litterMean: 1.0,
      litterMax: 2
    }
  },
  {
    // Independent High/Dark Fantasy culture: Veldan (cultures-generator). Distant civic stance.
    key: "beastfolk",
    name: "Beastfolk",
    lifespan: 40,
    maxLifespan: 60,
    looksBaseline: { stature: 52, build: 57, symmetry: 50, refinement: 46, vitality: 68, ornament: 65 },
    beautyIdeal: {
      weights: { vitality: 1.2, ornament: 1.0, build: 0.6, stature: 0.4, symmetry: 0.3, refinement: 0.1 }
    },
    // 1 is almost human with animal ears/tail; 10 is a fully animal-like biped.
    characterAppearance: {
      kind: "beastfolk",
      animals: [
        "bear",
        "cat",
        "cattle",
        "deer",
        "dog",
        "fox",
        "goat",
        "hare",
        "horse",
        "lion",
        "otter",
        "raccoon",
        "tiger",
        "wolf"
      ],
      furryScale: { min: 1, max: 10 }
    },
    fertility: {
      fertilityStart: 12,
      fertilityEnd: 30,
      interbirthYears: 2,
      litterMean: 2.4,
      litterMax: 4
    }
  }
] as const;

export const DEFAULT_RACE_KEY: RaceKey = "human";
export const UNKNOWN_RACE_ID = 0;
export const HUMAN_RACE_ID = 1;

export const DEFAULT_RACE_LIFESPAN = 75;
export const DEFAULT_RACE_MAX_LIFESPAN = 100;

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
    ...(def.characterAppearance ? { characterAppearance: cloneCharacterAppearance(def.characterAppearance) } : {})
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
  } else {
    if (race.lifespan === undefined) race.lifespan = DEFAULT_RACE_LIFESPAN;
    if (race.maxLifespan === undefined) race.maxLifespan = DEFAULT_RACE_MAX_LIFESPAN;
    if (!race.fertility) race.fertility = { ...DEFAULT_RACE_FERTILITY };
  }
  if (race.maxLifespan! < race.lifespan!) {
    race.maxLifespan = race.lifespan;
  }
  if (!race.looksBaseline && def) race.looksBaseline = { ...def.looksBaseline };
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

function cloneCharacterAppearance(appearance: RaceCharacterAppearance): RaceCharacterAppearance {
  if (appearance.kind === "demon") return { kind: "demon", hornAnimals: [...appearance.hornAnimals] };
  return {
    kind: "beastfolk",
    animals: [...appearance.animals],
    furryScale: { ...appearance.furryScale }
  };
}
