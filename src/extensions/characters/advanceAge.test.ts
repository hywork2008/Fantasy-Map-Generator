import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import {
  advanceCharacterAging,
  declineAt,
  PROWESS_DECLINE_PER_YEAR_INDOOR,
  PROWESS_DECLINE_PER_YEAR_LABOR,
  PROWESS_DECLINE_PER_YEAR_WARRIOR,
  prowessDeclineRateForCreation,
  prowessLifestyleForCharacter,
  prowessLifestyleForCreation,
  replaceAgedDemonCover
} from "./advanceAge";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import "./types";

describe("advanceCharacterAging", () => {
  afterEach(() => {
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {} as unknown as PackedGraph;
  });

  // docs/plan/advance-time-history-mode.md §0: advanceCharacterAging() is called once per
  // simulated calendar day with deltaYears = 1/365.2425. Before the ageFraction carryover it
  // computed Math.round(age + 0.0027) === age, so characters never aged at all in the app.
  describe("daily cadence (Phase H0 regression)", () => {
    const DAY = 1 / 365.2425;

    // Thousands of aging passes would otherwise draw thousands of mortality rolls: the subject
    // would probably die mid-loop (1%/yr compounds to ~10% over ten years), and the draws would
    // shift the shared Math.random stream the other tests in this file run on. Pinning it to 0
    // means "always survives" and leaves that stream untouched.
    beforeEach(() => {
      vi.spyOn(Math, "random").mockReturnValue(0);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** A minimal non-CK3 character: aging only, no skills/personality growth branch. */
    const agelessSubject = (age: number) => ({
      i: 0,
      age,
      dead: false,
      appearance: 50,
      abilityProfile: { presetId: "dnd5e", values: {} },
      skills: { prowess: 50 } as never,
      personality: {} as never,
      titles: [],
      pastTitles: []
    });

    it("ages exactly one year over a year of daily steps", () => {
      worldContext.pack.characters = [agelessSubject(30) as never];

      for (let day = 0; day < 366; day += 1) advanceCharacterAging(DAY);

      expect(worldContext.pack.characters[0].age).toBe(31);
    });

    it("ages exactly ten years over ten years of daily steps", () => {
      worldContext.pack.characters = [agelessSubject(30) as never];

      for (let day = 0; day < 3653; day += 1) advanceCharacterAging(DAY);

      expect(worldContext.pack.characters[0].age).toBe(40);
    });

    it("does not advance age partway through a year", () => {
      worldContext.pack.characters = [agelessSubject(30) as never];

      for (let day = 0; day < 180; day += 1) advanceCharacterAging(DAY);

      expect(worldContext.pack.characters[0].age).toBe(30);
      expect(worldContext.pack.characters[0].ageFraction).toBeCloseTo(180 * DAY, 6);
    });

    it("matches a single whole-year step after a year of daily steps", () => {
      worldContext.pack.characters = [agelessSubject(42) as never, agelessSubject(42) as never];
      worldContext.pack.characters[1].i = 1;

      // Character 0 walks a year one day at a time; character 1 takes it in one step.
      for (let day = 0; day < 366; day += 1) {
        worldContext.pack.characters = [worldContext.pack.characters[0]];
        advanceCharacterAging(DAY);
        worldContext.pack.characters = [worldContext.pack.characters[0], { ...agelessSubject(42), i: 1 } as never];
      }
      const dailyAge = worldContext.pack.characters[0].age;

      worldContext.pack.characters = [agelessSubject(42) as never];
      advanceCharacterAging(1);

      expect(dailyAge).toBe(worldContext.pack.characters[0].age);
    });

    it("keeps age level with the calendar across a span short of the mean year length", () => {
      // Live finding (2026-09-06): a 5-calendar-year span containing only one leap day is
      // 1826 days = 4.9994 mean years, so a plain floor() reported four years of aging for five
      // years on the clock. AGE_YEAR_EPSILON absorbs that; a real shortfall of a whole year
      // (a full day is 0.0027 years) is still far too large for it to swallow.
      worldContext.pack.characters = [agelessSubject(40) as never];

      for (let day = 0; day < 1826; day += 1) advanceCharacterAging(DAY);

      expect(worldContext.pack.characters[0].age).toBe(45);
    });

    it("does not drift over a long run: 50 calendar years age exactly 50", () => {
      worldContext.pack.characters = [agelessSubject(300) as never];

      // 50 Gregorian years starting on a non-century leap cycle: 18262 days.
      for (let day = 0; day < 18262; day += 1) advanceCharacterAging(DAY);

      expect(worldContext.pack.characters[0].age).toBe(350);
    });

    it("treats a monthly stride the same as the daily steps it replaces", () => {
      // Axis A (§4) advances one month per tick. A year of those must still age exactly one year.
      worldContext.pack.characters = [agelessSubject(55) as never];

      for (let month = 0; month < 12; month += 1) advanceCharacterAging(30.436875 * DAY);

      expect(worldContext.pack.characters[0].age).toBe(56);
    });
  });

  it("does nothing for a non-positive deltaYears", () => {
    worldContext.pack.characters = [
      {
        i: 0,
        age: 30,
        appearance: 50,
        skills: { prowess: 50 } as never,
        titles: []
      } as never
    ];
    const before = worldContext.pack.characters.map(c => c.age);

    advanceCharacterAging(0);

    expect(worldContext.pack.characters.map(c => c.age)).toEqual(before);
  });

  it("ages every non-dead character by deltaYears", () => {
    worldContext.pack.characters = [
      {
        i: 0,
        age: 30,
        dead: false,
        appearance: 50,
        skills: { prowess: 50 } as never,
        personality: { confidence: 50 } as never,
        titles: [],
        pastTitles: []
      } as never,
      {
        i: 1,
        age: 20,
        dead: true,
        appearance: 60,
        skills: { prowess: 60 } as never,
        personality: { confidence: 50 } as never,
        titles: [],
        pastTitles: []
      } as never
    ];

    advanceCharacterAging(3);

    const [alive, dead] = worldContext.pack.characters;
    expect(alive.age).toBe(33);
    expect(dead.age).toBe(20); // dead characters are skipped entirely
  });

  it("declines appearance and prowess further once a character crosses age 35", () => {
    worldContext.pack.characters = [
      {
        i: 0,
        age: 34,
        appearance: 80,
        skills: { prowess: 80 } as never,
        titles: []
      } as never
    ];

    advanceCharacterAging(3); // 34 -> 37, 2 years past the age-35 threshold

    const character = worldContext.pack.characters[0];
    expect(character.age).toBe(37);
    expect(character.appearance).toBe(79); // 80 - floor(2 * 0.55 vitality rate)
    expect(character.skills.prowess).toBe(76); // civilian: 80 - floor(2 * 2)
  });

  it("declines prowess slowly for military careers so veterans stay dangerous", () => {
    worldContext.pack.characters = [
      {
        i: 0,
        age: 34,
        appearance: 80,
        skills: { prowess: 80 } as never,
        personality: { sociability: 50, boldness: 50 } as never,
        titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }],
        pastTitles: []
      } as never
    ];

    advanceCharacterAging(11); // 34 -> 45, 10 years past threshold at 0.4/year

    const character = worldContext.pack.characters[0];
    expect(character.age).toBe(45);
    expect(character.appearance).toBe(75); // 80 - floor(10 * 0.55)
    expect(character.skills.prowess).toBe(76); // warrior: 80 - floor(10 * 0.4)
  });

  it("declines prowess slower for guild labor than for indoor clerks", () => {
    worldContext.pack.characters = [
      {
        i: 0,
        age: 34,
        appearance: 80,
        skills: { prowess: 80 } as never,
        personality: { sociability: 50, boldness: 50 } as never,
        titles: [],
        roles: [{ source: "economy", kind: "guildMaster", entityType: "burg", entityId: 1, label: "Guild Master" }],
        pastTitles: []
      } as never
    ];

    advanceCharacterAging(3); // 34 -> 37, 2 years past threshold at labor 1/year

    const character = worldContext.pack.characters[0];
    expect(character.skills.prowess).toBe(78); // 80 - floor(2 * 1)
  });

  it("does not decline appearance/prowess while still under the age-35 threshold", () => {
    worldContext.pack.characters = [
      {
        i: 0,
        age: 28, // past the random skill-growth cap (25) after aging, so the test stays deterministic
        appearance: 50,
        skills: { prowess: 50 } as never,
        personality: { confidence: 50 } as never,
        titles: []
      } as never
    ];

    advanceCharacterAging(5); // 28 -> 33, still under 35

    const character = worldContext.pack.characters[0];
    expect(character.appearance).toBe(50);
    expect(character.skills.prowess).toBe(50);
  });

  it("never declines appearance/prowess below 1", () => {
    worldContext.pack.characters = [
      { i: 0, age: 90, appearance: 2, skills: { prowess: 2 } as never, titles: [] } as never
    ];

    advanceCharacterAging(10);

    const character = worldContext.pack.characters[0];
    expect(character.appearance).toBe(1);
    expect(character.skills.prowess).toBe(1);
  });

  it("does nothing when there are no characters", () => {
    worldContext.pack.characters = [];
    expect(() => advanceCharacterAging(5)).not.toThrow();
  });

  it("a character with a critical affliction dies more often than an unafflicted twin (statistical, characterHealth.ts integration)", () => {
    const trials = 200;
    let sickDeaths = 0;
    let healthyDeaths = 0;

    const makeTwin = (i: number, afflicted: boolean) =>
      ({
        i,
        age: 30,
        dead: false,
        appearance: 50,
        skills: { prowess: 50 } as never,
        personality: { confidence: 50, sociability: 50, boldness: 50 } as never,
        titles: [],
        pastTitles: [],
        state: 1,
        wealth: 0,
        health: 100,
        affliction: afflicted ? { kind: "plague" as const, severity: "critical" as const, sinceYear: 1 } : undefined
      }) as never;

    for (let i = 0; i < trials; i++) {
      const sick = makeTwin(0, true);
      const healthy = makeTwin(1, false);
      worldContext.pack.characters = [sick, healthy];

      advanceCharacterAging(1);

      if (sick.dead) sickDeaths++;
      if (healthy.dead) healthyDeaths++;
    }

    expect(sickDeaths).toBeGreaterThan(healthyDeaths);
  });
});

