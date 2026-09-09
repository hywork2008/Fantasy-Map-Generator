import type { Character, CharacterPersonality } from "./characterTypes";
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

/** Stable semantic flavor IDs, never translated prose, supply the classification evidence. */
export function getCompatibilityProfile(
  personality: CharacterPersonality,
  context: RomanceDescriptionContext = {}
): CompatibilityProfile {
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
    : has("uncompromisingHonor", "honorable", "principledAmbition", "unyieldingFairShare")
      ? "principled"
      : has("rigorousReasoning", "calculatedRisk", "audaciousCalculation", "reasonedAffection")
        ? "analytical"
        : has("socialMask", "guardedIntentions", "socialIndirect", "privateIndirect", "guardedAffection")
          ? "guarded"
          : has("insatiable", "opportunist", "bargainer", "profitBeforePromises")
            ? "ambitious"
            : has(
                  "impulsive",
                  "suddenImpulse",
                  "explosiveImpulse",
                  "daring",
                  "riskSeeking",
                  "romanticRush",
                  "ardentPursuit"
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
  const romantic: RomanticCompatibilityType = has("retreatFromRomance", "passiveRomance")
    ? "withdrawn"
    : has("hiddenLovers", "insatiableAffection", "multipleLovers")
      ? "plural"
      : has("faithfulMonogamy", "honorablePlurality", "honorableSeasons", "localPromises")
        ? "devoted"
        : has("romanticRush", "ardentPursuit", "absorbingAffection", "quietLonging")
          ? "passionate"
          : has("selfDefinedBonds", "independentAffection", "reasonedAffection")
            ? "independent"
            : "measured";
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
  { types: ["analytical", "analytical"], friendship: 30, romance: 0, friction: -10, reason: "sharedReasoning" },
  { types: ["analytical", "principled"], friendship: 25, romance: 0, friction: -5, reason: "reliablePartners" },
  { types: ["reserved", "reserved"], friendship: 25, romance: -10, friction: -10, reason: "sharedQuiet" },
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
  {
    types: ["independent", "independent"],
    friendship: 20,
    romance: -10,
    friction: -10,
    reason: "comfortableIndependence"
  },
  { types: ["withdrawn", "withdrawn"], friendship: 15, romance: -35, friction: -10, reason: "neitherInitiates" },
  { types: ["withdrawn", "passionate"], friendship: -10, romance: -25, friction: 25, reason: "pursuitAndRetreat" },
  { types: ["independent", "passionate"], friendship: -5, romance: 5, friction: 20, reason: "closenessAndFreedom" },
  { types: ["devoted", "plural"], friendship: -15, romance: -25, friction: 40, reason: "conflictingCommitments" },
  { types: ["plural", "plural"], friendship: 5, romance: 15, friction: 15, reason: "sharedAppetite" }
];

export type CompatibilityCharacter = Pick<Character, "i" | "gender" | "personality" | "appearance"> &
  Partial<Pick<Character, "family" | "favor" | "dead" | "race">>;
export type CompatibilityTendency = "friendship" | "romance" | "both" | "friction" | "volatile" | "situational";
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
  return (
    parentsA.includes(b.i) ||
    parentsB.includes(a.i) ||
    parentsA.some(id => parentsB.includes(id)) ||
    !!a.family?.childIds?.includes(b.i) ||
    !!b.family?.childIds?.includes(a.i)
  );
}

/** Pure assessment if the pair meet; callers can project it into solidarity without creating edges here. */
export function getRelationshipCompatibility(
  a: CompatibilityCharacter,
  b: CompatibilityCharacter,
  contextA: RomanceDescriptionContext = {},
  contextB: RomanceDescriptionContext = {}
): RelationshipCompatibility {
  const from = getCompatibilityProfile(a.personality, { appearance: a.appearance, ...contextA });
  const to = getCompatibilityProfile(b.personality, { appearance: b.appearance, ...contextB });
  let friendship = 45;
  let romance = 35;
  let friction = 20;
  const reasons: string[] = [];
  function apply<T>(rules: PairRule<T>[], x: T, y: T) {
    const rule = rules.find(r => (r.types[0] === x && r.types[1] === y) || (r.types[0] === y && r.types[1] === x));
    if (!rule) return;
    friendship += rule.friendship;
    romance += rule.romance;
    friction += rule.friction;
    reasons.push(rule.reason);
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

  // Matches the current world's default route, not an inferred sexual orientation.
  // Existing directed favor permits same-gender romantic prospects without claiming reciprocity.
  const recordedInterest = (a.favor?.[b.i] ?? 0) > 0 || (b.favor?.[a.i] ?? 0) > 0;
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
  if (a.i === b.i || a.dead || b.dead || closeFamily(a, b)) {
    romance = 0;
    reasons.push("romanceExcluded");
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
  if (reasons.length === 1) reasons.unshift("situationalFit");
  return { from, to, friendship, romance, friction, tendency, romanceConditional, reasons };
}

/** Small bounded contribution: compatible friendship helps solidarity; friction hurts it.
 * Romance alone contributes nothing, so gender/favor never makes political trust automatic.
 */
export function getCompatibilitySolidarityModifier(
  a: CompatibilityCharacter,
  b: CompatibilityCharacter,
  contextA: RomanceDescriptionContext = {},
  contextB: RomanceDescriptionContext = {}
): number {
  const { friendship, friction } = getRelationshipCompatibility(a, b, contextA, contextB);
  return Math.max(-20, Math.min(20, Math.round((friendship - 45 - (friction - 20)) / 4)));
}
