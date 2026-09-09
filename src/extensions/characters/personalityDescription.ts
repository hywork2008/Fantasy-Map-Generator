import type { CharacterPersonality } from "./characterTypes";

export type PersonalityBand = "veryLow" | "low" | "moderate" | "high" | "veryHigh";

/** Keep the original low/high boundaries; reserve the outer 15 points for extremes. */
export function getPersonalityBand(score: number | undefined): PersonalityBand {
  if (score === undefined || !Number.isFinite(score)) return "moderate";
  if (score <= 15) return "veryLow";
  if (score <= 35) return "low";
  if (score < 65) return "moderate";
  if (score < 85) return "high";
  return "veryHigh";
}

type Trait = keyof CharacterPersonality;
interface PersonalityProfile {
  low: (trait: Trait) => boolean;
  high: (trait: Trait) => boolean;
  veryLow: (trait: Trait) => boolean;
  veryHigh: (trait: Trait) => boolean;
}
export function createPersonalityProfile(personality: CharacterPersonality): PersonalityProfile {
  const band = (key: Trait) => getPersonalityBand(personality[key]);
  const low = (key: Trait) => band(key) === "low" || band(key) === "veryLow";
  const high = (key: Trait) => band(key) === "high" || band(key) === "veryHigh";
  return {
    low,
    high,
    veryLow: key => band(key) === "veryLow",
    veryHigh: key => band(key) === "veryHigh"
  };
}

interface DescriptionRule {
  key: string;
  when: (profile: PersonalityProfile) => boolean;
}
export type DescriptionAspect = "action" | "social" | "morality" | "conflict" | "conviction";

/** Ordered within each aspect: specific combinations precede single-trait extremes.
 * Additional contexts (such as skills) can extend rule predicates without changing the UI.
 * These describe preferences, never competence or guaranteed outcomes.
 */
const extremeRules: Record<DescriptionAspect, DescriptionRule[]> = {
  action: [
    {
      key: "explosiveImpulse",
      when: p =>
        p.low("energy") &&
        p.high("boldness") &&
        p.low("rationality") &&
        (p.veryLow("energy") || p.veryHigh("boldness") || p.veryLow("rationality"))
    },
    { key: "headlongRush", when: p => p.high("boldness") && p.high("energy") && p.low("rationality") },
    { key: "rareDaring", when: p => p.veryLow("energy") && p.high("boldness") },
    { key: "relentlessPreparation", when: p => p.veryHigh("energy") && p.low("boldness") },
    { key: "deliberateMethod", when: p => p.low("boldness") && p.high("rationality") },
    { key: "audaciousCalculation", when: p => p.veryHigh("boldness") && p.high("rationality") },
    { key: "rigorousReasoning", when: p => p.veryHigh("rationality") },
    { key: "emotionLed", when: p => p.veryLow("rationality") },
    { key: "riskSeeking", when: p => p.veryHigh("boldness") },
    { key: "riskAvoidant", when: p => p.veryLow("boldness") },
    { key: "restless", when: p => p.veryHigh("energy") },
    { key: "minimalEffort", when: p => p.veryLow("energy") }
  ],
  social: [
    { key: "ruthlessDominance", when: p => p.low("compassion") && p.high("boldness") },
    { key: "coldCalculation", when: p => p.low("compassion") && p.high("guile") },
    { key: "discreetCompassion", when: p => p.veryHigh("compassion") && p.high("guile") },
    { key: "shelteredCompassion", when: p => p.veryLow("sociability") && p.high("compassion") },
    { key: "socialMask", when: p => p.veryHigh("guile") && p.high("sociability") },
    { key: "guardedIntentions", when: p => p.veryHigh("guile") },
    { key: "unfiltered", when: p => p.veryLow("guile") },
    { key: "selfSacrificing", when: p => p.veryHigh("compassion") },
    { key: "unmoved", when: p => p.veryLow("compassion") },
    { key: "seeksCompany", when: p => p.veryHigh("sociability") },
    { key: "solitary", when: p => p.veryLow("sociability") }
  ],
  morality: [
    {
      key: "predatoryGreed",
      when: p => p.high("greed") && p.low("honor") && p.low("compassion")
    },
    {
      key: "unyieldingFairShare",
      when: p => p.high("greed") && p.high("honor") && (p.veryHigh("greed") || p.veryHigh("honor"))
    },
    {
      key: "profitBeforePromises",
      when: p => p.high("greed") && p.low("honor") && (p.veryHigh("greed") || p.veryLow("honor"))
    },
    {
      key: "nobleChivalry",
      when: p => p.high("honor") && p.low("greed") && (p.veryHigh("honor") || p.veryLow("greed"))
    },
    { key: "insatiable", when: p => p.veryHigh("greed") },
    { key: "uncompromisingHonor", when: p => p.veryHigh("honor") },
    { key: "indifferentToGain", when: p => p.veryLow("greed") },
    { key: "discardedPromises", when: p => p.veryLow("honor") }
  ],
  conflict: [
    {
      key: "ruthlessVengeance",
      when: p => p.high("vengefulness") && p.high("boldness") && p.low("compassion")
    },
    { key: "patientRetribution", when: p => p.veryHigh("vengefulness") && p.high("guile") },
    {
      key: "openHostility",
      when: p => p.high("vengefulness") && p.low("guile") && (p.veryHigh("vengefulness") || p.veryLow("guile"))
    },
    { key: "consumingGrudge", when: p => p.veryHigh("vengefulness") },
    { key: "noRetaliation", when: p => p.veryLow("vengefulness") }
  ],
  conviction: [
    {
      key: "tyrannicalWill",
      when: p => p.high("confidence") && p.low("compassion") && (p.veryHigh("confidence") || p.veryLow("compassion"))
    },
    {
      key: "unyieldingDevotion",
      when: p => p.high("piety") && p.high("zeal") && (p.veryHigh("piety") || p.veryHigh("zeal"))
    },
    {
      key: "doggedDoubt",
      when: p => p.high("zeal") && p.low("confidence") && (p.veryHigh("zeal") || p.veryLow("confidence"))
    },
    { key: "allConsumingCommitment", when: p => p.veryHigh("zeal") },
    { key: "quickDisengagement", when: p => p.veryLow("zeal") },
    { key: "unyieldingConfidence", when: p => p.veryHigh("confidence") },
    { key: "persistentDoubt", when: p => p.veryLow("confidence") },
    { key: "faithFirst", when: p => p.veryHigh("piety") },
    { key: "secularJudgment", when: p => p.veryLow("piety") }
  ]
};

