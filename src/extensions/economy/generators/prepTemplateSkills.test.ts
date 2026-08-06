import { afterEach, describe, expect, it } from "vitest";
import type { Character, CharacterPersonality, CharacterSkills } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, getIndividualSkills, initEconomyContext, setIndividualSkills } from "../economyContext";
import { applyPrepTemplateSkills } from "./prepTemplateSkills";

const BASE_SKILLS: CharacterSkills = {
  artistry: 40,
  diplomacy: 40,
  engineering: 40,
  geography: 40,
  intrigue: 40,
  learning: 40,
  martial: 55,
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

describe("applyPrepTemplateSkills", () => {
  afterEach(() => clearEconomyContext());

  it("raises floors for hireling without lowering higher proficiency", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { characters: [] } as typeof worldContext.pack;
    setIndividualSkills([
      {
        characterId: 1,
        domain: "swordsmanship",
        proficiency: 70,
        aptitude: "ordinary",
        techniques: []
      }
    ]);
    const character = makeCharacter({ i: 1, name: "Vet" });
    const martialBefore = character.skills.martial;
    // Creates missing archery row (and would raise floors below existing proficiency).
    expect(applyPrepTemplateSkills(character, "hireling")).toBe(true);
    const skills = getIndividualSkills().filter(s => s.characterId === 1);
    const sword = skills.find(s => s.domain === "swordsmanship");
    const bow = skills.find(s => s.domain === "archery");
    expect(sword?.proficiency).toBe(70); // not lowered
    expect(bow?.proficiency).toBeGreaterThanOrEqual(25); // materialized / floor
    expect(character.skills.martial).toBe(martialBefore);
  });

  it("does nothing for peasant (no domain seeds)", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    const character = makeCharacter({ i: 2, name: "P" });
    expect(applyPrepTemplateSkills(character, "peasant")).toBe(false);
  });
});
