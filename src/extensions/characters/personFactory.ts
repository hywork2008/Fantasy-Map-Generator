import { Names } from "../hostCore";
import { gauss, P, rand } from "../hostUtils";
import { APPEARANCE_DECLINE_PER_YEAR, DECLINE_AGE_THRESHOLD, prowessDeclineRateForCreation } from "./advanceAge";
import { getAbilityPreset } from "./charactersContext";
import type {
  AbilityProfile,
  Character,
  CharacterFamily,
  CharacterPersonality,
  CharacterRoleClass,
  CharacterSkills,
  Gender
} from "./characterTypes";
import { rollCharacterSkills } from "./skillGeneration";

/** Default adult age range rolled when no `ageOverride` is given. */
const DEFAULT_MIN_AGE = 28;
const DEFAULT_MAX_AGE = 65;

/**
 * Peak-of-life appearance (before age decline): normal distribution on 1–100.
 * μ=50 (ordinary faces dominate), σ=15 (~2/3 in 35–65, extremes rare).
 * Uniform 1–100 made beauty/ugliness too common for Favor / lust thresholds.
 */
export const APPEARANCE_MEAN = 50;
export const APPEARANCE_STDDEV = 15;

/** Roll peak appearance 1–100 (integer). Age decline is applied separately in createPerson. */
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
  /** Caller-specified gender. Omit to use the default feudal/nobility-biased roll. */
  genderOverride?: Gender;
  /** Ability preset id to roll into `abilityProfile` in addition to the mandatory skills/personality. Defaults to "ck3e" (no extra roll — same values, merged). */
  presetId?: string;
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
  isReligiousRole = false
): CharacterFamily {
  if (age < 16) {
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
  // A first-marriage age of 24 for women and 27 for men follows the c.1300 English estimate.
  const firstMarriageAge = gender === "female" ? rand(21, 26) : rand(24, 29);
  const yearsMarried = Math.max(0, age - firstMarriageAge);

  // For monogamy, child-bearing years are capped at ~30 years (e.g., age 16 to 46) due to menopause.
  // For polygamy/harem, the ruler can continually take younger spouses, so fertile years scale with age.
  const fertileYears = spouses === 1 ? Math.min(yearsMarried, 30) : yearsMarried;

  // Base rate: 1 surviving child every 4 years of fertility per spouse.
  const expectedChildren = spouses * (fertileYears / 4);
  let children = Math.round(expectedChildren * (0.5 + Math.random()));
  if (children < 0) children = 0;

  let grandchildren = 0;
  if (age >= 35) {
    grandchildren = Math.round(children * rand(1, 3) * ((age - 35) / 30));
  }

  let greatGrandchildren = 0;
  if (age >= 55) {
    greatGrandchildren = Math.round(grandchildren * rand(0, 2) * ((age - 55) / 20));
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
    homeStateId,
    marriageExpectation = "ordinary"
  } = options;
  const isReligiousRole = options.isReligiousRole ?? false;
  const presetId = options.presetId ?? "ck3e";
  // Religious roles without an explicit class still get learning-oriented skill means.
  const skillRoleClass: CharacterRoleClass | undefined = roleClass ?? (isReligiousRole ? "religious" : undefined);

  // デフォルトで90%を男性とする（特殊な文化設定がない場合の歴史的な封建制の再現）
  const gender: Gender = genderOverride ?? (P(0.9) ? "male" : "female");
  const age = ageOverride !== undefined ? ageOverride : rand(DEFAULT_MIN_AGE, DEFAULT_MAX_AGE);

  const guile = rand(1, 100);
  const piety = isReligiousRole ? rand(60, 100) : rand(1, 100);
  // Religious figures are typically zealous, unless they are highly guileful (deceitful)
  const zeal = isReligiousRole && guile < 70 ? rand(50, 100) : rand(1, 100);

  const baseAppearance = rollPeakAppearance();
  const appearance =
    age > DECLINE_AGE_THRESHOLD
      ? Math.max(1, baseAppearance - Math.floor((age - DECLINE_AGE_THRESHOLD) * APPEARANCE_DECLINE_PER_YEAR))
      : baseAppearance;

  // Occupation / office-biased gaussians (not uniform 1–100) — see skillGeneration.ts.
  const skills = rollCharacterSkills({ primarySkill, roleClass: skillRoleClass });

  // Physical decline for personal combat ability past peak age.
  // Career soldiers / martial primaries use half the civilian rate (see advanceAge.ts).
  if (age > DECLINE_AGE_THRESHOLD) {
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
    appearance,
    prestige: rand(1, 100),
    wealth: 0,
    titles: [],
    affinities: {},
    marriages: [],
    skills,
    personality,
    family: generateFamily(age, gender, formName, marriageExpectation, isReligiousRole),
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
