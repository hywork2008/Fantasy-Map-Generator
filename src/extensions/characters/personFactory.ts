import { tryRollMythicPersonName } from "../../data/personNames";
import { resolveRaceIdWithBoundServitor, roleUsesBoundServitor } from "../../data/raceBoundServitors";
import {
  DEFAULT_RACE_KEY,
  getRaceBeautyIdeal,
  getRaceById,
  HUMAN_RACE_ID,
  raceIdByKey,
  rollCharacterRaceAppearance,
  UNKNOWN_RACE_ID
} from "../../data/races";
import type { RaceFertility } from "../../types/models";
import { APPEARANCE_AXIS_IDS } from "../../types/models";
import { Names } from "../hostCore";
import type { CharacterGenderMode } from "../hostTypes";
import { gauss, P, rand } from "../hostUtils";
import { DECLINE_AGE_THRESHOLD, prowessDeclineRateForCreation, raceIgnoresAgeDecline } from "./advanceAge";
import { ownRaceAppearanceScore, rollLooksForRace } from "./appearance";
import { HEALTH_FULL } from "./characterHealth";
import {
  getAbilityPreset,
  getSelectedAbilityPresetId,
  getWorldContext,
  hasCharactersContext,
  resolveAllowedCharacterRaceId
} from "./charactersContext";
import type {
  AbilityProfile,
  Character,
  CharacterFamily,
  CharacterGenerationBias,
  CharacterPersonality,
  CharacterRoleClass,
  CharacterSkills,
  Gender
} from "./characterTypes";
import {
  expectedChildrenEpisodic,
  expectedChildrenFromFertility,
  rearingSpanYears,
  resolveFertilityForRace,
  rollFirstMarriageAge,
  sampleLitter
} from "./fertility";
import {
  FEUDAL_MALE_SHARE,
  isRaceMinor,
  maleShareForRace,
  raceLateMarriageThresholds,
  raceUsesEpisodicPairing,
  rollDefaultAdultAge,
  rollYoungAdultAge
} from "./raceAge";
import { rollCharacterPersonality } from "./racePersonalityBias";
import { isEnemyDedicatedRaceKey, isEnemyDedicatedRole } from "./raceSkillBias";
import { rollCharacterSkills } from "./skillGeneration";

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

/**
 * "Young & striking" generation bias tuning (Nobility's opt-in generationBias option).
 *
 * GENERATION_BIAS_MAJORITY_SHARE: P(male) under "youngMaleHeavy" (and P(female) under
 * "youngFemaleHeavy", by symmetry) — many of one gender, few of the other, not an absolute lock,
 * mirroring how FEUDAL_MALE_SHARE (0.9) already models a lopsided-but-not-total default.
 *
 * GENERATION_BIAS_APPEARANCE_BOOST: axis points forwarded to rollLooksForRace's appearanceBiasBoost.
 * Each weighted axis's ideal-facing component shifts by ~this amount, and expandAppearanceScore
 * multiplies raw shifts by APPEARANCE_SCORE_SPREAD (2.35) — so 12 points aims the Appearance median
 * at roughly 50 + 12 * 2.35 ≈ 78 (clamped 1–100), a high median without flattening every roll to 100.
 */
export const GENERATION_BIAS_MAJORITY_SHARE = 0.85;
export const GENERATION_BIAS_APPEARANCE_BOOST = 12;

/**
 * Hard cap on how many *living* characters may carry a perfect 100 Appearance score at once,
 * regardless of map/roster size. 100 is meant to read as a rare, legendary outlier ("the fairest
 * in the realm"), not a routine outcome of GENERATION_BIAS_APPEARANCE_BOOST's high median — see
 * enforcePerfectAppearanceCap(), which callers run after every character creation.
 */
export const MAX_PERFECT_APPEARANCE_CHARACTERS = 3;

