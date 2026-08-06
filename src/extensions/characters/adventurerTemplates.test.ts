import { afterEach, describe, expect, it } from "vitest";
import { applyPrepTemplateLoadout, buildTemplateLoadout, getPrepTemplate, PREP_TEMPLATES } from "./adventurerTemplates";
import type { Character, CharacterPersonality, CharacterSkills } from "./characterTypes";
import { FALLBACK_LOADOUT_GOOD_IDS } from "./loadoutSeed";

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
    wealth: 100,
    pastTitles: [],
    ...partial
  };
}

describe("adventurerTemplates", () => {
  it("lists five prep templates", () => {
    expect(PREP_TEMPLATES).toHaveLength(5);
    expect(getPrepTemplate("hireling")?.domainSeeds?.swordsmanship).toBe(40);
  });

  it("builds hireling loadout with Q3 kit", () => {
    const loadout = buildTemplateLoadout("hireling", FALLBACK_LOADOUT_GOOD_IDS);
    expect(loadout?.body?.quality).toBe(3);
    expect(loadout?.weapon?.quality).toBe(3);
    expect(loadout?.body?.source).toBe("editor");
  });

  it("applies sovereign template without spending wealth or minting inventory", () => {
    const character = makeCharacter({ i: 1, name: "King", wealth: 500 });
    const wealthBefore = character.wealth;
    const result = applyPrepTemplateLoadout(character, "sovereign");
    expect(result.ok).toBe(true);
    expect(character.loadout?.body?.quality).toBe(5);
    expect(character.loadout?.weapon?.quality).toBe(4);
    expect(character.loadout?.accessory?.quality).toBe(5);
    expect(character.wealth).toBe(wealthBefore);
    expect(character.inventory).toBeUndefined();
  });

  it("returns equipped items to inventory when replaced", () => {
    const character = makeCharacter({
      i: 2,
      name: "Hireling",
      loadout: {
        body: { goodId: 99, quality: 3, source: "equipped" }
      }
    });
    applyPrepTemplateLoadout(character, "peasant");
    expect(character.inventory?.[99]).toBe(1);
    expect(character.loadout?.body?.source).toBe("editor");
  });

  afterEach(() => {
    // no context
  });
});
