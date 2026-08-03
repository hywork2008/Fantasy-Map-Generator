import { DEFAULT_RACE_KEY, getRaceById, HUMAN_RACE_ID, raceIdByKey } from "../../data/races";
import { Names } from "../hostCore";
import type { CharacterGenderMode } from "../hostTypes";
import { gauss, P, rand } from "../hostUtils";
import { DECLINE_AGE_THRESHOLD, prowessDeclineRateForCreation, raceIgnoresAgeDecline } from "./advanceAge";
import { rollLooksForRace } from "./appearance";
import { getAbilityPreset, getWorldContext, hasCharactersContext } from "./charactersContext";
import type {
  AbilityProfile,
  Character,
  CharacterFamily,
  CharacterPersonality,
  CharacterRoleClass,
  CharacterSkills,
  Gender
} from "./characterTypes";
import {
  expectedChildrenFromFertility,
  resolveFertilityForRace,
  rollFirstMarriageAge,
  sampleLitter
} from "./fertility";
import { rollCharacterSkills } from "./skillGeneration";

/** Default adult age range rolled when no `ageOverride` is given (human-scale roles). */
const DEFAULT_MIN_AGE = 28;
const DEFAULT_MAX_AGE = 65;

/**
 * Historical scalar appearance mean/σ (own-race cache still clusters near this for humans).
 * Multi-axis looks are preferred; see rollLooksForRace / attractiveness().
 */
export const APPEARANCE_MEAN = 50;
export const APPEARANCE_STDDEV = 15;

/** Peak scalar sample (1–100) — used by tests and as a simple noise source. Prefer looks axes. */
export function rollPeakAppearance(): number {
  return Math.max(1, Math.min(100, gauss(APPEARANCE_MEAN, APPEARANCE_STDDEV, 1, 100, 0)));
}

/** How strongly a character's role encourages forming a household. */
export type MarriageExpectation = "ordinary" | "elite" | "dynastic";

const PERMANENT_UNMARRIED_RATE: Record<MarriageExpectation, number> = {
  // A 20% baseline models the substantial definitive celibacy of the north-west European pattern.
  ordinary: 0.2,
  // Court officers and professional elites had better access to household formation.
  elite: 0.1,
  // Rulers and landed lords have a strong succession incentive to marry and produce heirs.
  dynastic: 0.03
};

const RELIGIOUS_UNMARRIED_RATE = 0.2;
const RELIGIOUS_FORMS = new Set(["Theocracy", "Holy State", "Bishopric"]);

export interface CreatePersonOptions {
  /**
   * Office / craft focus skill — gaussian mean pulled into the professional band
   * with a soft floor of 40 (see skillGeneration.ts). E.g. Marshal → "martial".
   */
  primarySkill?: keyof CharacterSkills;
  /**
   * Intended social/occupational role for skill medians (merchant, commander, …).
   * Callers should pass the same class they later give applyCharacterBackstory.
   */
  roleClass?: CharacterRoleClass;
  /** Caller-resolved flag (state form, office, etc.) — see isReligiousForm() callers in nobility. */
  isReligiousRole?: boolean;
  /** State.formName, used only to bias family structure (harem/celibacy patterns) — see generateFamily(). */
  formName?: string;
  /** Controls the chance of remaining unmarried; landed rulers use "dynastic". */
  marriageExpectation?: MarriageExpectation;
  /** Denormalized pointer stored on Character.state, e.g. for UI grouping/filtering. */
  homeStateId: number;
  ageOverride?: number;
  /** Caller-specified gender. Omit to use race `characterGender` policy, then feudal male bias. */
  genderOverride?: Gender;
  /**
   * pack.races id when different from culture.race (mixed polities).
   * Drives looks, fertility, gender policy, and Character.race.
   */
  raceOverride?: number;
  /** Ability preset id to roll into `abilityProfile` in addition to the mandatory skills/personality. Defaults to "ck3e" (no extra roll — same values, merged). */
  presetId?: string;
}