/**
 * Pushes a character's Appearance strictly below 100 by nudging their `looks` axes back off
 * whichever race-ideal direction they're weighted towards, then recomputing the cached
 * `appearance` score so the two stay consistent for attractiveness() callers. Bounded iteration
 * count is a safety net, not a tuning knob — a handful of 3-point nudges is always enough to clear
 * the ~21-raw-point margin expandAppearanceScore needs to reach 100.
 */
function nudgeLooksBelowPerfect(character: Character): void {
  if (!character.looks) return;
  const races = (() => {
    try {
      return getWorldContext().pack.races;
    } catch {
      return undefined;
    }
  })();
  const raceId = character.race ?? HUMAN_RACE_ID;
  const ideal = getRaceBeautyIdeal(races, raceId);
  let guard = 0;
  while (character.appearance >= 100 && guard < 25) {
    for (const axis of APPEARANCE_AXIS_IDS) {
      const weight = ideal.weights[axis];
      if (!weight) continue;
      character.looks[axis] =
        weight > 0 ? Math.max(1, character.looks[axis] - 3) : Math.min(100, character.looks[axis] + 3);
    }
    character.appearance = ownRaceAppearanceScore(character.looks, raceId, races);
    guard++;
  }
}

/**
 * Enforces MAX_PERFECT_APPEARANCE_CHARACTERS: if `character` rolled a perfect 100 Appearance but
 * `priorRoster` (the rest of the living roster this character is joining — must exclude
 * `character` itself) already holds the full budget of 100s, nudges `character` down to a still
 * very high but non-perfect score instead. Call once per newly created character, right after
 * createPerson() and before adding them to the roster the next character's call will see.
 */
export function enforcePerfectAppearanceCap(
  character: Character,
  priorRoster: readonly Pick<Character, "appearance" | "dead">[],
  maxPerfect: number = MAX_PERFECT_APPEARANCE_CHARACTERS
): void {
  if (character.appearance < 100) return;
  const existingPerfect = priorRoster.filter(c => !c.dead && c.appearance >= 100).length;
  if (existingPerfect < maxPerfect) return;
  nudgeLooksBelowPerfect(character);
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
  /**
   * Caller-specified gender. Omit to use race `characterGender` policy, else lifespan-based
   * court sex ratio (feudal male bias for short-lived; near parity / slight female majority
   * for long-lived).
   */
  genderOverride?: Gender;
  /**
   * pack.races id when different from culture.race (mixed polities).
   * Drives looks, fertility, gender policy, and Character.race.
   */
  raceOverride?: number;
  /**
   * Opt-in directorial skew — omit (or "none") for the existing fully-random rolls. When set,
   * overrides age (young-adult band, even over a caller-supplied `ageOverride`), Appearance
   * (high-median boost), and gender ratio (lopsided towards the named gender, unless the race has
   * a hard `female_only` lore lock). Currently only passed by Nobility's character creation —
   * see getCharacterGenerationBias() in src/extensions/nobility/nobilityContext.ts.
   */
  generationBias?: CharacterGenerationBias;
}

/**
 * Resolve pack.races id for a culture.
 * Wildlands / Unknown (race id 0) and missing races fall back to **Human** — named characters
 * (courtiers, merchants) must not spawn as the catalog "Unknown" entry.
 */
