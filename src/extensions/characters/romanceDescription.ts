import type { CultureRomanceNorms } from "../../types/models";
import type { CharacterPersonality } from "./characterTypes";
import { createPersonalityProfile, getPersonalityBand } from "./personalityDescription";

export interface RomanceDescriptionContext {
  /** Own-race appearance; never assume universal attraction or a particular partner. */
  appearance?: number;
  norms?: CultureRomanceNorms;
}

type Profile = ReturnType<typeof createPersonalityProfile>;
interface RomanceProfile extends Profile {
  context: RomanceDescriptionContext;
  respectsNorms: boolean;
  attractive: boolean;
}
interface RomanceRule {
  key: string;
  when: (p: RomanceProfile) => boolean;
}

// Specific combinations first, one sentence per aspect. Desire is not a record of actual affairs,
// piety follows local norms, and compassion moderates conflict without erasing hurt or jealousy.
const rules: RomanceRule[][] = [
  [
    {
      key: "retreatFromRomance",
      when: p =>
        p.low("boldness") &&
        p.low("zeal") &&
        p.low("energy") &&
        (p.veryLow("boldness") || p.veryLow("zeal") || p.veryLow("energy"))
    },
    { key: "passiveRomance", when: p => p.low("boldness") && p.low("zeal") && p.low("energy") },
    { key: "hesitantBeauty", when: p => p.attractive && p.low("confidence") },
    {
      key: "beautyAssured",
      when: p =>
        p.attractive &&
        p.high("confidence") &&
        Number.isFinite(p.context.norms?.appearanceImportance) &&
        (p.context.norms?.appearanceImportance ?? 50) >= 65
    },
    {
      key: "beautyConditional",
      when: p => p.attractive && p.high("confidence") && !Number.isFinite(p.context.norms?.appearanceImportance)
    },
    { key: "romanticRush", when: p => p.high("boldness") && p.high("energy") && p.low("rationality") },
    { key: "ardentPursuit", when: p => p.high("boldness") && p.high("zeal") && p.high("energy") },
    { key: "quietLonging", when: p => p.low("boldness") && p.high("zeal") },
    { key: "confidentApproach", when: p => p.high("confidence") },
    { key: "cautiousApproach", when: p => p.low("boldness") || p.low("confidence") },
    { key: "naturalApproach", when: () => true }
  ],
  [
    { key: "faithfulMonogamy", when: p => p.respectsNorms && p.context.norms?.marriage === "monogamous" },
    { key: "honorablePlurality", when: p => p.respectsNorms && p.context.norms?.marriage === "plural" },
    { key: "honorableSeasons", when: p => p.respectsNorms && p.context.norms?.marriage === "episodic" },
    { key: "localPromises", when: p => p.respectsNorms },
    { key: "hiddenLovers", when: p => p.low("honor") && p.low("piety") && p.high("greed") && p.high("guile") },
    { key: "insatiableAffection", when: p => p.low("honor") && p.low("piety") && p.veryHigh("greed") },
    { key: "multipleLovers", when: p => p.low("honor") && p.low("piety") && p.high("greed") },
    { key: "selfDefinedBonds", when: p => p.low("honor") && p.low("piety") },
    { key: "negotiatedBonds", when: () => true }
  ],
  [
    { key: "selflessAffection", when: p => p.veryHigh("compassion") },
    { key: "quietAffection", when: p => p.high("compassion") && p.low("sociability") },
    { key: "caringAffection", when: p => p.high("compassion") },
    { key: "absorbingAffection", when: p => p.veryHigh("zeal") && p.high("energy") },
    { key: "guardedAffection", when: p => p.high("guile") },
    { key: "reasonedAffection", when: p => p.high("rationality") },
    { key: "constantCompany", when: p => p.high("sociability") && p.high("energy") },
    { key: "independentAffection", when: p => p.low("sociability") || p.low("energy") },
    { key: "balancedAffection", when: () => true }
  ],
  [
    { key: "restrainedJealousy", when: p => p.high("compassion") && p.high("vengefulness") && p.high("zeal") },
    { key: "gentleConflict", when: p => p.high("compassion") },
    {
      key: "consumingJealousy",
      when: p =>
        p.high("vengefulness") &&
        p.high("zeal") &&
        p.low("compassion") &&
        (p.veryHigh("vengefulness") || p.veryHigh("zeal"))
    },
    { key: "schemingJealousy", when: p => p.high("vengefulness") && p.high("zeal") && p.high("guile") },
    { key: "fierceJealousy", when: p => p.high("vengefulness") && p.high("zeal") },
    { key: "lingeringHurt", when: p => p.high("vengefulness") },
    { key: "lettingGo", when: p => p.veryLow("vengefulness") },
    { key: "noScorekeeping", when: p => p.low("vengefulness") },
    { key: "talkThroughConflict", when: p => p.high("rationality") },
    { key: "ordinaryConflict", when: () => true }
  ]
];

export function getRomanceDescriptionKeys(
  personality: CharacterPersonality,
  context: RomanceDescriptionContext = {}
): string[] {
  const profile = createPersonalityProfile(personality);
  const appearanceBand = getPersonalityBand(context.appearance);
  const p: RomanceProfile = {
    ...profile,
    context,
    respectsNorms: profile.high("honor") || profile.high("piety"),
    attractive: appearanceBand === "high" || appearanceBand === "veryHigh"
  };
  return rules.map(group => `characters.romanceDescription.${group.find(rule => rule.when(p))!.key}`);
}