describe("Demon cover replacement", () => {
  it("murders a nearby young Human and assumes their public identity", () => {
    const demon = {
      i: 1,
      name: "Old Cover",
      age: 70,
      gender: "male",
      culture: 1,
      race: 1,
      state: 2,
      location: 9,
      appearance: 20,
      family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
      marriages: [],
      affinities: {},
      titles: [{ title: "Spymaster", landed: false, entityType: "state", entityId: 2 }],
      demonInfiltration: {
        coverStratum: "influential",
        objective: "maximizeHumanDeaths",
        actualAge: 198,
        trueForm: {
          appearance: 91,
          looks: { stature: 88, build: 77, symmetry: 66, refinement: 55, vitality: 99, ornament: 44 },
          raceAppearance: { kind: "demon", hornAnimal: "ram" }
        },
        collaboratorIds: []
      }
    } as never;
    const victim = {
      i: 2,
      name: "Young Victim",
      age: 24,
      gender: "female",
      culture: 3,
      race: 1,
      state: 2,
      location: 9,
      appearance: 75,
      family: { spouses: 1, children: 0, grandchildren: 0, greatGrandchildren: 0, fatherId: 8 },
      marriages: [2],
      affinities: { 2: 50 },
      titles: []
    } as never;

    expect(replaceAgedDemonCover(demon, [demon, victim], 1200)).toBe(victim);
    expect(victim).toMatchObject({ dead: true, deathYear: 1200 });
    expect(demon).toMatchObject({
      name: "Young Victim",
      age: 24,
      gender: "female",
      culture: 3,
      appearance: 75,
      family: { spouses: 1, children: 0, grandchildren: 0, greatGrandchildren: 0, fatherId: 8 },
      marriages: [2],
      affinities: { 2: 50 }
    });
    expect(demon.titles[0].title).toBe("Spymaster");
    expect(demon.demonInfiltration.actualAge).toBe(198);
    expect(demon.demonInfiltration.trueForm).toEqual({
      appearance: 91,
      looks: { stature: 88, build: 77, symmetry: 66, refinement: 55, vitality: 99, ornament: 44 },
      raceAppearance: { kind: "demon", hornAnimal: "ram" }
    });
    expect(demon.demonInfiltration.identityReplacements).toEqual([
      { year: 1200, victimId: 2, victimName: "Young Victim", previousCoverName: "Old Cover" }
    ]);
  });

  it("does not murder a Human with an active non-political role", () => {
    const demon = {
      i: 1,
      name: "Old Cover",
      age: 70,
      race: 1,
      state: 2,
      location: 9,
      titles: [],
      demonInfiltration: { coverStratum: "commoner", objective: "maximizeHumanDeaths", collaboratorIds: [] }
    } as never;
    const employedHuman = {
      i: 2,
      name: "Employed Human",
      age: 24,
      race: 1,
      state: 2,
      location: 9,
      titles: [],
      roles: [{ source: "economy", kind: "guildMaster", entityType: "market", entityId: 1, label: "Guild master" }]
    } as never;

    expect(replaceAgedDemonCover(demon, [demon, employedHuman], 1200)).toBeUndefined();
    expect(employedHuman.dead).toBeUndefined();
  });
});

