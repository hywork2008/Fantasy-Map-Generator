import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultRaces, HUMAN_RACE_ID } from "../../data/races";
import { worldContext } from "../hostCore";
import type { ExtensionAPI } from "../hostTypes";
import { applyCharacterBackstory } from "./backstoryProfile";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import type { Character, CharacterRoleClass, SocialStratum } from "./characterTypes";
import { breakdownInitialPrestige, humanCareerYears, publicOfficeContribution, rollInitialPrestige } from "./prestige";

function character(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Test",
    age: 40,
    gender: "male",
    culture: 1,
    race: HUMAN_RACE_ID,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {
      artistry: 50,
      diplomacy: 50,
      engineering: 50,
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
    pastTitles: [],
    ...overrides
  };
}

describe("humanCareerYears", () => {
  it("is zero at the human career start and grows with adult years", () => {
    expect(humanCareerYears(character({ age: 20 }))).toBe(0);
    expect(humanCareerYears(character({ age: 19 }))).toBe(0);
    expect(humanCareerYears(character({ age: 45 }))).toBe(25);
  });
});

describe("publicOfficeContribution", () => {
  it("gives rulers full public visibility and a crown bump", () => {
    const office = publicOfficeContribution(
      character({ titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }] }),
      "ruler"
    );
    expect(office.visibility).toBe(1);
    expect(office.bump).toBeGreaterThanOrEqual(28);
    expect(office.bump).toBeLessThanOrEqual(38);
  });

  it("gives spymaster offices no public visibility even with high intrigue", () => {
    const spy = character({
      age: 55,
      skills: {
        artistry: 50,
        diplomacy: 50,
        engineering: 50,
        geography: 50,
        intrigue: 100,
        learning: 50,
        martial: 50,
        prowess: 50,
        stewardship: 50
      },
      titles: [{ title: "Spymaster", landed: false, entityType: "state", entityId: 1 }]
    });
    const office = publicOfficeContribution(spy, "central_officer");
    expect(office.visibility).toBe(0);
    expect(office.bump).toBe(0);
    expect(office.skillKey).toBeUndefined();
  });

  it("treats Director of Intelligence as a non-public office", () => {
    const office = publicOfficeContribution(
      character({
        titles: [{ title: "Director of Intelligence", landed: false, entityType: "state", entityId: 1 }]
      }),
      "central_officer"
    );
    expect(office.visibility).toBe(0);
    expect(office.bump).toBe(0);
  });
});

describe("breakdownInitialPrestige", () => {
  it("does not convert spymaster intrigue or age into a public record", () => {
    const weak = character({
      age: 55,
      skills: {
        artistry: 40,
        diplomacy: 40,
        engineering: 40,
        geography: 40,
        intrigue: 20,
        learning: 40,
        martial: 40,
        prowess: 40,
        stewardship: 40
      },
      titles: [{ title: "Spymaster", landed: false, entityType: "state", entityId: 1 }]
    });
    const gifted = {
      ...weak,
      skills: { ...weak.skills, intrigue: 100 }
    };
    const a = breakdownInitialPrestige(weak, "central_officer", "commoner", 5);
    const b = breakdownInitialPrestige(gifted, "central_officer", "commoner", 5);
    expect(a.record).toBe(0);
    expect(b.record).toBe(0);
    expect(a.officeBump).toBe(0);
    expect(b.officeBump).toBe(0);
    expect(a.total).toBe(5);
    expect(b.total).toBe(5);
  });

  it("gives a young king the crown without a legendary reign", () => {
    const young = breakdownInitialPrestige(
      character({
        age: 20,
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      }),
      "ruler",
      "royal",
      30
    );
    expect(young.careerYears).toBe(0);
    expect(young.record).toBe(0);
    expect(young.total).toBeGreaterThanOrEqual(58);
    expect(young.total).toBeLessThanOrEqual(68);
  });

  it("gives an established king more prestige than a newly crowned adult", () => {
    const young = breakdownInitialPrestige(
      character({
        age: 20,
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      }),
      "ruler",
      "royal",
      30
    );
    const established = breakdownInitialPrestige(
      character({
        age: 50,
        skills: {
          artistry: 50,
          diplomacy: 70,
          engineering: 50,
          geography: 50,
          intrigue: 50,
          learning: 50,
          martial: 50,
          prowess: 50,
          stewardship: 50
        },
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      }),
      "ruler",
      "royal",
      30
    );
    expect(established.record).toBeGreaterThan(20);
    expect(established.total).toBeGreaterThan(young.total + 15);
  });

  it("lets a veteran marshal outrank a junior captain of the same house", () => {
    const junior = breakdownInitialPrestige(
      character({
        age: 22,
        skills: {
          artistry: 30,
          diplomacy: 40,
          engineering: 30,
          geography: 40,
          intrigue: 30,
          learning: 30,
          martial: 70,
          prowess: 70,
          stewardship: 30
        },
        titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }]
      }),
      "commander",
      "minor_noble",
      12
    );
    const veteran = breakdownInitialPrestige(
      character({
        age: 55,
        skills: {
          artistry: 30,
          diplomacy: 50,
          engineering: 30,
          geography: 50,
          intrigue: 40,
          learning: 40,
          martial: 90,
          prowess: 70,
          stewardship: 40
        },
        titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }]
      }),
      "commander",
      "minor_noble",
      12
    );
    expect(junior.record).toBeLessThan(8);
    expect(veteran.record).toBeGreaterThan(junior.record + 15);
    expect(veteran.total).toBeGreaterThan(junior.total);
  });
});

