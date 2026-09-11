import { describe, expect, it } from "vitest";
import enJson from "../../../i18n/locales/en.json";
import jaJson from "../../../i18n/locales/ja.json";
import { SPECIALIZATION_DEFINITIONS } from "../../characters/specializationCatalog";
import {
  CRAFT_DOMAIN_TO_CATEGORY,
  CRAFT_SKILL_CATEGORIES,
  CRAFT_SKILL_DOMAINS,
  INDIVIDUAL_SKILL_DOMAINS
} from "./individualSkillTypes";

describe("craftSkillsExpansion", () => {
  it("defines exactly 25 individual skill domains and 22 craft skill domains", () => {
    expect(INDIVIDUAL_SKILL_DOMAINS).toHaveLength(25);
    expect(CRAFT_SKILL_DOMAINS).toHaveLength(22);

    // Martial disciplines are in individual skills but excluded from craft skill domains
    const martialDisciplines = ["swordsmanship", "archery", "horsemanship"];
    for (const discipline of martialDisciplines) {
      expect(INDIVIDUAL_SKILL_DOMAINS).toContain(discipline);
      expect(CRAFT_SKILL_DOMAINS).not.toContain(discipline);
    }

    // All craft skills are part of individual skills
    for (const domain of CRAFT_SKILL_DOMAINS) {
      expect(INDIVIDUAL_SKILL_DOMAINS).toContain(domain);
    }
  });

  it("maps every craft skill domain to a valid category", () => {
    const validCategories = CRAFT_SKILL_CATEGORIES.filter(c => c !== "all");

    for (const domain of CRAFT_SKILL_DOMAINS) {
      const category = CRAFT_DOMAIN_TO_CATEGORY[domain];
      expect(category).toBeDefined();
      expect(validCategories).toContain(category);
    }
  });

  it("has complete translations in both ja.json and en.json for all craft domains", () => {
    const jaDomains = jaJson.characters.craftSkillDomainNames as Record<string, string>;
    const enDomains = enJson.characters.craftSkillDomainNames as Record<string, string>;

    for (const domain of CRAFT_SKILL_DOMAINS) {
      expect(jaDomains[domain], `Missing ja translation for domain: ${domain}`).toBeTruthy();
      expect(enDomains[domain], `Missing en translation for domain: ${domain}`).toBeTruthy();
    }
  });

  it("has complete translations for categories and tiers", () => {
    const jaCategories = jaJson.characters.craftSkillCategoryNames as Record<string, string>;
    const enCategories = enJson.characters.craftSkillCategoryNames as Record<string, string>;

    for (const category of CRAFT_SKILL_CATEGORIES) {
      expect(jaCategories[category], `Missing ja translation for category: ${category}`).toBeTruthy();
      expect(enCategories[category], `Missing en translation for category: ${category}`).toBeTruthy();
    }

    const tiers = ["apprentice", "journeyman", "craftsman", "master", "grandmaster"];
    const jaTiers = jaJson.characters.craftSkillTierNames as Record<string, string>;
    const enTiers = enJson.characters.craftSkillTierNames as Record<string, string>;

    for (const tier of tiers) {
      expect(jaTiers[tier], `Missing ja translation for tier: ${tier}`).toBeTruthy();
      expect(enTiers[tier], `Missing en translation for tier: ${tier}`).toBeTruthy();
    }
  });

  it("registers specialization definitions linking each craft skill domain to economyDomain", () => {
    const economyDomains = new Set(
      SPECIALIZATION_DEFINITIONS.map(spec => spec.economyDomain).filter((domain): domain is string => !!domain)
    );

    for (const domain of CRAFT_SKILL_DOMAINS) {
      expect(economyDomains.has(domain), `Missing economyDomain specialization for ${domain}`).toBe(true);
    }
  });

  it("contains valid technique translations in ja.json and en.json for core techniques", () => {
    const jaTechs = jaJson.characters.craftTechniqueNames as Record<string, string>;
    const enTechs = enJson.characters.craftTechniqueNames as Record<string, string>;

    const sampleTechniques = [
      "heatTreatment",
      "patternWelding",
      "sandCasting",
      "batteredWalls",
      "bastionTrace",
      "ashlarJointing",
      "carvelPlanking",
      "cornedPowder",
      "tinctureMaceration"
    ];

    for (const tech of sampleTechniques) {
      expect(jaTechs[tech], `Missing ja translation for technique: ${tech}`).toBeTruthy();
      expect(enTechs[tech], `Missing en translation for technique: ${tech}`).toBeTruthy();
    }
  });
});
