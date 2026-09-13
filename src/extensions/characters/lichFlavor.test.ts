import i18next from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import enTranslations from "../../i18n/locales/en.json";
import jaTranslations from "../../i18n/locales/ja.json";
import type { Race } from "../../types/models";
import type { Character } from "./characterTypes";
import { formatFlavorHook, generateCharacterHooks } from "./flavorHooks";
import { getMatchingLichTypes, isLichCharacter, LICH_TYPE_DEFINITIONS, selectLichFlavorHook } from "./lichFlavor";

describe("Lich flavor hooks", () => {
  const races: Race[] = [
    { i: 0, key: "unknown", name: "Unknown" },
    { i: 1, key: "human", name: "Human" },
    { i: 16, key: "lich", name: "Lich" }
  ];

  beforeAll(async () => {
    await i18next.init({
      lng: "ja",
      fallbackLng: "en",
      resources: {
        ja: { translation: jaTranslations },
        en: { translation: enTranslations }
      }
    });
  });

  function createMockLich(overrides: Partial<Character> = {}): Character {
    return {
      i: 1,
      name: "Morbane the Undying",
      age: 1500,
      gender: "male",
      race: 16,
      appearance: 45,
      prestige: 90,
      wealth: 100,
      titles: [],
      skills: {
        diplomacy: 50,
        martial: 60,
        stewardship: 70,
        intrigue: 80,
        learning: 95,
        prowess: 40
      },
      personality: {
        boldness: 50,
        compassion: 10,
        greed: 30,
        honor: 20,
        rationality: 60,
        sociability: 20,
        vengefulness: 70,
        zeal: 40,
        energy: 30,
        piety: 10,
        guile: 75,
        confidence: 40
      },
      family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
      pastTitles: [],
      health: { physicalTrauma: 0, mentalStrain: 0, infection: 0 },
      arcane: 95,
      ...overrides
    };
  }

  it("identifies Lich characters correctly", () => {
    const lich = createMockLich();
    expect(isLichCharacter(lich, races)).toBe(true);

    const human = createMockLich({ race: 1 });
    expect(isLichCharacter(human, races)).toBe(false);
  });

  it("returns null for non-Lich characters", () => {
    const human = createMockLich({ race: 1 });
    expect(selectLichFlavorHook(human, races)).toBeNull();
  });

  describe("Matching conditions for Lich types", () => {
    it("matches ancient_tomb_desecrated when age >= 500", () => {
      const ancient = createMockLich({ age: 800 });
      const types = getMatchingLichTypes(ancient);
      expect(types).toContain("ancient_tomb_desecrated");

      const young = createMockLich({ age: 120 });
      const youngTypes = getMatchingLichTypes(young);
      expect(youngTypes).not.toContain("ancient_tomb_desecrated");
    });

    it("matches young_overlord when confidence >= 50", () => {
      const confident = createMockLich({
        personality: { ...createMockLich().personality, confidence: 85 }
      });
      const types = getMatchingLichTypes(confident);
      expect(types).toContain("young_overlord");
    });

    it("matches young_avenger when confidence < 50 or vengefulness >= 50", () => {
      const avenger = createMockLich({
        personality: { ...createMockLich().personality, confidence: 25, vengefulness: 80 }
      });
      const types = getMatchingLichTypes(avenger);
      expect(types).toContain("young_avenger");
    });

    it("matches zealot_savior when piety >= 50 or zeal >= 50 or compassion >= 40", () => {
      const savior = createMockLich({
        personality: { ...createMockLich().personality, piety: 75, zeal: 60 }
      });
      const types = getMatchingLichTypes(savior);
      expect(types).toContain("zealot_savior");
    });

    it("matches truth_seeker when rationality >= 50 or arcane >= 90", () => {
      const seeker = createMockLich({
        personality: { ...createMockLich().personality, rationality: 75 },
        arcane: 98
      });
      const types = getMatchingLichTypes(seeker);
      expect(types).toContain("truth_seeker");
    });

    it("matches nihilistic_mourner when energy <= 50 or sociability <= 40", () => {
      const mourner = createMockLich({
        personality: { ...createMockLich().personality, energy: 20, sociability: 15 }
      });
      const types = getMatchingLichTypes(mourner);
      expect(types).toContain("nihilistic_mourner");
    });

    it("matches immortal_magistrate when honor >= 50 or rationality >= 45", () => {
      const magistrate = createMockLich({
        personality: { ...createMockLich().personality, honor: 80 }
      });
      const types = getMatchingLichTypes(magistrate);
      expect(types).toContain("immortal_magistrate");
    });

    it("matches aesthetic_taxidermist when appearance >= 50", () => {
      const artist = createMockLich({ appearance: 70 });
      const types = getMatchingLichTypes(artist);
      expect(types).toContain("aesthetic_taxidermist");
    });
  });

  it("selects randomly among matching types and produces valid hook IDs", () => {
    const lich = createMockLich();
    const hook = selectLichFlavorHook(lich, races);
    expect(hook).not.toBeNull();
    expect(hook?.id).toMatch(/^lich\.[a-z_]+\.[1-3]$/);
  });

  it("integrates into generateCharacterHooks for Lich characters", () => {
    const lich = createMockLich();
    const hooks = generateCharacterHooks(lich, races);
    const lichHook = hooks.find(h => h.id.startsWith("lich."));
    expect(lichHook).toBeDefined();
    expect(lichHook?.id).toMatch(/^lich\.[a-z_]+\.[1-3]$/);
  });

  it("resolves all Lich dialogue lines in Japanese and English via formatFlavorHook", async () => {
    for (const def of LICH_TYPE_DEFINITIONS) {
      for (let variant = 1; variant <= def.variantsCount; variant++) {
        const hookId = `lich.${def.type}.${variant}`;

        await i18next.changeLanguage("ja");
        const jaText = formatFlavorHook({ id: hookId }, i18next.t);
        expect(jaText).not.toBe(hookId);
        expect(jaText.length).toBeGreaterThan(5);

        await i18next.changeLanguage("en");
        const enText = formatFlavorHook({ id: hookId }, i18next.t);
        expect(enText).not.toBe(hookId);
        expect(enText.length).toBeGreaterThan(5);
      }
    }
  });
});