describe("rollInitialPrestige via applyCharacterBackstory", () => {
  it("keeps commoner spymasters in the inherited-name band", () => {
    const values: number[] = [];
    for (let i = 0; i < 40; i++) {
      const spy = character({
        i,
        age: 50,
        titles: [{ title: "Spymaster", landed: false, entityType: "state", entityId: 1 }]
      });
      applyCharacterBackstory(spy, {
        roleClass: "central_officer",
        socialStratum: "commoner",
        capitalBurgId: 1
      });
      values.push(spy.prestige);
    }
    expect(Math.max(...values)).toBeLessThanOrEqual(20);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1);
  });

  it("does not make a twenty-year-old king a living legend", () => {
    const values: number[] = [];
    for (let i = 0; i < 30; i++) {
      const king = character({
        i,
        age: 20,
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      });
      applyCharacterBackstory(king, { roleClass: "ruler", socialStratum: "royal", capitalBurgId: 1 });
      values.push(king.prestige);
    }
    expect(Math.max(...values)).toBeLessThan(80);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(40);
  });
});

describe("long-lived races", () => {
  afterEach(() => {
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { races: createDefaultRaces() } as never;
  });

  it("does not treat a just-mature elf as an aged public figure", () => {
    const elf = createDefaultRaces().find(r => r.key === "elf")!;
    const years = humanCareerYears(character({ age: elf.fertility?.fertilityStart ?? 100, race: elf.i }));
    expect(years).toBe(0);
  });
});

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i]!;
}

function samplePrestige(
  n: number,
  make: (i: number) => { character: Character; roleClass: CharacterRoleClass; stratum: SocialStratum }
): number[] {
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const { character: c, roleClass, stratum } = make(i);
    applyCharacterBackstory(c, { roleClass, socialStratum: stratum, capitalBurgId: 1 });
    values.push(c.prestige);
  }
  return values;
}

describe("sampled generation bands", () => {
  it("keeps young kings below established kings, and spies far below both", () => {
    const youngKings = samplePrestige(80, i => ({
      character: character({
        i,
        age: 20,
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      }),
      roleClass: "ruler",
      stratum: "royal"
    }));
    const oldKings = samplePrestige(80, i => ({
      character: character({
        i,
        age: 50,
        skills: {
          artistry: 50,
          diplomacy: 70,
          engineering: 50,
          geography: 50,
          intrigue: 50,
          learning: 50,
          martial: 50,
          prowess: 50,
          stewardship: 50
        },
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      }),
      roleClass: "ruler",
      stratum: "royal"
    }));
    const spies = samplePrestige(80, i => ({
      character: character({
        i,
        age: 50,
        skills: {
          artistry: 40,
          diplomacy: 40,
          engineering: 40,
          geography: 40,
          intrigue: 90,
          learning: 40,
          martial: 40,
          prowess: 40,
          stewardship: 40
        },
        titles: [{ title: "Spymaster", landed: false, entityType: "state", entityId: 1 }]
      }),
      roleClass: "central_officer",
      stratum: "commoner"
    }));
    const marshals = samplePrestige(80, i => ({
      character: character({
        i,
        age: 55,
        skills: {
          artistry: 30,
          diplomacy: 50,
          engineering: 30,
          geography: 50,
          intrigue: 40,
          learning: 40,
          martial: 90,
          prowess: 70,
          stewardship: 40
        },
        titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }]
      }),
      roleClass: "commander",
      stratum: "minor_noble"
    }));

    expect(percentile(youngKings, 0.5)).toBeLessThan(percentile(oldKings, 0.5));
    expect(percentile(oldKings, 0.5)).toBeGreaterThan(80);
    expect(percentile(youngKings, 0.9)).toBeLessThan(80);
    expect(percentile(spies, 0.9)).toBeLessThan(20);
    expect(percentile(spies, 0.5)).toBeLessThan(percentile(marshals, 0.1));
    expect(percentile(marshals, 0.5)).toBeGreaterThan(45);
    expect(percentile(marshals, 0.5)).toBeLessThan(percentile(oldKings, 0.5));
  });
});

describe("rollInitialPrestige bounds", () => {
  const cases: Array<[CharacterRoleClass, SocialStratum, string]> = [
    ["ruler", "royal", "King"],
    ["central_officer", "commoner", "Spymaster"],
    ["commander", "minor_noble", "Marshal"],
    ["ordinary", "commoner", ""]
  ];

  it("stays inside 1–100 for core roles", () => {
    for (const [roleClass, stratum, title] of cases) {
      for (let age = 16; age <= 70; age += 6) {
        const c = character({
          age,
          titles: title ? [{ title, landed: roleClass === "ruler", entityType: "state", entityId: 1 }] : []
        });
        const prestige = rollInitialPrestige(c, roleClass, stratum);
        expect(prestige).toBeGreaterThanOrEqual(1);
        expect(prestige).toBeLessThanOrEqual(100);
      }
    }
  });
});
