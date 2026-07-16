import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import "../../characters/types";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { Characters } from "./characterLifecycle";

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
});
