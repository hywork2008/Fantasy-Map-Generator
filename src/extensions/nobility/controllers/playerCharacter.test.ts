import { describe, expect, it } from "vitest";
import type { Character } from "../../characters/characterTypes";
import { buildPlayerCharacterSummary, pickRandomPoliticalCharacterId, resolveOrganization } from "./playerCharacter";

function makeCharacter(overrides: Partial<Character> & Pick<Character, "i" | "name" | "titles">): Character {
  return {
    age: 40,
    gender: "male",
    culture: 1,
    affinities: {},
    marriages: [],
    state: 1,
    skills: {} as Character["skills"],
    personality: {} as Character["personality"],
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 50,
    wealth: 0,
    pastTitles: [],
    ...overrides
  };
}

describe("playerCharacter", () => {
  it("resolves central government vs ruling court vs province vs regiment", () => {
    const pack = {
      states: [
        undefined,
        {
          i: 1,
          name: "Aldoria",
          military: [{ i: 0, name: "1st Army", commanderId: 3, state: 1 } as never]
        }
      ] as never,
      provinces: [undefined, { i: 1, name: "Northmarch", fullName: "County of Northmarch", state: 1 } as never]
    };

    const ruler = makeCharacter({
      i: 0,
      name: "A",
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
    });
    const officer = makeCharacter({
      i: 1,
      name: "B",
      titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }]
    });
    const lord = makeCharacter({
      i: 2,
      name: "C",
      titles: [{ title: "Count", landed: true, entityType: "province", entityId: 1 }]
    });
    const commander = makeCharacter({
      i: 3,
      name: "D",
      titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }]
    });

    expect(resolveOrganization(ruler, ruler.titles[0], pack)).toBe("Ruling Court");
    expect(resolveOrganization(officer, officer.titles[0], pack)).toBe("Central Government");
    expect(resolveOrganization(lord, lord.titles[0], pack)).toBe("County of Northmarch");
    expect(resolveOrganization(commander, commander.titles[0], pack)).toBe("Military · 1st Army");
  });

  it("builds a display summary for a living politician", () => {
    const character = makeCharacter({
      i: 5,
      name: "Elena",
      state: 2,
      titles: [{ title: "Queen", landed: true, entityType: "state", entityId: 2 }]
    });
    const pack = {
      states: [undefined, undefined, { i: 2, name: "Vespera" } as never]
    };

    expect(buildPlayerCharacterSummary(character, pack)).toEqual({
      id: 5,
      name: "Elena",
      wealth: 0,
      title: "Queen",
      stateId: 2,
      stateName: "Vespera",
      organization: "Ruling Court"
    });
  });

  it("picks only living titled characters", () => {
    const characters = [
      makeCharacter({
        i: 0,
        name: "Dead",
        dead: true,
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      }),
      makeCharacter({ i: 1, name: "Civilian", titles: [] }),
      makeCharacter({
        i: 2,
        name: "Marshal",
        titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }]
      })
    ];

    for (let i = 0; i < 20; i++) {
      expect(pickRandomPoliticalCharacterId(characters)).toBe(2);
    }
    expect(pickRandomPoliticalCharacterId([])).toBeNull();
  });

  it("can exclude the current selection when other candidates exist", () => {
    const characters = [
      makeCharacter({
        i: 1,
        name: "King",
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      }),
      makeCharacter({
        i: 2,
        name: "Marshal",
        titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }]
      })
    ];

    for (let i = 0; i < 20; i++) {
      expect(pickRandomPoliticalCharacterId(characters, 1)).toBe(2);
    }
    // Sole remaining candidate is kept when exclusion would empty the pool.
    expect(pickRandomPoliticalCharacterId(characters.slice(0, 1), 1)).toBe(1);
  });
});