describe("prowess lifestyle decline", () => {
  it("keeps a sixty-year-old warrior near peak while indoor clerks collapse", () => {
    expect(declineAt(60, PROWESS_DECLINE_PER_YEAR_WARRIOR)).toBe(10);
    expect(declineAt(60, PROWESS_DECLINE_PER_YEAR_LABOR)).toBe(25);
    expect(declineAt(60, PROWESS_DECLINE_PER_YEAR_INDOOR)).toBe(50);
    expect(declineAt(70, PROWESS_DECLINE_PER_YEAR_WARRIOR)).toBe(14);
  });

  it("ranks warrior above labor above indoor at creation", () => {
    expect(prowessLifestyleForCreation("commander", "martial")).toBe("warrior");
    expect(prowessLifestyleForCreation("ordinary", "engineering")).toBe("labor");
    expect(prowessLifestyleForCreation("province_lord")).toBe("labor");
    expect(prowessLifestyleForCreation("central_officer", "stewardship")).toBe("indoor");
    expect(prowessDeclineRateForCreation("commander")).toBe(PROWESS_DECLINE_PER_YEAR_WARRIOR);
    expect(prowessDeclineRateForCreation("ordinary", "engineering")).toBe(PROWESS_DECLINE_PER_YEAR_LABOR);
    expect(prowessDeclineRateForCreation("merchant", "stewardship")).toBe(PROWESS_DECLINE_PER_YEAR_INDOOR);
  });

  it("reads living titles and craft roles, not retired offices", () => {
    expect(
      prowessLifestyleForCharacter({
        titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }],
        roles: [],
        pastTitles: []
      } as never)
    ).toBe("warrior");
    expect(
      prowessLifestyleForCharacter({
        titles: [],
        roles: [{ source: "economy", kind: "guildApprentice", entityType: "burg", entityId: 1, label: "Apprentice" }],
        backstory: {
          origin: { socialStratum: "commoner", estateStatus: "freeman", birthStateId: 1, raisedIn: "capital_city" }
        }
      } as never)
    ).toBe("labor");
    expect(
      prowessLifestyleForCharacter({
        titles: [{ title: "Steward", landed: false, entityType: "state", entityId: 1 }],
        roles: [],
        backstory: {
          origin: { socialStratum: "gentry", estateStatus: "official", birthStateId: 1, raisedIn: "capital_court" }
        }
      } as never)
    ).toBe("indoor");
    expect(
      prowessLifestyleForCharacter({
        titles: [],
        roles: [],
        pastTitles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }],
        backstory: {
          origin: { socialStratum: "commoner", estateStatus: "freeman", birthStateId: 1, raisedIn: "rural_manor" }
        }
      } as never)
    ).toBe("labor");
  });
});
