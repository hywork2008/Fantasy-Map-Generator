import { getWorldContext, hasCharactersContext } from "./charactersContext";
import type {
  Character,
  CharacterBackstory,
  CharacterOrigin,
  CharacterPersonality,
  CharacterSkills
} from "./characterTypes";
import { getPersonalityDescriptionKeys } from "./personalityDescription";
import { getRomanceDescriptionKeys, type RomanceDescriptionContext } from "./romanceDescription";

export type SocialCompatibilityType =
  | "caring"
  | "principled"
  | "analytical"
  | "adventurous"
  | "guarded"
  | "ambitious"
  | "reserved"
  | "balanced";
export type RomanticCompatibilityType = "withdrawn" | "devoted" | "passionate" | "plural" | "independent" | "measured";
export interface CompatibilityProfile {
  social: SocialCompatibilityType;
  romantic: RomanticCompatibilityType;
  jealous: boolean;
  compassionate: boolean;
  flavorKeys: string[];
}

export interface RomanceDiversityConfig {
  upbringing?: boolean;
  commitment?: boolean;
  skills?: boolean;
  uniqueOffset?: boolean;
}

export interface RomanceCompatibilityContext extends RomanceDescriptionContext {
  characterId?: number;
  origin?: CharacterOrigin;
  backstory?: CharacterBackstory;
  skills?: CharacterSkills;
  diversityConfig?: RomanceDiversityConfig;
}

/** Stable semantic flavor IDs, never translated prose, supply the classification evidence.
 * When diversity options are enabled, upbringing, commitment, skills and unique offsets
 * allow general and romantic profiles to diverge (e.g. analytical at court but passionate in private).
 */
