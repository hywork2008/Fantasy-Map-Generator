import { describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import {
  allocateDemonHostStates,
  allocateDemonStrata,
  repairDemonInfiltrationTrueIdentities,
  replenishDemonInfiltration,
  seedDemonInfiltration
} from "./demonInfiltration";

describe("demon infiltration allocation", () => {
  it("matches the state count and preserves the intended social mix", () => {
    expect(allocateDemonStrata(40)).toEqual({ ruler: 6, military: 8, influential: 10, commoner: 16 });
    expect(Object.values(allocateDemonStrata(15)).reduce((sum, count) => sum + count, 0)).toBe(15);
  });

  it("leaves about forty percent of states without a Demon and clusters the rest", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const hosts = allocateDemonHostStates(
      Array.from({ length: 40 }, (_, index) => index + 1),
      40
    );
    expect(hosts).toHaveLength(40);
    expect(new Set(hosts).size).toBe(24);
    expect(Math.max(...[...new Set(hosts)].map(id => hosts.filter(host => host === id).length))).toBeLessThanOrEqual(4);
    vi.restoreAllMocks();
  });

  it("preserves an open Demon's original appearance as its true form", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const demon = {
      i: 1,
      name: "Azram",
      age: 149,
      race: 4,
      state: 1,
      titles: [],
      appearance: 91,
      arcane: 87,
      skills: { martial: 93, intrigue: 84 } as never,
      personality: { greed: 72, guile: 95 } as never,
      inventory: { 4: 12 },
      looks: { stature: 88, build: 77, symmetry: 66, refinement: 55, vitality: 99, ornament: 44 },
      raceAppearance: { kind: "demon", hornAnimal: "ram" }
    } as never;

    const [infiltrator] = seedDemonInfiltration({
      characters: [demon],
      states: [{ i: 1, capital: 1, culture: 1 }] as never,
      pack: {
        races: [
          { i: 1, key: "human" },
          { i: 4, key: "demon" }
        ]
      },
      currentYear: 1000
    });

    expect(infiltrator.demonInfiltration?.trueForm).toEqual({
      appearance: 91,
      looks: { stature: 88, build: 77, symmetry: 66, refinement: 55, vitality: 99, ornament: 44 },
      raceAppearance: { kind: "demon", hornAnimal: "ram" }
    });
    expect(infiltrator.raceAppearance).toBeUndefined();
    expect(infiltrator.arcane).toBe(87);
    expect(infiltrator.demonInfiltration?.demonIdentity).toMatchObject({
      name: "Azram",
      race: 4,
      arcane: 87,
      skills: { martial: 93, intrigue: 84 },
      personality: { greed: 72, guile: 95 },
      inventory: { 4: 12 }
    });
    expect(infiltrator.demonInfiltration?.coverIdentity).toMatchObject({
      name: "Azram",
      arcane: 87,
      skills: { martial: 93, intrigue: 84 },
      personality: { greed: 72, guile: 95 },
      inventory: { 4: 12 }
    });
    vi.restoreAllMocks();
  });

  it("always gives the true form horns when the source Demon has none", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const demon = {
      i: 1,
      name: "Hornless source",
      age: 149,
      race: 4,
      state: 1,
      titles: [],
      appearance: 70
    } as never;

    const [infiltrator] = seedDemonInfiltration({
      characters: [demon],
      states: [{ i: 1, capital: 1, culture: 1 }] as never,
      pack: {
        races: [
          { i: 1, key: "human" },
          { i: 4, key: "demon" }
        ]
      },
      currentYear: 1000
    });

    expect(infiltrator.demonInfiltration?.trueForm?.raceAppearance).toMatchObject({ kind: "demon" });
    expect(infiltrator.demonInfiltration?.trueForm?.raceAppearance.hornAnimal).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("replaces only serving rulers or military figures with a small new Demon cohort", () => {
    const ruler = {
      i: 1,
      name: "Queen Alia",
      age: 42,
      race: 1,
      culture: 1,
      state: 1,
      titles: [{ title: "Queen", landed: true, entityType: "state", entityId: 1, startYear: 990 }],
      appearance: 64,
      raceAppearance: { kind: "demon", hornAnimal: "ram" }
    } as never;
    const marshal = {
      i: 2,
      name: "Marshal Bren",
      age: 39,
      race: 1,
      culture: 1,
      state: 1,
      titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1, startYear: 995 }],
      appearance: 58,
      raceAppearance: { kind: "demon", hornAnimal: "goat" }
    } as never;
    const steward = {
      i: 3,
      name: "Steward Cato",
      age: 45,
      race: 1,
      culture: 1,
      state: 1,
      titles: [{ title: "Steward", landed: false, entityType: "state", entityId: 1, startYear: 993 }],
      appearance: 51,
      raceAppearance: { kind: "demon", hornAnimal: "ibex" }
    } as never;

    const added = replenishDemonInfiltration({
      characters: [ruler, marshal, steward],
      states: [{ i: 1, capital: 1, culture: 1 }] as never,
      pack: { races: [] },
      currentYear: 1100,
      count: 3
    });

    expect(added).toHaveLength(2);
    expect(added.map(character => character.name).sort()).toEqual(["Marshal Bren", "Queen Alia"]);
    expect(added.every(character => character.demonInfiltration)).toBe(true);
    expect(ruler.titles[0].title).toBe("Queen");
    expect(marshal.titles[0].title).toBe("Marshal");
    expect(steward.demonInfiltration).toBeUndefined();
  });

  it("repairs an older hidden identity that was accidentally generated as Human", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    const infiltrator = {
      i: 1,
      name: "Cover",
      age: 45,
      race: 1,
      arcane: 4,
      demonInfiltration: {
        coverStratum: "ruler",
        objective: "maximizeHumanDeaths",
        demonIdentity: { i: 1, race: 1, arcane: 4 } as never,
        collaboratorIds: []
      }
    } as never;

    expect(
      repairDemonInfiltrationTrueIdentities({ characters: [infiltrator], pack: { races: [{ i: 4, key: "demon" }] } })
    ).toBe(1);
    expect(infiltrator.race).toBe(1);
    expect(infiltrator.demonInfiltration.demonIdentity.race).toBe(4);
    expect(infiltrator.demonInfiltration.demonIdentity.arcane).toBeGreaterThan(10);
    expect(infiltrator.arcane).toBe(infiltrator.demonInfiltration.demonIdentity.arcane);
    vi.restoreAllMocks();
  });

  it("endows the demon true form with heightened infernal skills and the appropriate role class", () => {
    worldContext.pack = {
      cultures: [
        { i: 0, base: 0 },
        { i: 1, base: 0, name: "Common" }
      ],
      races: [
        { i: 1, key: "human" },
        { i: 4, key: "demon" }
      ]
    } as never;
    const humanRuler = {
      i: 10,
      name: "King Eldon",
      age: 50,
      race: 1,
      culture: 1,
      state: 1,
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1, startYear: 980 }],
      skills: {
        artistry: 40,
        diplomacy: 50,
        engineering: 40,
        geography: 40,
        intrigue: 50,
        learning: 50,
        martial: 50,
        prowess: 40,
        stewardship: 50
      },
      personality: {}
    } as never;

    const [infiltrator] = replenishDemonInfiltration({
      characters: [humanRuler],
      states: [{ i: 1, capital: 1, culture: 1 }] as never,
      pack: {
        races: [
          { i: 1, key: "human" },
          { i: 4, key: "demon" }
        ]
      },
      currentYear: 1000,
      count: 1
    });

    const demonIdentity = infiltrator.demonInfiltration?.demonIdentity;
    expect(demonIdentity).toBeDefined();
    expect(demonIdentity?.race).toBe(4);
    // Age should be greater than default young human, reflecting actual demon adult span
    expect(infiltrator.demonInfiltration?.actualAge).toBeGreaterThanOrEqual(28);
    // Ruler cover grants ruler role class + intrigue primary, plus infernal boost
    expect(demonIdentity?.skills.intrigue).toBeGreaterThan(55);
    expect(demonIdentity?.skills.learning).toBeGreaterThan(50);
  });
});
