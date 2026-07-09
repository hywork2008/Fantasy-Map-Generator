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
});