export function getCompatibilityProfile(
  personalityOrCharacter: CharacterPersonality | CompatibilityCharacter,
  context: RomanceCompatibilityContext = {}
): CompatibilityProfile {
  const isChar = "personality" in personalityOrCharacter;
  const personality = isChar ? personalityOrCharacter.personality : personalityOrCharacter;
  const char = isChar ? (personalityOrCharacter as CompatibilityCharacter) : undefined;

  const charOrigin = context.origin ?? char?.origin ?? char?.backstory?.origin;
  const charBackstory = context.backstory ?? char?.backstory;
  const charSkills = context.skills ?? char?.skills;
  const charId = context.characterId ?? char?.i ?? 0;
  const diversityConfig = context.diversityConfig;

  const flavorKeys = [
    ...getPersonalityDescriptionKeys(personality),
    ...getRomanceDescriptionKeys(personality, context)
  ];
  const ids = new Set(flavorKeys.map(key => key.split(".").at(-1)));
  const has = (...keys: string[]) => keys.some(key => ids.has(key));
  const social: SocialCompatibilityType = has(
    "selflessAffection",
    "quietAffection",
    "caringAffection",
    "discreetCompassion"
  )
    ? "caring"
    : has(
          "uncompromisingHonor",
          "honorable",
          "principledAmbition",
          "unyieldingFairShare",
          "nobleChivalry",
          "zealousInquisitor"
        )
      ? "principled"
      : has(
            "rigorousReasoning",
            "calculatedRisk",
            "audaciousCalculation",
            "reasonedAffection",
            "deliberateMethod",
            "rationalSkeptic"
          )
        ? "analytical"
        : has(
              "socialMask",
              "guardedIntentions",
              "socialIndirect",
              "privateIndirect",
              "guardedAffection",
              "coldCalculation",
              "ruthlessDominance",
              "paranoidPurger"
            )
          ? "guarded"
          : has("insatiable", "opportunist", "bargainer", "profitBeforePromises", "predatoryGreed", "tyrannicalWill")
            ? "ambitious"
            : has(
                  "impulsive",
                  "suddenImpulse",
                  "explosiveImpulse",
                  "daring",
                  "riskSeeking",
                  "romanticRush",
                  "ardentPursuit",
                  "headlongRush",
                  "ruthlessVengeance",
                  "openHostility",
                  "capriciousTerror"
                )
              ? "adventurous"
              : has(
                    "cautious",
                    "riskAvoidant",
                    "solitary",
                    "private",
                    "unhurried",
                    "minimalEffort",
                    "independentAffection"
                  )
                ? "reserved"
                : "balanced";

  // Base scores reflecting personality-driven evidence
  const scores: Record<RomanticCompatibilityType, number> = {
    withdrawn: has("retreatFromRomance", "passiveRomance") ? 50 : 0,
    plural: has("hiddenLovers", "insatiableAffection", "multipleLovers") ? 45 : 0,
    devoted: has("faithfulMonogamy", "honorablePlurality", "honorableSeasons", "localPromises") ? 40 : 0,
    passionate: has("romanticRush", "ardentPursuit", "absorbingAffection", "quietLonging") ? 35 : 0,
    independent: has("selfDefinedBonds", "independentAffection", "reasonedAffection") ? 30 : 0,
    measured: 10
  };

  // 1. Upbringing (origin.raisedIn)
  if (diversityConfig?.upbringing && charOrigin?.raisedIn) {
    const r = charOrigin.raisedIn;
    if (r === "monastery") {
      scores.withdrawn += 45;
      scores.measured += 20;
      scores.passionate -= 25;
      scores.plural -= 30;
    } else if (r === "capital_court" || r === "foreign_court") {
      scores.plural += 35;
      scores.passionate += 20;
      scores.measured -= 10;
    } else if (r === "street") {
      scores.independent += 35;
      scores.devoted += 15;
    } else if (r === "military_camp") {
      scores.independent += 25;
      scores.measured += 25;
    } else if (r === "rural_manor") {
      scores.measured += 25;
      scores.devoted += 20;
    }
  }

  // 2. Life Commitment (backstory.commitment.primary.kind)
  if (diversityConfig?.commitment && charBackstory?.commitment) {
    const commitmentObj = charBackstory.commitment as unknown as { kind?: string; primary?: { kind?: string } };
    const k = commitmentObj.kind ?? commitmentObj.primary?.kind;
    if (k === "pleasure" || k === "hedonism") {
      scores.plural += 55;
      scores.passionate += 25;
      scores.devoted -= 25;
    } else if (k === "family" || k === "house") {
      scores.devoted += 45;
      scores.plural -= 25;
    } else if (k === "code" || k === "faith" || k === "ideology") {
      scores.devoted += 35;
      scores.withdrawn += 20;
      scores.plural -= 35;
    } else if (k === "self") {
      scores.independent += 45;
      scores.devoted -= 15;
    } else if (k === "order" || k === "realm" || k === "state" || k === "domain" || k === "office") {
      scores.independent += 25;
      scores.measured += 25;
      scores.passionate -= 15;
    }
  }

  // 3. Skills (artistry, intrigue, learning)
  if (diversityConfig?.skills && charSkills) {
    if (charSkills.artistry >= 65) {
      scores.passionate += Math.round((charSkills.artistry - 40) * 1.2);
    }
    if (charSkills.intrigue >= 65) {
      scores.plural += Math.round((charSkills.intrigue - 40) * 1.1);
    }
    if (charSkills.learning >= 65) {
      scores.independent += 20;
      scores.measured += 20;
    }
  }

  // 4. Unique Romantic Temperament Offset (deterministic character ID hash)
  if (diversityConfig?.uniqueOffset && charId > 0) {
    const hash = (seed: number, salt: number) => {
      let x = (Math.imul(seed ^ (salt * 0x45d9f3b), 1103515245) + 12345) & 0x7fffffff;
      x = ((x >>> 16) ^ x) * 0x45d9f3b;
      x = ((x >>> 16) ^ x) & 0x7fffffff;
      return (x % 51) - 25; // -25 .. +25
    };
    scores.passionate += hash(charId, 1);
    scores.devoted += hash(charId, 2);
    scores.independent += hash(charId, 3);
    scores.withdrawn += hash(charId, 4);
    scores.plural += hash(charId, 5);
    scores.measured += hash(charId, 6);
  }

  // Select the highest-scoring romantic type
  const romanticTypes: RomanticCompatibilityType[] = [
    "withdrawn",
    "plural",
    "devoted",
    "passionate",
    "independent",
    "measured"
  ];
  let romantic: RomanticCompatibilityType = "measured";
  let maxScore = -Infinity;
  for (const t of romanticTypes) {
    if (scores[t] > maxScore) {
      maxScore = scores[t];
      romantic = t;
    }
  }

  return {
    social,
    romantic,
    flavorKeys,
    jealous: has("restrainedJealousy", "consumingJealousy", "schemingJealousy", "fierceJealousy"),
    compassionate: has("restrainedJealousy", "gentleConflict")
  };
}