/**
 * Resolve pack.races id for a culture. Falls back to Human when races are missing (legacy maps).
 */
export function resolveRaceIdForCulture(cultureId: number): number {
  if (!hasCharactersContext()) return HUMAN_RACE_ID;
  try {
    const { pack } = getWorldContext();
    const culture = pack.cultures?.[cultureId];
    if (culture?.race !== undefined && culture.race !== null) return culture.race;
    if (pack.races?.length) return raceIdByKey(pack.races, culture?.raceKey ?? DEFAULT_RACE_KEY);
    return HUMAN_RACE_ID;
  } catch {
    return HUMAN_RACE_ID;
  }
}

/**
 * Read gender policy from a race id, with culture fallback when only cultureId is known.
 */
export function getRaceCharacterGenderMode(cultureId: number, raceId?: number): CharacterGenderMode | undefined {
  if (!hasCharactersContext()) return undefined;
  try {
    const { pack } = getWorldContext();
    const culture = pack.cultures?.[cultureId];
    const resolvedRaceId = raceId ?? culture?.race ?? resolveRaceIdForCulture(cultureId);
    const race = getRaceById(pack.races, resolvedRaceId);
    if (race?.characterGender) return race.characterGender;
    // Pre-split maps that still store gender on culture
    return culture?.characterGender;
  } catch {
    return undefined;
  }
}

/**
 * Resolve gender for a new person: explicit override → race policy → feudal male bias (~90%).
 * Amazones race (`characterGender: "female_only"`) forces female for every createPerson path
 * that does not pass genderOverride.
 */
export function resolvePersonGender(cultureId: number, genderOverride?: Gender, raceId?: number): Gender {
  if (genderOverride) return genderOverride;

  const mode = getRaceCharacterGenderMode(cultureId, raceId);
  if (mode === "female_only") return "female";
  if (mode === "balanced") return P(0.5) ? "male" : "female";
  // male_dominant or undefined: historical feudal court bias
  return P(0.9) ? "male" : "female";
}

function buildAbilityProfile(
  presetId: string,
  skills: CharacterSkills,
  personality: CharacterPersonality
): AbilityProfile {
  if (presetId === "ck3e") {
    return { presetId: "ck3e", values: { ...skills, ...personality } };
  }
  const preset = getAbilityPreset(presetId);
  return { presetId, values: preset ? preset.generate() : {} };
}

/**
 * Returns the chance that a person of this age has not married. It combines permanent
 * unmarriedness with late first marriage, rather than treating every adult as married from 16.
 */
export function getUnmarriedChance(
  age: number,
  marriageExpectation: MarriageExpectation,
  isReligiousRole: boolean,
  formName?: string
): number {
  if (age < 16) return 1;

  const isReligious = isReligiousRole || (formName !== undefined && RELIGIOUS_FORMS.has(formName));
  const permanentRate = isReligious ? RELIGIOUS_UNMARRIED_RATE : PERMANENT_UNMARRIED_RATE[marriageExpectation];

  // Medieval north-west European first marriages were commonly in the mid-to-late twenties.
  // Keep younger adults visibly unmarried while converging on their role's permanent rate at 28.
  if (age < 21) return Math.max(permanentRate, 0.8);
  if (age < 25) return Math.max(permanentRate, 0.45);
  if (age < 28) return Math.max(permanentRate, 0.28);
  return permanentRate;
}

