import { describe, expect, it } from "vitest";
import type { Character } from "./characterTypes";
import {
  advanceDemonSocietyExperience,
  effectiveDemonSecretSkill,
  inheritDemonCoverSkills,
  initializeDemonSocietyExperience
} from "./demonExperience";

function character(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Cover",
    age: 40,
    gender: "male",
    culture: 1,
    race: 1,
    state: 1,
    skills: {
      artistry: 20,
      diplomacy: 30,
      engineering: 25,
      geography: 35,
      intrigue: 40,
      learning: 45,
      martial: 50,
      prowess: 30,
      stewardship: 55
    },
    personality: {} as never,
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 50,
    wealth: 0,
    titles: [],
    pastTitles: [],
    affinities: {},
    marriages: [],
    demonInfiltration: {
      coverStratum: "influential",
      objective: "maximizeHumanDeaths",
      demonIdentity: { skills: { intrigue: 72, diplomacy: 68 } as never } as never,
      collaboratorIds: []
    },
    ...overrides
  };
}

describe("Demon human-society experience", () => {
  it("accumulates Human expertise and uses it only for secret-skill evaluation", () => {
    const infiltrator = character();
    initializeDemonSocietyExperience(infiltrator);
    advanceDemonSocietyExperience(infiltrator, 200);

    expect(infiltrator.skills.intrigue).toBe(40);
    expect(effectiveDemonSecretSkill(infiltrator, "intrigue")).toBe(84); // Demon 72 + four 50-year lessons
  });

  it("passes part of only the strongest learned skills into the next Human cover", () => {
    const infiltrator = character({
      skills: { ...character().skills, martial: 90, intrigue: 80, stewardship: 70 }
    });
    initializeDemonSocietyExperience(infiltrator);
    const nextCover = character({
      i: 2,
      skills: { ...character().skills, martial: 20, intrigue: 30, stewardship: 40 },
      demonInfiltration: undefined
    });

    inheritDemonCoverSkills(infiltrator, nextCover);

    expect(nextCover.skills.martial).toBe(41);
    expect(nextCover.skills.intrigue).toBe(45);
    expect(nextCover.skills.stewardship).toBe(49);
    expect(nextCover.skills.learning).toBe(45);
  });

  it("occasionally deepens infernal Arcane at fifty-year society milestones", () => {
    const infiltrator = character({ arcane: 70 });
    infiltrator.demonInfiltration!.demonIdentity!.arcane = 70;
    initializeDemonSocietyExperience(infiltrator);

    advanceDemonSocietyExperience(infiltrator, 100, () => 0);

    expect(infiltrator.arcane).toBe(72);
    expect(infiltrator.demonInfiltration!.demonIdentity!.arcane).toBe(72);
    expect(infiltrator.demonInfiltration!.humanSocietyExperience!.arcaneGrowthMilestones).toBe(2);
  });

  it("ensures effective demon skill is at least as high as the human cover's current skill", () => {
    const infiltrator = character({
      skills: { ...character().skills, martial: 85, stewardship: 75 }
    });
    // Demon identity has lower stewardship (e.g. 50), but cover has 75
    infiltrator.demonInfiltration!.demonIdentity!.skills = {
      ...character().skills,
      martial: 60,
      stewardship: 50,
      intrigue: 90
    };
    initializeDemonSocietyExperience(infiltrator);

    expect(effectiveDemonSecretSkill(infiltrator, "martial")).toBeGreaterThanOrEqual(85);
    expect(effectiveDemonSecretSkill(infiltrator, "stewardship")).toBeGreaterThanOrEqual(75);
    expect(effectiveDemonSecretSkill(infiltrator, "intrigue")).toBeGreaterThanOrEqual(90);
  });
});