interface PairRule<T> {
  types: readonly [T, T];
  friendship: number;
  romance: number;
  friction: number;
  reason: string;
}
// Deltas to neutral scores, not probabilities. Pair rules are deliberately symmetric.
const socialRules: PairRule<SocialCompatibilityType>[] = [
  { types: ["caring", "caring"], friendship: 30, romance: 10, friction: -15, reason: "mutualCare" },
  { types: ["caring", "reserved"], friendship: 25, romance: 5, friction: -10, reason: "gentleSpace" },
  { types: ["caring", "principled"], friendship: 25, romance: 10, friction: -10, reason: "trustAndCare" },
  { types: ["caring", "balanced"], friendship: 25, romance: 5, friction: -15, reason: "mutualCare" },
  { types: ["analytical", "analytical"], friendship: 30, romance: 0, friction: -10, reason: "sharedReasoning" },
  { types: ["analytical", "principled"], friendship: 25, romance: 0, friction: -5, reason: "reliablePartners" },
  { types: ["reserved", "reserved"], friendship: 25, romance: -10, friction: -10, reason: "sharedQuiet" },
  { types: ["reserved", "balanced"], friendship: 20, romance: 0, friction: -10, reason: "gentleSpace" },
  { types: ["adventurous", "adventurous"], friendship: 25, romance: 15, friction: 10, reason: "sharedAdventure" },
  { types: ["principled", "principled"], friendship: 25, romance: 5, friction: -10, reason: "sharedPromises" },
  { types: ["ambitious", "ambitious"], friendship: 5, romance: 0, friction: 30, reason: "competingRewards" },
  { types: ["guarded", "guarded"], friendship: -5, romance: 0, friction: 20, reason: "mutualSuspicion" },
  { types: ["principled", "ambitious"], friendship: -20, romance: -10, friction: 35, reason: "dutyAndAdvantage" },
  { types: ["principled", "guarded"], friendship: -15, romance: -10, friction: 30, reason: "opennessAndSecrets" },
  { types: ["analytical", "adventurous"], friendship: -10, romance: 0, friction: 25, reason: "reasonAndImpulse" },
  { types: ["reserved", "adventurous"], friendship: -15, romance: -10, friction: 30, reason: "differentPace" },
  { types: ["caring", "ambitious"], friendship: -10, romance: -5, friction: 20, reason: "careAndDemand" }
];
const romanticRules: PairRule<RomanticCompatibilityType>[] = [
  { types: ["devoted", "devoted"], friendship: 10, romance: 30, friction: -10, reason: "lastingBond" },
  { types: ["passionate", "passionate"], friendship: 5, romance: 35, friction: 10, reason: "mutualPassion" },
  { types: ["devoted", "passionate"], friendship: 10, romance: 25, friction: 5, reason: "devotionAndPassion" },
  { types: ["devoted", "measured"], friendship: 15, romance: 20, friction: -5, reason: "lastingBond" },
  {
    types: ["independent", "independent"],
    friendship: 20,
    romance: -10,
    friction: -10,
    reason: "comfortableIndependence"
  },
  {
    types: ["independent", "measured"],
    friendship: 20,
    romance: 0,
    friction: -10,
    reason: "comfortableIndependence"
  },
  { types: ["measured", "measured"], friendship: 0, romance: 15, friction: 0, reason: "measuredSteadiness" },
  { types: ["withdrawn", "withdrawn"], friendship: 15, romance: -35, friction: -10, reason: "neitherInitiates" },
  { types: ["withdrawn", "passionate"], friendship: -10, romance: -25, friction: 25, reason: "pursuitAndRetreat" },
  { types: ["independent", "passionate"], friendship: -5, romance: 5, friction: 20, reason: "closenessAndFreedom" },
  { types: ["devoted", "plural"], friendship: -15, romance: -25, friction: 40, reason: "conflictingCommitments" },
  { types: ["plural", "plural"], friendship: 5, romance: 15, friction: 15, reason: "sharedAppetite" }
];

export type CompatibilityCharacter = Pick<Character, "i" | "gender" | "personality" | "appearance"> &
  Partial<Pick<Character, "family" | "favor" | "dead" | "race" | "age" | "culture" | "backstory" | "skills">> & {
    origin?: CharacterOrigin;
  };
export type CompatibilityTendency = "friendship" | "romance" | "both" | "friction" | "volatile" | "situational";
export interface RelationshipCompatibilityContext extends RomanceCompatibilityContext {
  historicalPeriod?: string;
}
export interface RelationshipCompatibility {
  from: CompatibilityProfile;
  to: CompatibilityProfile;
  friendship: number;
  romance: number;
  friction: number;
  tendency: CompatibilityTendency;
  romanceConditional: boolean;
  reasons: string[];
}

