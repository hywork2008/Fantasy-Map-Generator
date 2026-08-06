import { afterEach, describe, expect, it } from "vitest";
import type { Character, CharacterPersonality, CharacterSkills } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import {
  clearEconomyContext,
  getIndividualSkills,
  getSimulationYear,
  initEconomyContext,
  setIndividualSkills
} from "../economyContext";
import {
  applyCullPracticeCredit,
  cullPracticeBaseGain,
  cullPracticeDiminishingReturns,
  cullPracticeGain,
  selectCullPracticeDomain
} from "./cullPractice";

const BASE_SKILLS: CharacterSkills = {
  artistry: 40,
  diplomacy: 40,
  engineering: 40,
  geography: 40,
  intrigue: 40,
  learning: 40,
  martial: 60,
  prowess: 55,
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

describe("cullPractice pure helpers", () => {
  it("base gain is highest on success, reduced on injury, zero on death", () => {
    expect(cullPracticeBaseGain("success", false)).toBeCloseTo(0.85, 5);
    expect(cullPracticeBaseGain("partial", false)).toBeCloseTo(0.5, 5);
    expect(cullPracticeBaseGain("fail", false)).toBeCloseTo(0.18, 5);
    expect(cullPracticeBaseGain("dead", false)).toBe(0);
    expect(cullPracticeBaseGain("success", true)).toBeCloseTo(0.85 * 0.65, 5);
  });

  it("diminishing returns slow high proficiency", () => {
    expect(cullPracticeDiminishingReturns(20)).toBeGreaterThan(cullPracticeDiminishingReturns(80));
    expect(cullPracticeDiminishingReturns(95)).toBeLessThan(cullPracticeDiminishingReturns(85));
  });

  it("cullPracticeGain is positive mid-band and zero at 100", () => {
    const mid = cullPracticeGain(40, 0.85, "ordinary");
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThanOrEqual(1.0);
    expect(cullPracticeGain(100, 0.85, "exceptional")).toBe(0);
    expect(cullPracticeGain(50, 0, "ordinary")).toBe(0);
  });
});

describe("selectCullPracticeDomain", () => {
  afterEach(() => clearEconomyContext());

  it("picks archery for bow style keys", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    const character = makeCharacter({
      i: 1,
      name: "Archer",
      loadout: {
        weapon: { goodId: 1, quality: 3, source: "equipped", styleKey: "hunting_bow" }
      }
    });
    expect(selectCullPracticeDomain(character)).toBe("archery");
  });

  it("defaults to swordsmanship and prefers stronger existing domain", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { characters: [] } as typeof worldContext.pack;
    setIndividualSkills([
      {
        characterId: 2,
        domain: "archery",
        proficiency: 60,
        aptitude: "ordinary",
        techniques: []
      },
      {
        characterId: 2,
        domain: "swordsmanship",
        proficiency: 40,
        aptitude: "ordinary",
        techniques: []
      }
    ]);
    const character = makeCharacter({ i: 2, name: "Bowman" });
    expect(selectCullPracticeDomain(character)).toBe("archery");

    const swordsman = makeCharacter({ i: 3, name: "Swordsman" });
    expect(selectCullPracticeDomain(swordsman)).toBe("swordsmanship");
  });
});

describe("applyCullPracticeCredit", () => {
  afterEach(() => clearEconomyContext());

  it("creates a domain skill and raises proficiency without base skills", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { characters: [] } as typeof worldContext.pack;
    worldContext.options = { ...(worldContext.options ?? {}), year: 1200 } as typeof worldContext.options;

    const character = makeCharacter({ i: 10, name: "Hunter" });
    const martialBefore = character.skills.martial;
    const prowessBefore = character.skills.prowess;

    const result = applyCullPracticeCredit(character, "success", false);
    expect(result).not.toBeNull();
    expect(result!.domain).toBe("swordsmanship");
    expect(result!.gain).toBeGreaterThan(0);
    expect(result!.after).toBeCloseTo(result!.before + result!.gain, 5);

    const skill = getIndividualSkills().find(s => s.characterId === 10 && s.domain === "swordsmanship");
    expect(skill).toBeDefined();
    expect(skill!.proficiency).toBe(result!.after);
    expect(skill!.lastPracticedYear).toBe(getSimulationYear());

    // K5: base skills untouched
    expect(character.skills.martial).toBe(martialBefore);
    expect(character.skills.prowess).toBe(prowessBefore);
  });

  it("applies smaller gain on fail and none on dead", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { characters: [] } as typeof worldContext.pack;

    const a = makeCharacter({ i: 11, name: "A" });
    const b = makeCharacter({ i: 12, name: "B" });
    const success = applyCullPracticeCredit(a, "success", false);
    const fail = applyCullPracticeCredit(b, "fail", false);
    expect(success!.gain).toBeGreaterThan(fail!.gain);
    expect(applyCullPracticeCredit(makeCharacter({ i: 13, name: "C" }), "dead", false)).toBeNull();
  });

  it("returns null for deceased characters", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    expect(applyCullPracticeCredit(makeCharacter({ i: 14, name: "Dead", dead: true }), "success", false)).toBeNull();
  });

  it("injury reduces gain vs uninjured same outcome", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { characters: [] } as typeof worldContext.pack;
    // Force identical starting skill via pre-seed
    setIndividualSkills([
      {
        characterId: 20,
        domain: "swordsmanship",
        proficiency: 40,
        aptitude: "ordinary",
        techniques: []
      },
      {
        characterId: 21,
        domain: "swordsmanship",
        proficiency: 40,
        aptitude: "ordinary",
        techniques: []
      }
    ]);
    const healthy = applyCullPracticeCredit(makeCharacter({ i: 20, name: "H" }), "success", false);
    const hurt = applyCullPracticeCredit(makeCharacter({ i: 21, name: "I" }), "success", true);
    expect(healthy!.gain).toBeGreaterThan(hurt!.gain);
  });
});