export function generateFamily(
  age: number,
  gender: Gender,
  formName?: string,
  marriageExpectation: MarriageExpectation = "ordinary",
  isReligiousRole = false,
  /** pack.races id — drives interbirth interval and litter size. */
  raceId?: number
): CharacterFamily {
  const fertility = resolveFertilityForRace(raceId);
  if (age < fertility.fertilityStart) {
    return { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0, spouseIds: [], childIds: [] };
  }

  if (P(getUnmarriedChance(age, marriageExpectation, isReligiousRole, formName))) {
    return { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0, spouseIds: [], childIds: [] };
  }

  let spouseBase = 1; // Monogamy default
  if (formName) {
    if (["Horde", "Khaganate", "Khanate", "Empire"].includes(formName) && gender === "male") {
      spouseBase += rand(2, 6); // Harem
    } else if (["Emirate", "Caliphate", "Satrapy", "Beylik", "Sultanate"].includes(formName) && gender === "male") {
      spouseBase += rand(0, 3); // Polygamy
    }
  }

  const spouses = spouseBase;
  const firstMarriageAge = rollFirstMarriageAge(gender, fertility.fertilityStart);
  const yearsMarried = Math.max(0, age - firstMarriageAge);

  // Fertile window is race-specific; polygyny still multiplies birth events.
  const windowYears = Math.max(
    0,
    Math.min(age, fertility.fertilityEnd) - Math.max(firstMarriageAge, fertility.fertilityStart)
  );
  const fertileYears = spouses === 1 ? Math.min(yearsMarried, windowYears) : yearsMarried;

  const expected = expectedChildrenFromFertility(fertileYears, spouses, fertility);
  // Noise around expectation; for high litterMean races this still yields larger broods.
  let children = Math.round(expected * (0.55 + Math.random() * 0.9));
  // Ensure at least occasional multi-birth flavor when litterMean is high and years allow.
  if (children > 0 && fertility.litterMean >= 1.5 && P(0.35)) {
    children = Math.max(children, sampleLitter(fertility));
  }
  if (children < 0) children = 0;

  const grandStart = fertility.fertilityStart + 20;
  let grandchildren = 0;
  if (age >= grandStart) {
    grandchildren = Math.round(
      children * rand(1, 3) * ((age - grandStart) / Math.max(20, fertility.interbirthYears * 4))
    );
  }

  const greatStart = fertility.fertilityStart + 40;
  let greatGrandchildren = 0;
  if (age >= greatStart) {
    greatGrandchildren = Math.round(
      grandchildren * rand(0, 2) * ((age - greatStart) / Math.max(15, fertility.interbirthYears * 3))
    );
  }

  return { spouses, children, grandchildren, greatGrandchildren, spouseIds: [], childIds: [] };
}

