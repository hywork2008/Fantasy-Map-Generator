/**
 * Practical, person-scoped skills. They remain Economy-owned while only guild
 * masters and apprentices are simulated, so the generic Character model does
 * not become a record for every inhabitant (docs/plan/individual-skill-mastery-system.md §8).
 */
export const INDIVIDUAL_SKILL_DOMAINS = [
  // 金属・冶金
  "blacksmithing",
  "smelting",
  "foundry",
  "goldsmithing",
  // 石工・建築・土木・鉱山
  "fortification",
  "masonry",
  "hydraulics",
  "mining",
  // 木工・造船・射出具
  "carpentry",
  "shipwrighting",
  "fletching",
  // 繊維・皮革
  "weaving",
  "tailoring",
  "leatherworking",
  // 窯業・硝子・精密
  "ceramics",
  "glassmaking",
  "instrumentMaking",
  // 火工・学術・他
  "printing",
  "pyrotechnics",
  "apothecary",
  "brewing",
  "animalBreeding",
  // 武勇実技（武術・戦闘）
  "swordsmanship",
  "archery",
  "horsemanship"
] as const;

export type IndividualSkillDomain = (typeof INDIVIDUAL_SKILL_DOMAINS)[number];

/** Practical craft disciplines displayed in the Character Details -> Craft Skills tab (excluding martial disciplines). */
export const CRAFT_SKILL_DOMAINS = [
  "blacksmithing",
  "smelting",
  "foundry",
  "goldsmithing",
  "fortification",
  "masonry",
  "hydraulics",
  "mining",
  "carpentry",
  "shipwrighting",
  "fletching",
  "weaving",
  "tailoring",
  "leatherworking",
  "ceramics",
  "glassmaking",
  "instrumentMaking",
  "printing",
  "pyrotechnics",
  "apothecary",
  "brewing",
  "animalBreeding"
] as const;

export type CraftSkillDomain = (typeof CRAFT_SKILL_DOMAINS)[number];

export const CRAFT_SKILL_CATEGORIES = [
  "all",
  "metallurgy",
  "masonry",
  "woodworking",
  "textiles",
  "ceramicsPrecision",
  "scholarlyChemical"
] as const;
export type CraftSkillCategory = (typeof CRAFT_SKILL_CATEGORIES)[number];

export const CRAFT_DOMAIN_TO_CATEGORY: Readonly<Record<CraftSkillDomain, Exclude<CraftSkillCategory, "all">>> = {
  blacksmithing: "metallurgy",
  smelting: "metallurgy",
  foundry: "metallurgy",
  goldsmithing: "metallurgy",
  fortification: "masonry",
  masonry: "masonry",
  hydraulics: "masonry",
  mining: "masonry",
  carpentry: "woodworking",
  shipwrighting: "woodworking",
  fletching: "woodworking",
  weaving: "textiles",
  tailoring: "textiles",
  leatherworking: "textiles",
  ceramics: "ceramicsPrecision",
  glassmaking: "ceramicsPrecision",
  instrumentMaking: "ceramicsPrecision",
  printing: "scholarlyChemical",
  pyrotechnics: "scholarlyChemical",
  apothecary: "scholarlyChemical",
  brewing: "scholarlyChemical",
  animalBreeding: "scholarlyChemical"
};

export const APTITUDE_TIERS = ["poor", "ordinary", "promising", "gifted", "exceptional"] as const;
export type AptitudeTier = (typeof APTITUDE_TIERS)[number];

/** Metallurgy techniques available to the initial blacksmithing vertical slice. */
export const BLACKSMITHING_TECHNIQUES = ["heatTreatment", "patternWelding"] as const;
export type BlacksmithingTechnique = (typeof BLACKSMITHING_TECHNIQUES)[number];

/** Generic craft technique identifier. */
export type CraftTechnique = BlacksmithingTechnique | string;

/**
 * A partial record left to an underqualified successor when a master's
 * personal technique cannot be performed reliably yet.
 */
export interface BlacksmithingTechniqueLead {
  technique: BlacksmithingTechnique;
  /** Progress towards a reproducible technique, normalized to 0..1. */
  progress: number;
}

export interface CraftTechniqueLead {
  technique: CraftTechnique;
  /** Progress towards a reproducible technique, normalized to 0..1. */
  progress: number;
}

export interface CharacterDomainSkill {
  characterId: number;
  domain: IndividualSkillDomain;
  /** Practical capability, capped at the human completion range of 0..100. */
  proficiency: number;
  /** Changes growth and technique acquisition, never output directly. */
  aptitude: AptitudeTier;
  /** Most recent simulation year in which the character had meaningful practice. */
  lastPracticedYear?: number;
  /** Personally known techniques. They do not automatically become city knowledge. */
  techniques: BlacksmithingTechnique[];
  /**
   * Incomplete notes and demonstrations inherited after a master's death.
   * Optional to keep saves produced before this field compatible.
   */
  reconstructionLeads?: BlacksmithingTechniqueLead[];
}
