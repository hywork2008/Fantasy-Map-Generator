/**
 * Practical, person-scoped skills. They remain Economy-owned while only guild
 * masters and apprentices are simulated, so the generic Character model does
 * not become a record for every inhabitant (docs/plan/individual-skill-mastery-system.md §8).
 */
export const INDIVIDUAL_SKILL_DOMAINS = [
  "blacksmithing",
  "smelting",
  "weaving",
  "tailoring",
  "swordsmanship",
  "archery",
  "horsemanship"
] as const;

export type IndividualSkillDomain = (typeof INDIVIDUAL_SKILL_DOMAINS)[number];

export const APTITUDE_TIERS = ["poor", "ordinary", "promising", "gifted", "exceptional"] as const;
export type AptitudeTier = (typeof APTITUDE_TIERS)[number];

/** Metallurgy techniques available to the initial blacksmithing vertical slice. */
export const BLACKSMITHING_TECHNIQUES = ["heatTreatment", "patternWelding"] as const;
export type BlacksmithingTechnique = (typeof BLACKSMITHING_TECHNIQUES)[number];

/**
 * A partial record left to an underqualified successor when a master's
 * personal technique cannot be performed reliably yet.
 */
export interface BlacksmithingTechniqueLead {
  technique: BlacksmithingTechnique;
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
