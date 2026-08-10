import { describe, expect, it } from "vitest";
import { setSolidarity } from "../../characters/backstoryProfile";
import type { Character } from "../../characters/characterTypes";
import {
  assessApprenticeDeparture,
  getApprenticeRecruitmentChance,
  getGuildMasterStanding,
  getInitialApprenticePrestige
} from "./guildApprenticeLifecycle";
import type { CharacterDomainSkill } from "./individualSkillTypes";

function character(i: number, engineering = 50): Character {
  return {
    i,
    name: `Character ${i}`,
    age: 25,
    gender: "male",
    culture: 1,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {
      artistry: 50,
      diplomacy: 50,
      engineering,
      geography: 50,
      intrigue: 50,
      learning: 50,
      martial: 50,
      prowess: 50,
      stewardship: 50
    },
    personality: {
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
    },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 50,
    wealth: 0,
    pastTitles: []
  };
}

describe("guild apprentice lifecycle", () => {
  it("keeps ordinary apprentices near zero prestige but recognizes engineering prodigies", () => {
    expect(getInitialApprenticePrestige(50)).toBeLessThanOrEqual(5);
    expect(getInitialApprenticePrestige(89)).toBeLessThanOrEqual(5);
    expect(getInitialApprenticePrestige(90)).toBeGreaterThanOrEqual(10);
    expect(getInitialApprenticePrestige(100)).toBe(50);
  });

  it("makes financial mobility affect whether dissatisfaction becomes a departure", () => {
    const master = character(1, 80);
    const apprentice = character(2, 10);
    apprentice.personality.confidence = 95;

    const trapped = assessApprenticeDeparture(master, apprentice);
    apprentice.wealth = 5;
    const mobile = assessApprenticeDeparture(master, apprentice);

    expect(trapped.pressure).toBeGreaterThan(0);
    expect(mobile.annualChance).toBeGreaterThan(trapped.annualChance);
    expect(mobile.reasons).toContain("overconfident-low-engineering");
  });

  it("adds relationship strain while keeping the assessment pure", () => {
    const master = character(1, 80);
    const apprentice = character(2, 50);
    apprentice.wealth = 2;
    setSolidarity(master, apprentice.i, -80);
    setSolidarity(apprentice, master.i, -80);

    const assessment = assessApprenticeDeparture(master, apprentice);

    expect(assessment.annualChance).toBeGreaterThan(0);
    expect(assessment.reasons).toContain("strained-mentorship");
  });

  it("recruits more readily in larger burgs under a more established master", () => {
    const master = character(1, 80);
    master.prestige = 80;
    const mastery: CharacterDomainSkill = {
      characterId: master.i,
      domain: "blacksmithing",
      proficiency: 85,
      aptitude: "gifted",
      techniques: []
    };
    const standing = getGuildMasterStanding(master, mastery);

    expect(getApprenticeRecruitmentChance(30, standing)).toBeGreaterThan(getApprenticeRecruitmentChance(1, 0.1));
  });
});
