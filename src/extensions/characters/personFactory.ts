import { Names } from "../hostCore";
import { P, rand } from "../hostUtils";
import { APPEARANCE_DECLINE_PER_YEAR, DECLINE_AGE_THRESHOLD, PROWESS_DECLINE_PER_YEAR } from "./advanceAge";
import { getAbilityPreset } from "./charactersContext";
import type {
  AbilityProfile,
  Character,
  CharacterFamily,
  CharacterPersonality,
  CharacterSkills,
  Gender
} from "./characterTypes";

/** Default adult age range rolled when no `ageOverride` is given. */
const DEFAULT_MIN_AGE = 28;
const DEFAULT_MAX_AGE = 65;

export interface CreatePersonOptions {
  /** Biases one skill's roll upward (40-100 instead of 1-100) — e.g. a state's Marshal biases "martial". */
  primarySkill?: keyof CharacterSkills;
  /** Caller-resolved flag (state form, office, etc.) — see isReligiousForm() callers in nobility. */
  isReligiousRole?: boolean;
  /** State.formName, used only to bias family structure (harem/celibacy patterns) — see generateFamily(). */
  formName?: string;
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

export function generateFamily(age: number, gender: Gender, formName?: string): CharacterFamily {
  if (age < 16) {
    return { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0, spouseIds: [], childIds: [] };
  }

  let spouseBase = 1; // Monogamy default
  if (formName) {
    if (["Horde", "Khaganate", "Khanate", "Empire"].includes(formName) && gender === "male") {
      spouseBase += rand(2, 6); // Harem
    } else if (["Emirate", "Caliphate", "Satrapy", "Beylik", "Sultanate"].includes(formName) && gender === "male") {
      spouseBase += rand(0, 3); // Polygamy
    } else if (["Theocracy", "Holy State", "Bishopric"].includes(formName)) {
      spouseBase = P(0.8) ? 1 : 0; // Celibacy chance
    }
  }

  const spouses = spouseBase;
  const yearsMarried = Math.max(0, age - 16);

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
  const { primarySkill, formName, ageOverride, genderOverride, homeStateId } = options;
  const isReligiousRole = options.isReligiousRole ?? false;
  const presetId = options.presetId ?? "ck3e";

  // デフォルトで90%を男性とする（特殊な文化設定がない場合の歴史的な封建制の再現）
  const gender: Gender = genderOverride ?? (P(0.9) ? "male" : "female");
  const age = ageOverride !== undefined ? ageOverride : rand(DEFAULT_MIN_AGE, DEFAULT_MAX_AGE);

  const guile = rand(1, 100);
  const piety = isReligiousRole ? rand(60, 100) : rand(1, 100);
  // Religious figures are typically zealous, unless they are highly guileful (deceitful)
  const zeal = isReligiousRole && guile < 70 ? rand(50, 100) : rand(1, 100);

  const baseAppearance = rand(1, 100);
  const appearance =
    age > DECLINE_AGE_THRESHOLD
      ? Math.max(1, baseAppearance - Math.floor((age - DECLINE_AGE_THRESHOLD) * APPEARANCE_DECLINE_PER_YEAR))
      : baseAppearance;

  const baseProwess = primarySkill === "prowess" ? rand(40, 100) : rand(1, 100);
  // Physical decline
  const prowess =
    age > DECLINE_AGE_THRESHOLD
      ? Math.max(1, baseProwess - Math.floor((age - DECLINE_AGE_THRESHOLD) * PROWESS_DECLINE_PER_YEAR))
      : baseProwess;

  const skills: CharacterSkills = {
    artistry: rand(1, 100),
    diplomacy: primarySkill === "diplomacy" ? rand(40, 100) : rand(1, 100),
    engineering: rand(1, 100),
    geography: rand(1, 100),
    intrigue: primarySkill === "intrigue" ? rand(40, 100) : rand(1, 100),
    learning: primarySkill === "learning" ? rand(40, 100) : rand(1, 100),
    martial: primarySkill === "martial" ? rand(40, 100) : rand(1, 100),
    prowess,
    stewardship: primarySkill === "stewardship" ? rand(40, 100) : rand(1, 100)
  };

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
    titles: [],
    affinities: {},
    marriages: [],
    skills,
    personality,
    family: generateFamily(age, gender, formName),
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
