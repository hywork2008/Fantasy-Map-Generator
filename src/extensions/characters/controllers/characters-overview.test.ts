import { describe, expect, it } from "vitest";
import type { Character } from "../characterTypes";
import { filterAndSortCharacters, isFantasyCulturesSet, resolveCharacterRaceName } from "./characters-overview";

function baseCharacter(overrides: Partial<Character> & Pick<Character, "i" | "name">): Character {
  return {
    age: 40,
    gender: "male",
    culture: 1,
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
    prestige: 70,
    wealth: 0,
    pastTitles: [],
    titles: [],
    ...overrides
  };
}

const states = [
  { i: 0, name: "Neutral" },
  { i: 1, name: "Aldoria" },
  { i: 2, name: "Boralis" }
] as Parameters<typeof filterAndSortCharacters>[1];

describe("isFantasyCulturesSet", () => {
  it("is true only for highFantasy and darkFantasy", () => {
    expect(isFantasyCulturesSet("highFantasy")).toBe(true);
    expect(isFantasyCulturesSet("darkFantasy")).toBe(true);
    expect(isFantasyCulturesSet("world")).toBe(false);
    expect(isFantasyCulturesSet("european")).toBe(false);
    expect(isFantasyCulturesSet(undefined)).toBe(false);
  });
});

describe("resolveCharacterRaceName", () => {
  const races = [
    { i: 0, name: "Unknown" },
    { i: 1, name: "Human" },
    { i: 2, name: "Elf" }
  ];
  const cultures = [
    { i: 0, race: 0 },
    { i: 1, race: 2 }
  ];

  it("prefers character.race over culture.race", () => {
    const c = baseCharacter({ i: 1, name: "A", race: 1, culture: 1 });
    expect(resolveCharacterRaceName(c, races, cultures)).toBe("Human");
  });

  it("falls back to culture.race when character.race is missing", () => {
    const c = baseCharacter({ i: 1, name: "A", culture: 1 });
    expect(resolveCharacterRaceName(c, races, cultures)).toBe("Elf");
  });

  it("maps catalog Unknown (race 0 / Wildlands) to Human for display", () => {
    const c = baseCharacter({ i: 1, name: "Merchant", race: 0, culture: 0 });
    expect(resolveCharacterRaceName(c, races, cultures)).toBe("Human");
  });
});

describe("filterAndSortCharacters role class filter", () => {
  const characters = [
    baseCharacter({
      i: 1,
      name: "King Aldric",
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
    }),
    baseCharacter({
      i: 2,
      name: "Empress Sera",
      gender: "female",
      state: 2,
      titles: [{ title: "Emperor", landed: true, entityType: "state", entityId: 2 }]
    }),
    baseCharacter({
      i: 3,
      name: "Khan Temur",
      titles: [{ title: "Khan", landed: true, entityType: "state", entityId: 1 }]
    }),
    baseCharacter({
      i: 4,
      name: "Chancellor Vale",
      titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }]
    }),
    baseCharacter({
      i: 5,
      name: "Count Mira",
      titles: [{ title: "Count", landed: true, entityType: "province", entityId: 10 }]
    }),
    baseCharacter({
      i: 6,
      name: "Guildmaster Ren",
      roles: [
        {
          source: "economy",
          kind: "guildMaster",
          entityType: "burg",
          entityId: 1,
          label: "Guild Master"
        }
      ]
    })
  ];

  it("sorts and searches by race name when race data is provided", () => {
    const races = [
      { i: 0, name: "Unknown" },
      { i: 1, name: "Human" },
      { i: 2, name: "Elf" }
    ];
    const mixed = [
      baseCharacter({
        i: 1,
        name: "Ael",
        race: 2,
        titles: [{ title: "Queen", landed: true, entityType: "state", entityId: 1 }]
      }),
      baseCharacter({
        i: 2,
        name: "Bob",
        race: 1,
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
      })
    ];
    const sorted = filterAndSortCharacters(mixed, states, {
      searchText: "",
      filterStateId: -1,
      sortBy: "race",
      sortOrder: "asc",
      races
    });
    expect(sorted.map(r => r.raceName)).toEqual(["Elf", "Human"]);

    const searched = filterAndSortCharacters(mixed, states, {
      searchText: "elf",
      filterStateId: -1,
      sortBy: "name",
      sortOrder: "asc",
      races
    });
    expect(searched).toHaveLength(1);
    expect(searched[0].c.name).toBe("Ael");
  });

  it("groups King, Emperor, and Khan under ruler", () => {
    const rows = filterAndSortCharacters(characters, states, {
      searchText: "",
      filterStateId: -1,
      filterRoleClass: "ruler",
      sortBy: "name",
      sortOrder: "asc"
    });

    expect(rows.map(r => r.c.name)).toEqual(["Empress Sera", "Khan Temur", "King Aldric"]);
    expect(rows.every(r => r.roleClass === "ruler")).toBe(true);
  });

  it("filters court officers separately from sovereigns", () => {
    const rows = filterAndSortCharacters(characters, states, {
      searchText: "",
      filterStateId: -1,
      filterRoleClass: "central_officer",
      sortBy: "name",
      sortOrder: "asc"
    });

    expect(rows.map(r => r.c.name)).toEqual(["Chancellor Vale"]);
  });

  it("filters province lords and merchants", () => {
    const lords = filterAndSortCharacters(characters, states, {
      searchText: "",
      filterStateId: -1,
      filterRoleClass: "province_lord",
      sortBy: "name",
      sortOrder: "asc"
    });
    const merchants = filterAndSortCharacters(characters, states, {
      searchText: "",
      filterStateId: -1,
      filterRoleClass: "merchant",
      sortBy: "name",
      sortOrder: "asc"
    });

    expect(lords.map(r => r.c.name)).toEqual(["Count Mira"]);
    expect(merchants.map(r => r.c.name)).toEqual(["Guildmaster Ren"]);
  });

  it("combines role class filter with state filter", () => {
    const rows = filterAndSortCharacters(characters, states, {
      searchText: "",
      filterStateId: 1,
      filterRoleClass: "ruler",
      sortBy: "name",
      sortOrder: "asc"
    });

    expect(rows.map(r => r.c.name)).toEqual(["Khan Temur", "King Aldric"]);
  });

  it("returns all characters when role class filter is null", () => {
    const rows = filterAndSortCharacters(characters, states, {
      searchText: "",
      filterStateId: -1,
      filterRoleClass: null,
      sortBy: "name",
      sortOrder: "asc"
    });

    expect(rows).toHaveLength(characters.length);
  });
});
