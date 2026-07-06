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

    charactersModule = new CharactersModule();
  });

  it("generates one ruler and the central offices for every non-neutral, non-removed state", () => {
    charactersModule.generate({ randomSeed: 1 });

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

  describe("advanceAge", () => {
    it("does nothing for a non-positive deltaYears", () => {
      charactersModule.generate({ randomSeed: 5 });
      const before = worldContext.pack.characters.map(c => ({ ...c }));

      charactersModule.advanceAge(0);

      expect(worldContext.pack.characters.map(c => c.age)).toEqual(before.map(c => c.age));
    });

    it("ages every character by deltaYears", () => {
      charactersModule.generate({ randomSeed: 6 });
      const before = worldContext.pack.characters.map(c => c.age);

      charactersModule.advanceAge(3);

      const after = worldContext.pack.characters;
      for (let i = 0; i < before.length; i++) {
        const c = after[i];
        if (!c.dead) {
          expect(c.age).toBe(before[i] + 3);
        }
      }
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

      charactersModule.advanceAge(3); // 34 -> 37, 2 years past the age-35 threshold

      const character = worldContext.pack.characters[0];
      expect(character.age).toBe(37);
      expect(character.appearance).toBe(77); // 80 - floor(2 * 1.5)
      expect(character.skills.prowess).toBe(76); // 80 - floor(2 * 2)
    });

    it("does not decline appearance/prowess while still under the age-35 threshold", () => {
      worldContext.pack.characters = [
        { i: 0, age: 20, appearance: 50, skills: { prowess: 50 } as never, titles: [] } as never
      ];

      charactersModule.advanceAge(5); // 20 -> 25, still under 35

      const character = worldContext.pack.characters[0];
      expect(character.appearance).toBe(50);
      expect(character.skills.prowess).toBe(50);
    });

    it("never declines appearance/prowess below 1", () => {
      worldContext.pack.characters = [
        { i: 0, age: 90, appearance: 2, skills: { prowess: 2 } as never, titles: [] } as never
      ];

      charactersModule.advanceAge(10);

      const character = worldContext.pack.characters[0];
      expect(character.appearance).toBe(1);
      expect(character.skills.prowess).toBe(1);
    });

    it("does nothing when there are no characters", () => {
      worldContext.pack.characters = [];
      expect(() => charactersModule.advanceAge(5)).not.toThrow();
    });
  });
});
