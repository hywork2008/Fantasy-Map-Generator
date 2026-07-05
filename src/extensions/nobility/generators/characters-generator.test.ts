import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { CharactersModule } from "./characters-generator";

describe("CharactersModule", () => {
  let charactersModule: CharactersModule;

  afterEach(() => {
    clearNobilityContext();
  });

  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.seed = "123456";
    worldContext.nameBases = [{ i: 0, name: "Test", min: 3, max: 10, d: "", b: "Anna,Bob,Carla,David,Erin" }];
    worldContext.pack = {
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Kingdom of Foo", culture: 0, form: "Monarchy", formName: "Kingdom" },
        { i: 2, name: "Republic of Bar", culture: 0, form: "Republic", formName: "Republic" },
        { i: 3, name: "Removed state", culture: 0, form: "Monarchy", formName: "Kingdom", removed: true }
      ]
    } as unknown as PackedGraph;

    charactersModule = new CharactersModule();
  });

  it("generates one ruler and the central offices for every non-neutral, non-removed state", () => {
    charactersModule.generate({ randomSeed: 1 });

    // 2 eligible states * (1 ruler + 3 offices)
    expect(worldContext.pack.characters).toHaveLength(8);

    const kingdomCharacters = worldContext.pack.characters.filter(c => c.titles[0].entityId === 1);
    expect(kingdomCharacters).toHaveLength(4);

    const ruler = kingdomCharacters.find(c => c.titles[0].landed);
    expect(ruler).toBeDefined();
    expect(["King", "Queen"]).toContain(ruler!.titles[0].title);

    const offices = kingdomCharacters.filter(c => !c.titles[0].landed).map(c => c.titles[0].title);
    expect(offices.sort()).toEqual(["Minister of War", "Minister of the Treasury", "Prime Minister"].sort());
  });

  it("resolves the ruler title from the state's formName", () => {
    charactersModule.generate({ randomSeed: 2 });

    const republicRuler = worldContext.pack.characters.find(c => c.titles[0].entityId === 2 && c.titles[0].landed);
    expect(republicRuler!.titles[0].title).toBe("President");
  });

  it("sets state.rulerId to the ruler's character id and skips removed/neutral states", () => {
    charactersModule.generate({ randomSeed: 3 });

    const kingdom = worldContext.pack.states.find(s => s.i === 1)!;
    const ruler = worldContext.pack.characters.find(c => c.i === kingdom.rulerId);
    expect(ruler).toBeDefined();
    expect(ruler!.titles[0].entityId).toBe(1);

    expect(worldContext.pack.states.find(s => s.i === 0)!.rulerId).toBeUndefined();
    expect(worldContext.pack.states.find(s => s.i === 3)!.rulerId).toBeUndefined();
  });

  it("clears characters and rulerId pointers", () => {
    charactersModule.generate({ randomSeed: 4 });
    charactersModule.clear();

    expect(worldContext.pack.characters).toHaveLength(0);
    expect(worldContext.pack.states.every(s => s.rulerId === undefined)).toBe(true);
  });
});