function closeFamily(a: CompatibilityCharacter, b: CompatibilityCharacter): boolean {
  const parentsA = [a.family?.fatherId, a.family?.motherId].filter((id): id is number => id !== undefined && id > 0);
  const parentsB = [b.family?.fatherId, b.family?.motherId].filter((id): id is number => id !== undefined && id > 0);
  const childrenA = a.family?.childIds ?? [];
  const childrenB = b.family?.childIds ?? [];
  return (
    parentsA.includes(b.i) ||
    parentsB.includes(a.i) ||
    parentsA.some(id => parentsB.includes(id)) ||
    childrenA.includes(b.i) ||
    childrenB.includes(a.i) ||
    childrenB.some(cid => parentsA.includes(cid)) ||
    childrenA.some(cid => parentsB.includes(cid))
  );
}

type SocialTier = "elite" | "middle" | "lower";

function getSocialTier(char: CompatibilityCharacter): SocialTier {
  const origin = char.origin ?? char.backstory?.origin;
  const stratum = origin?.socialStratum;
  const estate = origin?.estateStatus;
  if (
    stratum === "royal" ||
    stratum === "high_noble" ||
    estate === "reigning_dynasty" ||
    estate === "court_noble" ||
    estate === "landed_noble"
  ) {
    return "elite";
  }
  if (stratum === "slave_born" || stratum === "commoner" || estate === "serf" || estate === "slave") {
    return "lower";
  }
  return "middle";
}