/** Display-only interpretation: no randomness, stored text, or changes to simulation behavior.
 * Moderate scores stay situational; missing legacy values are treated as neutral.
 */
export function getPersonalityDescriptionKeys(personality: CharacterPersonality): string[] {
  const profile = createPersonalityProfile(personality);
  const { low, high } = profile;

  const action =
    low("energy") && high("boldness")
      ? low("rationality")
        ? "suddenImpulse"
        : "reservedDaring"
      : high("boldness")
        ? low("rationality")
          ? "impulsive"
          : high("rationality")
            ? "calculatedRisk"
            : "daring"
        : low("boldness")
          ? high("energy")
            ? "busyCautious"
            : "cautious"
          : high("energy")
            ? "active"
            : low("energy")
              ? "unhurried"
              : "measured";

  const social = high("compassion")
    ? low("sociability")
      ? "quietCare"
      : "helpful"
    : low("compassion")
      ? "detached"
      : high("guile")
        ? high("sociability")
          ? "socialIndirect"
          : "privateIndirect"
        : high("sociability")
          ? "sociable"
          : low("sociability")
            ? "private"
            : "socialMeasured";

  const morality = high("greed")
    ? high("honor")
      ? "principledAmbition"
      : low("honor")
        ? "opportunist"
        : "bargainer"
    : high("honor")
      ? "honorable"
      : low("greed")
        ? "undemanding"
        : low("honor")
          ? "flexible"
          : "negotiator";

  const conflict = high("vengefulness")
    ? high("guile")
      ? "hiddenGrudge"
      : "grudge"
    : low("vengefulness")
      ? "forgiving"
      : "defensive";

  const conviction = high("zeal")
    ? high("piety")
      ? "devoutCommitment"
      : low("confidence")
        ? "uncertainCommitment"
        : "committed"
    : low("confidence")
      ? "seeksReassurance"
      : high("confidence")
        ? "selfAssured"
        : high("piety")
          ? "devout"
          : low("piety") && high("rationality")
            ? "rationalSkeptic"
            : low("zeal")
              ? "pragmaticEffort"
              : "selectiveCommitment";

  const fallback: Record<DescriptionAspect, string> = { action, social, morality, conflict, conviction };
  return (Object.keys(fallback) as DescriptionAspect[]).map(aspect => {
    const key = extremeRules[aspect].find(rule => rule.when(profile))?.key ?? fallback[aspect];
    return `characters.personalityDescription.${key}`;
  });
}