/** Generic person factory — no title/office/state-political knowledge, reusable by any future NPC extension. */
export function createPerson(i: number, cultureId: number, options: CreatePersonOptions): Character {
  const {
    primarySkill,
    roleClass,
    formName,
    ageOverride,
    genderOverride,
    raceOverride,
    homeStateId,
    marriageExpectation = "ordinary"
  } = options;
  const isReligiousRole = options.isReligiousRole ?? false;
  const presetId = options.presetId ?? "ck3e";
  // Religious roles without an explicit class still get learning-oriented skill means.
  const skillRoleClass: CharacterRoleClass | undefined = roleClass ?? (isReligiousRole ? "religious" : undefined);

  const race = raceOverride ?? resolveRaceIdForCulture(cultureId);
  // Race policy (e.g. Amazones female_only) or feudal ~90% male default — see resolvePersonGender.
  const gender: Gender = resolvePersonGender(cultureId, genderOverride, race);
  const age = ageOverride !== undefined ? ageOverride : rand(DEFAULT_MIN_AGE, DEFAULT_MAX_AGE);

  const guile = rand(1, 100);
  const piety = isReligiousRole ? rand(60, 100) : rand(1, 100);
  // Religious figures are typically zealous, unless they are highly guileful (deceitful)
  const zeal = isReligiousRole && guile < 70 ? rand(50, 100) : rand(1, 100);

  // Long-lived races (elf, dwarf, …) take no human mid-life age penalties on looks/prowess.
  const raceLifespan = (() => {
    try {
      return getRaceById(getWorldContext().pack.races, race)?.lifespan;
    } catch {
      return undefined;
    }
  })();
  const skipAgePenalty = raceIgnoresAgeDecline(raceLifespan);
  const declineThreshold = skipAgePenalty ? Number.POSITIVE_INFINITY : DECLINE_AGE_THRESHOLD;
  const { looks, appearance } = rollLooksForRace(race, age, declineThreshold);

  // Occupation / office-biased gaussians (not uniform 1–100) — see skillGeneration.ts.
  const skills = rollCharacterSkills({ primarySkill, roleClass: skillRoleClass });

  // Physical decline for personal combat ability past peak age (human-scale races only).
  // Career soldiers / martial primaries use half the civilian rate (see advanceAge.ts).
  if (!skipAgePenalty && age > DECLINE_AGE_THRESHOLD) {
    const prowessRate = prowessDeclineRateForCreation(skillRoleClass, primarySkill);
    skills.prowess = Math.max(1, skills.prowess - Math.floor((age - DECLINE_AGE_THRESHOLD) * prowessRate));
  }

  // If character is a minor, drastically reduce base stats. They will grow over time in advanceCharacterAging.
  if (age < 16) {
    const ageFactor = Math.max(0.05, age / 16);
    for (const key of Object.keys(skills) as (keyof CharacterSkills)[]) {
      skills[key] = Math.max(1, Math.floor(skills[key] * ageFactor));
    }
  }

  const avgSkill = Math.round(
    (skills.artistry +
      skills.diplomacy +
      skills.engineering +
      skills.geography +
      skills.intrigue +
      skills.learning +
      skills.martial +
      skills.prowess +
      skills.stewardship) /
      9
  );

  // Confidence: based on average skill with a ±20 random variance
  const confidence = Math.max(1, Math.min(100, avgSkill + rand(-20, 20)));

  const personality: CharacterPersonality = {
    boldness: rand(1, 100),
    compassion: rand(1, 100),
    greed: rand(1, 100),
    honor: rand(1, 100),
    rationality: rand(1, 100),
    sociability: rand(1, 100),
    vengefulness: rand(1, 100),
    zeal,
    energy: rand(1, 100),
    piety,
    guile,
    confidence
  };

  // If character is a minor, neutralize personality towards 50 so babies don't act like evil masterminds.
  // They will slowly drift towards extremes in advanceCharacterAging.
  if (age < 16) {
    const ageFactor = Math.max(0.1, age / 16);
    for (const key of Object.keys(personality) as (keyof CharacterPersonality)[]) {
      if (key === "confidence") continue; // Handled differently
      const val = (personality as unknown as Record<string, number>)[key as string];
      (personality as unknown as Record<string, number>)[key as string] = Math.round(50 + (val - 50) * ageFactor);
    }
  }

  const character: Character = {
    i,
    name: Names.getCulture(cultureId),
    age,
    gender,
    culture: cultureId,
    race,
    looks,
    appearance,
    prestige: rand(1, 100),
    wealth: 0,
    titles: [],
    affinities: {},
    marriages: [],
    skills,
    personality,
    family: generateFamily(age, gender, formName, marriageExpectation, isReligiousRole, race),
    pastTitles: [],
    state: homeStateId
  };

  character.abilityProfile = buildAbilityProfile(presetId, skills, personality);

  return character;
}

/**
 * Fallback chain for reading an arbitrary ability-stat key off a character: the rolled
 * abilityProfile value, then the fixed skills/personality fields (for the "ck3e" keys), then the
 * preset's own default. Lets future callers read a preset-specific key without knowing which
 * preset a given character actually rolled.
 */
export function getAbilityValue(character: Character, key: string): number | undefined {
  if (character.abilityProfile?.values[key] !== undefined) {
    return character.abilityProfile.values[key];
  }
  if (key in character.skills) return character.skills[key as keyof CharacterSkills];
  if (key in character.personality) return character.personality[key as keyof CharacterPersonality];

  const preset = getAbilityPreset(character.abilityProfile?.presetId ?? "ck3e");
  return preset?.stats.find(stat => stat.key === key)?.default;
}
