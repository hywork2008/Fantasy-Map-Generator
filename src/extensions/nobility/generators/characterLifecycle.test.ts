import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { chooseIdleHawkMischief } from "../../characters/idleHawkMischief";
import "../../characters/types";
import { createDefaultRaces, raceIdByKey } from "../../../data/races";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { Characters } from "./characterLifecycle";

const ZERO_SKILLS = {
  artistry: 1,
  diplomacy: 1,
  engineering: 1,
  geography: 1,
  intrigue: 1,
  learning: 1,
  martial: 1,
  prowess: 1,
  stewardship: 1
};

const ZERO_PERSONALITY = {
  boldness: 1,
  compassion: 1,
  greed: 1,
  honor: 1,
  rationality: 1,
  sociability: 1,
  vengefulness: 1,
  zeal: 1,
  energy: 1,
  piety: 1,
  guile: 1,
  confidence: 1
};

function stressedOfficer(overrides: Partial<Character> & Pick<Character, "i" | "name">): Character {
  return {
    age: 40,
    gender: "male",
    culture: 0,
    titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1, startYear: 990 }],
    affinities: {},
    marriages: [],
    state: 1,
    skills: { ...ZERO_SKILLS },
    personality: { ...ZERO_PERSONALITY },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 50,
    wealth: 0,
    pastTitles: [],
    ...overrides
  };
}