/** Pure assessment if the pair meet; callers can project it into solidarity without creating edges here. */
export function getRelationshipCompatibility(
  a: CompatibilityCharacter,
  b: CompatibilityCharacter,
  contextA: RelationshipCompatibilityContext = {},
  contextB: RelationshipCompatibilityContext = {}
): RelationshipCompatibility {
  const defaultDiversityConfig: RomanceDiversityConfig = {
    upbringing: hasCharactersContext() ? (getWorldContext().options?.romanceDiversityUpbringing ?? true) : false,
    commitment: hasCharactersContext() ? (getWorldContext().options?.romanceDiversityCommitment ?? true) : false,
    skills: hasCharactersContext() ? (getWorldContext().options?.romanceDiversitySkills ?? true) : false,
    uniqueOffset: hasCharactersContext() ? (getWorldContext().options?.romanceDiversityUniqueOffset ?? true) : false
  };

  const from = getCompatibilityProfile(a, {
    appearance: a.appearance,
    diversityConfig: contextA.diversityConfig ?? defaultDiversityConfig,
    ...contextA
  });
  const to = getCompatibilityProfile(b, {
    appearance: b.appearance,
    diversityConfig: contextB.diversityConfig ?? defaultDiversityConfig,
    ...contextB
  });
  let friendship = 45;
  let romance = 35;
  let friction = 20;
  const reasons: string[] = [];
  let pairRuleMatched = false;

  function apply<T>(rules: PairRule<T>[], x: T, y: T) {
    const rule = rules.find(r => (r.types[0] === x && r.types[1] === y) || (r.types[0] === y && r.types[1] === x));
    if (!rule) return;
    friendship += rule.friendship;
    romance += rule.romance;
    friction += rule.friction;
    reasons.push(rule.reason);
    pairRuleMatched = true;
  }
  apply(socialRules, from.social, to.social);
  apply(romanticRules, from.romantic, to.romantic);

  if (from.romantic === "withdrawn" || to.romantic === "withdrawn") {
    romance = Math.min(romance, 25);
    reasons.push("romanceDistance");
  }
  if (from.jealous || to.jealous) {
    const bothRestrained = (!from.jealous || from.compassionate) && (!to.jealous || to.compassionate);
    friction += bothRestrained ? 5 : 25;
    reasons.push(bothRestrained ? "restrainedJealousy" : "jealousyRisk");
  }
  if (from.compassionate && to.compassionate) friction -= 10;

  // Social stratum / Estate gap and Historical Period
  const tierA = getSocialTier(a);
  const tierB = getSocialTier(b);
  const recordedInterest = (a.favor?.[b.i] ?? 0) > 0 || (b.favor?.[a.i] ?? 0) > 0;
  const isClassDivide = (tierA === "elite" && tierB === "lower") || (tierA === "lower" && tierB === "elite");
  if (isClassDivide) {
    const period = contextA.historicalPeriod ?? contextB.historicalPeriod ?? "earlyMedieval";
    const isModern = ["preIndustrialEra", "steamEra", "industrialChemistryEra", "petroleumEra", "rocketryEra"].includes(
      period
    );
    const isEarlyModern = ["ageOfExploration", "maritimeEra"].includes(period);
    if (isModern) {
      friction += 10;
      reasons.push("classDivideModern");
    } else if (isEarlyModern) {
      friction += 25;
      if (!recordedInterest) romance = Math.min(romance, 35);
      reasons.push("classDivideEarlyModern");
    } else {
      friction += 35;
      if (!recordedInterest) romance = Math.min(romance, 25);
      reasons.push("classDivideMedieval");
    }
  }

  // Matches the current world's default route, not an inferred sexual orientation.
  // Existing directed favor permits same-gender romantic prospects without claiming reciprocity.
  const romanceConditional = a.gender === b.gender && !recordedInterest;
  if (romanceConditional) {
    romance = Math.min(romance, 45);
    reasons.push("sameGenderFriendship");
  } else if (a.gender === b.gender) {
    reasons.push("recordedInterest");
  } else {
    reasons.push("differentGenderPossibility");
  }
  if (a.race !== undefined && b.race !== undefined && a.race !== b.race && !recordedInterest) {
    romance = Math.min(romance, 25);
    reasons.push("differentRaceNorms");
  }

  // Age gap, norms, and perverse / peculiar interests
  const isSelf = a.i === b.i;
  const isCloseFamily = closeFamily(a, b);
  const isUnderage = (a.age !== undefined && a.age < 15) || (b.age !== undefined && b.age < 15);
  const isDeceased = !!a.dead || !!b.dead;
  const isSpouse = !!a.family?.spouseIds?.includes(b.i) || !!b.family?.spouseIds?.includes(a.i);

  if (a.age !== undefined && b.age !== undefined && !isUnderage && !isSelf && !isCloseFamily) {
    const ageDiff = Math.abs(a.age - b.age);
    const isLecherousElder = (age: number, p: CharacterPersonality) =>
      age >= 45 && p.honor <= 35 && p.piety <= 35 && (p.boldness >= 65 || p.greed >= 65 || p.guile >= 65);
    const isYoungAdult = (age: number) => age >= 15 && age <= 22;
    const isMatureAdmirer = (age: number, p: CharacterPersonality) =>
      age >= 18 && age <= 30 && (p.honor <= 35 || p.zeal >= 65);
    const isMatureTarget = (age: number) => age >= 45;
    const isNormAbiding = (p: CharacterPersonality) => p.honor >= 65 || p.piety >= 65 || p.rationality >= 65;

    const lecheryMatch =
      (isLecherousElder(a.age, a.personality) && isYoungAdult(b.age)) ||
      (isLecherousElder(b.age, b.personality) && isYoungAdult(a.age));

    const matureAffectionMatch =
      (isMatureAdmirer(a.age, a.personality) && isMatureTarget(b.age) && ageDiff >= 20) ||
      (isMatureAdmirer(b.age, b.personality) && isMatureTarget(a.age) && ageDiff >= 20);

    if (lecheryMatch) {
      romance += 25;
      friction += 35;
      reasons.push("lecherousPursuit");
    } else if (matureAffectionMatch) {
      romance += 20;
      friction += 15;
      reasons.push("matureAffection");
    } else if (isNormAbiding(a.personality) || isNormAbiding(b.personality)) {
      if (ageDiff <= 10) {
        friction -= 10;
        reasons.push("orderlyGenerations");
      } else if (ageDiff >= 20) {
        romance -= 25;
        friction += 20;
        reasons.push("generationGapConcern");
      }
    }
  }

  // Special restrictions for self, close family, underage and deceased
  if (isSelf || isCloseFamily) {
    romance = 0;
    reasons.push("romanceExcluded");
  } else if (isUnderage) {
    romance = 0;
    reasons.push("underageProtection");
  } else if (isDeceased) {
    if (isSpouse || recordedInterest) {
      reasons.push("bereavedLove");
    } else {
      reasons.push("deceased");
    }
  }

  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  friendship = clamp(friendship);
  romance = clamp(romance);
  friction = clamp(friction);
  const tendency: CompatibilityTendency =
    friction >= 60
      ? romance >= 60
        ? "volatile"
        : "friction"
      : friendship >= 65 && romance >= 60
        ? "both"
        : romance >= 60
          ? "romance"
          : friendship >= 60
            ? "friendship"
            : "situational";
  if (!pairRuleMatched) {
    reasons.unshift("situationalFit");
  }
  return { from, to, friendship, romance, friction, tendency, romanceConditional, reasons };
}

/** Small bounded contribution: compatible friendship helps solidarity; friction hurts it.
 * Romance alone contributes nothing, so gender/favor never makes political trust automatic.
 */
export function getCompatibilitySolidarityModifier(
  a: CompatibilityCharacter,
  b: CompatibilityCharacter,
  contextA: RelationshipCompatibilityContext = {},
  contextB: RelationshipCompatibilityContext = {}
): number {
  const { friendship, friction } = getRelationshipCompatibility(a, b, contextA, contextB);
  return Math.max(-20, Math.min(20, Math.round((friendship - 45 - (friction - 20)) / 4)));
}