export function resolveRaceIdForCulture(cultureId: number): number {
  if (!hasCharactersContext()) return HUMAN_RACE_ID;
  try {
    const { pack } = getWorldContext();
    const culture = pack.cultures?.[cultureId];
    const raw =
      culture?.race !== undefined && culture.race !== null
        ? culture.race
        : pack.races?.length
          ? raceIdByKey(pack.races, culture?.raceKey ?? DEFAULT_RACE_KEY)
          : HUMAN_RACE_ID;
    // id 0 is the Unknown catalog slot (Wildlands culture); never use for people.
    if (raw === UNKNOWN_RACE_ID || raw === undefined || raw === null) return HUMAN_RACE_ID;
    if (pack.races?.length && !pack.races[raw]) return HUMAN_RACE_ID;
    return raw;
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
 * Resolve gender for a new person:
 * 1. explicit `genderOverride`
 * 2. race lore lock — Amazones (`female_only`) is always female, even under a generationBias
 *    request, for every createPerson path without genderOverride.
 * 3. explicit `generationBias` request ("youngMaleHeavy" / "youngFemaleHeavy") — overrides the
 *    race/culture `characterGender` policy and the lifespan default below with a lopsided ratio
 *    favoring the named gender (GENERATION_BIAS_MAJORITY_SHARE).
 * 4. race / culture `characterGender` policy (`balanced` / `male_dominant`)
 * 5. default from typical lifespan — short-lived ≈ feudal male court bias; long-lived ≈
 *    parity with a slight female majority (lower reproductive time-tax + male protector deaths).
 */
export function resolvePersonGender(
  cultureId: number,
  genderOverride?: Gender,
  raceId?: number,
  generationBias?: CharacterGenerationBias
): Gender {
  if (genderOverride) return genderOverride;

  const mode = getRaceCharacterGenderMode(cultureId, raceId);
  if (mode === "female_only") return "female";

  if (generationBias === "youngMaleHeavy") return P(GENERATION_BIAS_MAJORITY_SHARE) ? "male" : "female";
  if (generationBias === "youngFemaleHeavy") return P(1 - GENERATION_BIAS_MAJORITY_SHARE) ? "male" : "female";

  if (mode === "balanced") return P(0.5) ? "male" : "female";
  if (mode === "male_dominant") return P(FEUDAL_MALE_SHARE) ? "male" : "female";

  // No explicit policy: reproductive time-budget from lifespan.
  const resolvedRaceId = raceId ?? resolveRaceIdForCulture(cultureId);
  const maleShare = maleShareForRace(resolvedRaceId);
  return P(maleShare) ? "male" : "female";
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
 * unmarriedness with late first marriage, rather than treating every adult as married from maturity.
 * Thresholds scale with race maturity / lifespan when `raceId` is provided.
 */
export function getUnmarriedChance(
  age: number,
  marriageExpectation: MarriageExpectation,
  isReligiousRole: boolean,
  formName?: string,
  raceId?: number
): number {
  const { maturity, early, mid, established } = raceLateMarriageThresholds(raceId);
  if (age < maturity) return 1;

  const isReligious = isReligiousRole || (formName !== undefined && RELIGIOUS_FORMS.has(formName));
  const permanentRate = isReligious ? RELIGIOUS_UNMARRIED_RATE : PERMANENT_UNMARRIED_RATE[marriageExpectation];

  // Human baseline: mid-to-late twenties; race-scaled via raceLateMarriageThresholds.
  if (age < early) return Math.max(permanentRate, 0.8);
  if (age < mid) return Math.max(permanentRate, 0.45);
  if (age < established) return Math.max(permanentRate, 0.28);
  return permanentRate;
}

const EMPTY_FAMILY: CharacterFamily = {
  spouses: 0,
  children: 0,
  grandchildren: 0,
  greatGrandchildren: 0,
  spouseIds: [],
  childIds: []
};

/** Permanent childlessness (never parent) — separate from currently unpaired. */
const NEVER_PARENT_RATE: Record<MarriageExpectation, number> = {
  ordinary: 0.18,
  elite: 0.1,
  dynastic: 0.04
};

/**
 * Chance a long-lived person is **currently** in a co-parenting / household bond.
 * Default life state is unpaired; raising young and dynastic politics raise the rate.
 */
export function getEpisodicCurrentlyPairedChance(
  age: number,
  marriageExpectation: MarriageExpectation,
  isReligiousRole: boolean,
  formName: string | undefined,
  children: number,
  fertility: RaceFertility
): number {
  const isReligious = isReligiousRole || (formName !== undefined && RELIGIOUS_FORMS.has(formName));
  if (isReligious) return 0.05;
  if (age < fertility.fertilityStart) return 0;

  let p = marriageExpectation === "dynastic" ? 0.32 : marriageExpectation === "elite" ? 0.12 : 0.08;

  const rear = rearingSpanYears(fertility);
  if (children > 0) {
    if (age <= fertility.fertilityEnd + rear) p += 0.18;
    else if (age <= fertility.fertilityEnd + rear * 2) p += 0.08;
  }

  // Far past childbearing + rear: mostly solo again (political dynasts still pair more often).
  if (age > fertility.fertilityEnd + rear * 2) {
    const lateCap = marriageExpectation === "dynastic" ? 0.22 : marriageExpectation === "elite" ? 0.08 : 0.06;
    p = Math.min(p, lateCap);
  }

  return Math.min(0.55, p);
}

function rollFormSpouseCount(gender: Gender, formName: string | undefined): number {
  let spouseBase = 1;
  if (formName) {
    if (["Horde", "Khaganate", "Khanate", "Empire"].includes(formName) && gender === "male") {
      spouseBase += rand(2, 6); // Harem
    } else if (["Emirate", "Caliphate", "Satrapy", "Beylik", "Sultanate"].includes(formName) && gender === "male") {
      spouseBase += rand(0, 3); // Polygamy
    }
  }
  return spouseBase;
}

function rollDescendants(
  age: number,
  children: number,
  fertility: RaceFertility
): Pick<CharacterFamily, "grandchildren" | "greatGrandchildren"> {
  const grandStart = fertility.fertilityStart + Math.max(20, Math.round(fertility.interbirthYears * 0.5));
  let grandchildren = 0;
  if (age >= grandStart && children > 0) {
    grandchildren = Math.round(
      children * rand(1, 3) * ((age - grandStart) / Math.max(20, fertility.interbirthYears * 4))
    );
  }

  const greatStart = grandStart + Math.max(20, Math.round(fertility.interbirthYears * 0.5));
  let greatGrandchildren = 0;
  if (age >= greatStart && grandchildren > 0) {
    greatGrandchildren = Math.round(
      grandchildren * rand(0, 2) * ((age - greatStart) / Math.max(15, fertility.interbirthYears * 3))
    );
  }

  return { grandchildren, greatGrandchildren };
}

function rollChildCount(expected: number, fertility: RaceFertility): number {
  let children = Math.round(expected * (0.55 + Math.random() * 0.9));
  if (children > 0 && fertility.litterMean >= 1.5 && P(0.35)) {
    children = Math.max(children, sampleLitter(fertility));
  }
  return Math.max(0, children);
}

/**
 * Household snapshot at generation time.
 *
 * **Short-lived races:** continuous marriage model — unmarried ⇒ no household kids;
 * child counts scale with years married × race fertility.
 *
 * **Long-lived races (episodic pairing):** most of life is unpaired. Children come from
 * lifetime fertile progress × availability (not continuous cohabitation). Current spouses
 * are independent: more likely while co-parenting / for dynastic roles, not for centuries.
 */
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
    return { ...EMPTY_FAMILY };
  }

  if (raceUsesEpisodicPairing(raceId)) {
    return generateEpisodicFamily(age, gender, formName, marriageExpectation, isReligiousRole, fertility);
  }

  // ── Continuous marriage (human-scale / short-lived) ──────────────────────
  if (P(getUnmarriedChance(age, marriageExpectation, isReligiousRole, formName, raceId))) {
    return { ...EMPTY_FAMILY };
  }

  const spouses = rollFormSpouseCount(gender, formName);
  const firstMarriageAge = rollFirstMarriageAge(gender, fertility.fertilityStart);
  const yearsMarried = Math.max(0, age - firstMarriageAge);

  const windowYears = Math.max(
    0,
    Math.min(age, fertility.fertilityEnd) - Math.max(firstMarriageAge, fertility.fertilityStart)
  );
  const fertileYears = spouses === 1 ? Math.min(yearsMarried, windowYears) : yearsMarried;

  const expected = expectedChildrenFromFertility(fertileYears, spouses, fertility);
  const children = rollChildCount(expected, fertility);
  const { grandchildren, greatGrandchildren } = rollDescendants(age, children, fertility);

  return { spouses, children, grandchildren, greatGrandchildren, spouseIds: [], childIds: [] };
}

function generateEpisodicFamily(
  age: number,
  gender: Gender,
  formName: string | undefined,
  marriageExpectation: MarriageExpectation,
  isReligiousRole: boolean,
  fertility: RaceFertility
): CharacterFamily {
  const isReligious = isReligiousRole || (formName !== undefined && RELIGIOUS_FORMS.has(formName));
  const neverParentRate = isReligious ? 0.35 : NEVER_PARENT_RATE[marriageExpectation];

  let children = 0;
  if (!P(neverParentRate)) {
    // First co-parenting opportunity (social), not lifelong marriage age.
    const firstParentAge = rollFirstMarriageAge(gender, fertility.fertilityStart);
    const expected = expectedChildrenEpisodic(age, firstParentAge, fertility);
    children = rollChildCount(expected, fertility);
  }

  // Current household bond — independent of past children / partners.
  let spouses = 0;
  if (P(getEpisodicCurrentlyPairedChance(age, marriageExpectation, isReligiousRole, formName, children, fertility))) {
    spouses = rollFormSpouseCount(gender, formName);
  }

  const { grandchildren, greatGrandchildren } = rollDescendants(age, children, fertility);
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
    marriageExpectation = "ordinary",
    generationBias
  } = options;
  const isReligiousRole = options.isReligiousRole ?? false;
  const presetId = getSelectedAbilityPresetId();
  const usesCk3Systems = presetId === "ck3e";
  // Religious roles without an explicit class still get learning-oriented skill means.
  const skillRoleClass: CharacterRoleClass | undefined = roleClass ?? (isReligiousRole ? "religious" : undefined);

  // Race resolve order:
  // 1) culture host (or raceOverride for mixed courts / explicit callers)
  // 2) bound servitor swap when culture host is e.g. draconic and role is merchant/ordinary
  // 3) enemy-colony peaceful roles fall back to Human
  const cultureHostRace = resolveRaceIdForCulture(cultureId);
  const packRaces = (() => {
    try {
      return getWorldContext().pack.races;
    } catch {
      return undefined;
    }
  })();
  let race: number;
  if (roleUsesBoundServitor(skillRoleClass)) {
    // Always key off the culture’s majority race so draconic markets never spawn dragon merchants.
    race = resolveRaceIdWithBoundServitor(cultureHostRace, skillRoleClass, packRaces);
  } else {
    race = raceOverride ?? cultureHostRace;
  }
  const peekRaceKey = (() => {
    try {
      return getRaceById(getWorldContext().pack.races, race)?.key;
    } catch {
      return undefined;
    }
  })();
  if (isEnemyDedicatedRaceKey(peekRaceKey) && !isEnemyDedicatedRole(skillRoleClass, primarySkill)) {
    race = HUMAN_RACE_ID;
  }
  race = resolveAllowedCharacterRaceId(race, packRaces);
  // Race policy (e.g. Amazones female_only) or feudal ~90% male default — see resolvePersonGender.
  const gender: Gender = resolvePersonGender(cultureId, genderOverride, race, generationBias);
  // Ages scale with race maturity + lifespan (elves are not rolled as 28–65 year “adults”).
  // A generationBias request always wins the age roll, even over a caller-supplied ageOverride
  // (e.g. Nobility's rollOfficerAge/rollRulerAge/rollHereditaryHeirAge pre-rolls) — only Nobility
  // ever passes generationBias, so this never surprises any other createPerson caller.
  const isYoungBiased = generationBias === "youngMaleHeavy" || generationBias === "youngFemaleHeavy";
  const age = isYoungBiased
    ? rollYoungAdultAge(race)
    : ageOverride !== undefined
      ? ageOverride
      : rollDefaultAdultAge(race);

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
  const appearanceBiasBoost = isYoungBiased ? GENERATION_BIAS_APPEARANCE_BOOST : 0;
  const { looks, appearance } = rollLooksForRace(race, age, declineThreshold, appearanceBiasBoost);

  // CK3-specific occupation, personality, and minor-development rolls do not
  // exist on D&D characters. Their values live exclusively in abilityProfile.
  const raceDef = (() => {
    try {
      return getRaceById(getWorldContext().pack.races, race);
    } catch {
      return undefined;
    }
  })();
  const raceAppearance = rollCharacterRaceAppearance(raceDef, rand);
  const skills = {} as CharacterSkills;
  const personality = {} as CharacterPersonality;
  if (usesCk3Systems) {
    const guile = rand(1, 100);
    const piety = isReligiousRole ? rand(60, 100) : rand(1, 100);
    // Religious figures are typically zealous, unless they are highly guileful (deceitful)
    const zeal = isReligiousRole && guile < 70 ? rand(50, 100) : rand(1, 100);
    Object.assign(
      skills,
      rollCharacterSkills({
        primarySkill,
        roleClass: skillRoleClass,
        raceKey: raceDef?.key,
        lifespan: raceDef?.lifespan ?? raceLifespan
      })
    );

    // Physical decline for personal combat ability past peak age (human-scale races only).
    // Career soldiers / martial primaries use half the civilian rate (see advanceAge.ts).
    if (!skipAgePenalty && age > DECLINE_AGE_THRESHOLD) {
      const prowessRate = prowessDeclineRateForCreation(skillRoleClass, primarySkill);
      skills.prowess = Math.max(1, skills.prowess - Math.floor((age - DECLINE_AGE_THRESHOLD) * prowessRate));
    }

    // If character is a minor (below race maturity), drastically reduce base stats.
    // They will grow over time in advanceCharacterAging.
    if (isRaceMinor(age, race)) {
      const maturity = Math.max(1, raceLateMarriageThresholds(race).maturity);
      const ageFactor = Math.max(0.05, age / maturity);
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
    const confidence = Math.max(1, Math.min(100, avgSkill + rand(-20, 20)));
    Object.assign(
      personality,
      rollCharacterPersonality({
        raceKey: raceDef?.key,
        lifespan: raceDef?.lifespan ?? raceLifespan,
        presets: { zeal, piety, guile, confidence }
      })
    );

    // If character is a minor, neutralize personality towards 50 so babies don't act like evil masterminds.
    // They will slowly drift towards extremes in advanceCharacterAging.
    if (isRaceMinor(age, race)) {
      const maturity = Math.max(1, raceLateMarriageThresholds(race).maturity);
      const ageFactor = Math.max(0.1, age / maturity);
      for (const key of Object.keys(personality) as (keyof CharacterPersonality)[]) {
        if (key === "confidence") continue; // Handled differently
        const value = (personality as unknown as Record<string, number>)[key as string];
        (personality as unknown as Record<string, number>)[key as string] = Math.round(50 + (value - 50) * ageFactor);
      }
    }
  }

  const personName = (() => {
    try {
      const { pack } = getWorldContext();
      const culture = pack.cultures?.[cultureId];
      const mythic = tryRollMythicPersonName({
        culture,
        raceId: race,
        races: pack.races,
        gender,
        // Avoid 8× "Inanna": uniquify against living roster + names already rolled this batch.
        existingCharacters: pack.characters
      });
      if (mythic) return mythic;
    } catch {
      // fall through to Markov culture name
    }
    return Names.getCulture(cultureId);
  })();

  const character: Character = {
    i,
    name: personName,
    age,
    gender,
    culture: cultureId,
    race,
    looks,
    ...(raceAppearance ? { raceAppearance } : {}),
    appearance,
    prestige: rand(1, 100),
    wealth: 0,
    titles: [],
    affinities: {},
    marriages: [],
    skills,
    personality,
    // D&D characters do not receive a CK3-style age-derived household roll.
    family: usesCk3Systems
      ? generateFamily(age, gender, formName, marriageExpectation, isReligiousRole, race)
      : { ...EMPTY_FAMILY, spouseIds: [], childIds: [] },
    pastTitles: [],
    state: homeStateId,
    // New characters start in full health; characterHealth.ts's tick pass takes over from here.
    health: HEALTH_FULL
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