describe("Characters (nobility characterLifecycle)", () => {
  afterEach(() => {
    clearNobilityContext();
    clearCharactersContext();
  });

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initNobilityContext(api);
    initCharactersContext(api);
    worldContext.seed = "123456";
    worldContext.nameBases = [{ i: 0, name: "Test", min: 3, max: 10, d: "", m: 0, b: "Anna,Bob,Carla,David,Erin" }];
    worldContext.pack = {
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom of Foo", culture: 0, form: "Monarchy", formName: "Kingdom" },
        { i: 2, name: "Republic of Bar", culture: 0, form: "Republic", formName: "Republic" },
        { i: 3, name: "Removed state", culture: 0, form: "Monarchy", formName: "Kingdom", removed: true }
      ]
    } as unknown as PackedGraph;
  });

  it("generates one ruler and the central offices for every non-neutral, non-removed state", () => {
    Characters.generate({ randomSeed: 1 });

    // 2 eligible states * (1 ruler + 5 offices)
    expect(worldContext.pack.characters).toHaveLength(12);

    const kingdomCharacters = worldContext.pack.characters.filter(c => c.titles[0].entityId === 1);
    expect(kingdomCharacters).toHaveLength(6);

    const ruler = kingdomCharacters.find(c => c.titles[0].landed);
    expect(ruler).toBeDefined();
    expect(["King", "Queen"]).toContain(ruler!.titles[0].title);

    const offices = kingdomCharacters.filter(c => !c.titles[0].landed).map(c => c.titles[0].title);
    expect(offices.sort()).toEqual(["Chancellor", "Marshal", "Steward", "Spymaster", "Court Chaplain"].sort());
  });

  it("resolves the ruler title from the state's formName", () => {
    Characters.generate({ randomSeed: 2 });

    const republicRuler = worldContext.pack.characters.find(c => c.titles[0].entityId === 2 && c.titles[0].landed);
    expect(republicRuler!.titles[0].title).toBe("President");
  });

  it("generates only female characters for states whose culture uses Amazones race", () => {
    worldContext.pack.races = [
      { i: 0, key: "unknown", name: "Unknown" },
      { i: 1, key: "human", name: "Human" },
      { i: 2, key: "amazones", name: "Amazones", characterGender: "female_only" }
    ] as never;
    worldContext.pack.cultures = [
      { i: 0, name: "Wildlands", base: 0, shield: "round", race: 0 },
      // Culture name is independent; race drives female_only policy
      { i: 1, name: "Thermodons", base: 0, shield: "boeotian", race: 2, monoRacial: true }
    ] as never;
    worldContext.pack.states = [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Queendom of Thermodons", culture: 1, form: "Monarchy", formName: "Kingdom", capital: 0 }
    ] as never;

    Characters.generate({ randomSeed: 7 });

    const stateChars = worldContext.pack.characters.filter(c => c.titles.some(t => t.entityId === 1));
    expect(stateChars.length).toBeGreaterThan(0);
    expect(stateChars.every(c => c.gender === "female")).toBe(true);
    expect(stateChars.every(c => c.race === 2)).toBe(true);

    const ruler = stateChars.find(c => c.titles.some(t => t.landed));
    expect(ruler?.titles[0].title).toBe("Queen");
  });

  it("sets state.rulerId to the ruler's character id and skips removed/neutral states", () => {
    Characters.generate({ randomSeed: 3 });

    const kingdom = worldContext.pack.states.find(s => s.i === 1)!;
    const ruler = worldContext.pack.characters.find(c => c.i === kingdom.rulerId);
    expect(ruler).toBeDefined();
    expect(ruler!.titles[0].entityId).toBe(1);

    expect(worldContext.pack.states.find(s => s.i === 0)!.rulerId).toBeUndefined();
    expect(worldContext.pack.states.find(s => s.i === 3)!.rulerId).toBeUndefined();
  });

  it("clears characters and rulerId pointers", () => {
    Characters.generate({ randomSeed: 4 });
    Characters.clear();

    expect(worldContext.pack.characters).toHaveLength(0);
    expect(worldContext.pack.states.every(s => s.rulerId === undefined)).toBe(true);
  });

  it("preserves non-political characters when regenerating nobility characters", () => {
    worldContext.pack.characters = [
      {
        i: 99,
        name: "Market Keeper",
        age: 40,
        gender: "male",
        culture: 0,
        titles: [],
        affinities: {},
        marriages: [],
        state: 1,
        birthStateId: 1,
        nationalityStateId: 1,
        roles: [
          { source: "economy", kind: "marketManager", entityType: "market", entityId: 1, label: "Market Manager" }
        ],
        skills: {
          artistry: 1,
          diplomacy: 1,
          engineering: 1,
          geography: 1,
          intrigue: 1,
          learning: 1,
          martial: 1,
          prowess: 1,
          stewardship: 1
        },
        personality: {
          boldness: 1,
          compassion: 1,
          greed: 1,
          honor: 1,
          rationality: 1,
          sociability: 1,
          vengefulness: 1,
          zeal: 1,
          energy: 1,
          piety: 1,
          guile: 1,
          confidence: 1
        },
        family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
        appearance: 1,
        prestige: 1,
        pastTitles: []
      }
    ];

    Characters.generate({ randomSeed: 5 });

    expect(worldContext.pack.characters.some(c => c.i === 99 && c.roles?.[0]?.kind === "marketManager")).toBe(true);
    expect(worldContext.pack.characters).toHaveLength(13);
  });

  it("records a dove marshal in a warlike state as stress, even if elf", () => {
    const races = createDefaultRaces();
    worldContext.pack.races = races;
    worldContext.pack.burgs = [{ i: 1, name: "Foo", state: 1, cell: 0, x: 0, y: 0 }];
    worldContext.pack.states[1]!.diplomacy = ["Enemy", "Enemy", "Enemy", "Enemy"];
    worldContext.pack.states[1]!.rulerId = 1;
    worldContext.pack.characters = [
      stressedOfficer({
        i: 1,
        name: "King",
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
        personality: { ...ZERO_PERSONALITY, boldness: 80 }
      }),
      stressedOfficer({ i: 2, name: "Human Marshal", race: raceIdByKey(races, "human") }),
      stressedOfficer({ i: 3, name: "Elf Marshal", race: raceIdByKey(races, "elf") }),
      stressedOfficer({
        i: 4,
        name: "Elf Chancellor",
        race: raceIdByKey(races, "elf"),
        titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1, startYear: 990 }]
      })
    ];

    Characters.processResignationsAndSuccessions(10);

    const reasonOf = (name: string) => worldContext.pack.characters.find(c => c.name === name)?.pastTitles[0]?.reason;

    expect(reasonOf("Human Marshal")).toBe("Resigned (Stress)");
    expect(reasonOf("Elf Marshal")).toBe("Resigned (Stress)");
    expect(reasonOf("Elf Chancellor")).toBe("Resigned (Boredom)");
    expect(worldContext.pack.characters.find(c => c.name === "King")?.titles[0]?.title).toBe("King");
  });

  it("records a hawk marshal in a peaceful state as boredom, even if human", () => {
    const races = createDefaultRaces();
    worldContext.pack.races = races;
    worldContext.pack.burgs = [{ i: 1, name: "Foo", state: 1, cell: 0, x: 0, y: 0 }];
    worldContext.pack.states[1]!.diplomacy = [];
    worldContext.pack.states[1]!.rulerId = 1;
    worldContext.pack.characters = [
      stressedOfficer({
        i: 1,
        name: "King",
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
        personality: { ...ZERO_PERSONALITY, boldness: 20 }
      }),
      stressedOfficer({
        i: 2,
        name: "Human Marshal",
        race: raceIdByKey(races, "human"),
        personality: { ...ZERO_PERSONALITY, boldness: 80 },
        skills: { ...ZERO_SKILLS, martial: 80 }
      }),
      stressedOfficer({
        i: 3,
        name: "Wolf Marshal",
        race: raceIdByKey(races, "beastfolk"),
        raceAppearance: { kind: "beastfolk", animal: "wolf", furryScale: 6 },
        personality: { ...ZERO_PERSONALITY, boldness: 85 },
        skills: { ...ZERO_SKILLS, martial: 80 }
      })
    ];

    Characters.processResignationsAndSuccessions(10);

    const reasonOf = (name: string) => worldContext.pack.characters.find(c => c.name === name)?.pastTitles[0]?.reason;

    expect(reasonOf("Human Marshal")).toBe("Resigned (Boredom)");
    expect(reasonOf("Wolf Marshal")).toBe("Resigned (Boredom)");
  });

  it("lets a disloyal ambitious hawk marshal coup a peaceful court instead of resigning", () => {
    const races = createDefaultRaces();
    worldContext.pack.races = races;
    worldContext.pack.burgs = [{ i: 1, name: "Foo", state: 1, cell: 0, x: 0, y: 0 }];
    worldContext.pack.states[1]!.diplomacy = [];
    worldContext.pack.states[1]!.rulerId = 1;
    worldContext.pack.characters = [
      stressedOfficer({
        i: 1,
        name: "King",
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1, startYear: 980 }],
        personality: { ...ZERO_PERSONALITY, boldness: 20, honor: 70 }
      }),
      stressedOfficer({
        i: 2,
        name: "Usurper",
        race: raceIdByKey(races, "human"),
        personality: { ...ZERO_PERSONALITY, boldness: 85, greed: 90, energy: 80, honor: 15, guile: 25 },
        skills: { ...ZERO_SKILLS, martial: 80 },
        solidarity: { 1: -60 }
      })
    ];

    Characters.processResignationsAndSuccessions(10);

    const king = worldContext.pack.characters.find(c => c.name === "King")!;
    const usurper = worldContext.pack.characters.find(c => c.name === "Usurper")!;
    expect(king.titles.some(t => t.landed)).toBe(false);
    expect(king.pastTitles.some(t => t.reason === "Deposed by military coup")).toBe(true);
    expect(usurper.titles.some(t => t.landed && t.title === "King")).toBe(true);
    expect(usurper.pastTitles.some(t => t.reason === "Seized the throne")).toBe(true);
    expect(worldContext.pack.states[1]!.rulerId).toBe(2);
  });

  it("lets a scheming hawk marshal manufacture a war instead of resigning", () => {
    const races = createDefaultRaces();
    worldContext.options.conflictAutonomy = "autonomous";
    worldContext.pack.races = races;
    worldContext.pack.burgs = [{ i: 1, name: "Foo", state: 1, cell: 0, x: 0, y: 0 }];
    worldContext.pack.states[1]!.diplomacy = [undefined, "x", "Neutral"] as never;
    worldContext.pack.states[1]!.neighbors = [2];
    worldContext.pack.states[2]!.diplomacy = [undefined, "Neutral", "x"] as never;
    worldContext.pack.states[1]!.rulerId = 1;
    worldContext.pack.characters = [
      stressedOfficer({
        i: 1,
        name: "King",
        titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }],
        personality: { ...ZERO_PERSONALITY, boldness: 20, honor: 70 }
      }),
      stressedOfficer({
        i: 2,
        name: "Schemer",
        race: raceIdByKey(races, "human"),
        personality: { ...ZERO_PERSONALITY, boldness: 80, greed: 90, energy: 80, honor: 15, guile: 80 },
        skills: { ...ZERO_SKILLS, martial: 80, intrigue: 70 },
        solidarity: { 1: -50 }
      })
    ];

    const king = worldContext.pack.characters[0]!;
    const schemerBefore = worldContext.pack.characters[1]!;
    expect(chooseIdleHawkMischief(schemerBefore, king, 1)).toBe("provoke-war");

    Characters.processResignationsAndSuccessions(10);

    const schemer = worldContext.pack.characters.find(c => c.name === "Schemer")!;
    expect(worldContext.pack.states[1]!.diplomacy?.[2]).toBe("Enemy");
    expect(worldContext.pack.states[2]!.diplomacy?.[1]).toBe("Enemy");
    expect(schemer.titles.some(t => t.landed)).toBe(false);
    expect(schemer.titles.some(t => t.entityType === "state")).toBe(true);
    expect(schemer.pastTitles.some(t => t.reason === "Resigned (Boredom)")).toBe(false);
    expect(worldContext.pack.states[1]!.rulerId).toBe(1);
  });
});
