import { afterEach, describe, expect, it } from "vitest";
import type { Character, CharacterPersonality, CharacterSkills } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setIndividualSkills } from "../economyContext";
import { buildCharacterReadiness } from "./characterReadiness";

const BASE_SKILLS: CharacterSkills = {
  artistry: 40,
  diplomacy: 40,
  engineering: 40,
  geography: 40,
  intrigue: 40,
  learning: 40,
  martial: 50,
  prowess: 50,
  stewardship: 40
};

const BASE_PERSONALITY: CharacterPersonality = {
  boldness: 50,
  compassion: 50,
  greed: 50,
  honor: 50,
  rationality: 50,
  sociability: 50,
  vengefulness: 50,
  zeal: 50,
  energy: 50,
  piety: 50,
  guile: 50,
  confidence: 50
};

function makeCharacter(partial: Partial<Character> & Pick<Character, "i" | "name">): Character {
  return {
    age: 30,
    gender: "male",
    culture: 1,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: { ...BASE_SKILLS },
    personality: { ...BASE_PERSONALITY },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 40,
    wealth: 20,
    pastTitles: [],
    ...partial
  };
}

describe("buildCharacterReadiness", () => {
  afterEach(() => clearEconomyContext());

  it("summarizes unarmed kit with tips", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    const character = makeCharacter({
      i: 1,
      name: "Peasant",
      loadout: { body: { goodId: 1, quality: 2, source: "seeded" } }
    });
    const r = buildCharacterReadiness(character);
    expect(r.attireQuality).toBe(2);
    expect(r.weaponQuality).toBe(0);
    expect(r.summaryLine).toContain("Garments Q2");
    expect(r.summaryLine).toContain("Unarmed");
    expect(r.summaryLine).toMatch(/Est\. score/);
    expect(r.readinessTips.some(t => /weapon/i.test(t))).toBe(true);
  });

  it("includes domain practice and undergear advisory vs target", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { characters: [] } as typeof worldContext.pack;
    setIndividualSkills([
      {
        characterId: 2,
        domain: "swordsmanship",
        proficiency: 40,
        aptitude: "ordinary",
        techniques: []
      }
    ]);
    const character = makeCharacter({
      i: 2,
      name: "Militia",
      loadout: {
        body: { goodId: 1, quality: 2, source: "seeded" },
        weapon: { goodId: 2, quality: 2, source: "seeded" }
      }
    });
    const r = buildCharacterReadiness(character, {
      compareTarget: {
        kind: "monster",
        monsterId: 0,
        cellId: 1,
        rarity: 5,
        powerSnapshot: 40,
        label: "Horror"
      }
    });
    expect(r.martialDomain.swordsmanship).toBe(40);
    expect(r.combatScoreEstimate).toBeGreaterThan(50);
    expect(r.readinessTips.some(t => /Undergunned|Close match/i.test(t))).toBe(true);
  });
});
