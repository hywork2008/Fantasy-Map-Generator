import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import { usePlayerCharacterState } from "../../characters/store/playerCharacterState";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, MilitaryRegiment, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { pruneDeadCharactersAnnual } from "./characterPruning";

function makeCharacter(overrides: Record<string, unknown>) {
  return { i: 0, age: 40, dead: false, titles: [], pastTitles: [], ...overrides } as never;
}

function makeRegiment(overrides: Partial<MilitaryRegiment>): MilitaryRegiment {
  return {
    i: 0,
    t: 0,
    name: "Regiment",
    a: 100,
    s: 0,
    cell: 0,
    x: 0,
    y: 0,
    bx: 0,
    by: 0,
    u: { infantry: 100 },
    n: 0,
    type: "melee",
    state: 1,
    ...overrides
  };
}

describe("pruneDeadCharactersAnnual", () => {
  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.seed = "123456";
    worldContext.options = { year: 1000 } as never;
  });

  afterEach(() => {
    clearNobilityContext();
    clearCharactersContext();
    usePlayerCharacterState.getState().clear();
  });

  it("does nothing when there are no states", () => {
    worldContext.pack = {
      characters: [makeCharacter({ i: 1, dead: true, deathYear: 900 })],
      states: []
    } as unknown as PackedGraph;

    expect(pruneDeadCharactersAnnual()).toBe(0);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("removes a long-dead character that holds no office and isn't the player", () => {
    worldContext.pack = {
      characters: [makeCharacter({ i: 1, dead: true, deathYear: 900 })],
      states: [{ i: 1, name: "Kingdom", culture: 0, capital: 0, military: [] }]
    } as unknown as PackedGraph;

    expect(pruneDeadCharactersAnnual()).toBe(1);
    expect(worldContext.pack.characters).toHaveLength(0);
  });

  it("never prunes a state's current ruler, even long dead", () => {
    worldContext.pack = {
      characters: [makeCharacter({ i: 1, dead: true, deathYear: 900 })],
      states: [{ i: 1, name: "Kingdom", culture: 0, capital: 0, rulerId: 1, military: [] }]
    } as unknown as PackedGraph;

    expect(pruneDeadCharactersAnnual()).toBe(0);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("never prunes a regiment's current commander, even long dead", () => {
    const guard = makeRegiment({ i: 0, commanderId: 1, state: 1 });
    worldContext.pack = {
      characters: [makeCharacter({ i: 1, dead: true, deathYear: 900 })],
      states: [{ i: 1, name: "Kingdom", culture: 0, capital: 0, military: [guard] }]
    } as unknown as PackedGraph;

    expect(pruneDeadCharactersAnnual()).toBe(0);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("never prunes the player's own character, even long dead", () => {
    worldContext.pack = {
      characters: [makeCharacter({ i: 1, dead: true, deathYear: 900 })],
      states: [{ i: 1, name: "Kingdom", culture: 0, capital: 0, military: [] }]
    } as unknown as PackedGraph;
    usePlayerCharacterState.getState().setPlayerCharacterId(1);

    expect(pruneDeadCharactersAnnual()).toBe(0);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("prunes freed-up ids once they stop being referenced (e.g. a new ruler took over)", () => {
    worldContext.pack = {
      characters: [makeCharacter({ i: 1, dead: true, deathYear: 900 }), makeCharacter({ i: 2, dead: false })],
      states: [{ i: 1, name: "Kingdom", culture: 0, capital: 0, rulerId: 2, military: [] }]
    } as unknown as PackedGraph;

    const removed = pruneDeadCharactersAnnual();

    expect(removed).toBe(1);
    expect(worldContext.pack.characters.map(c => c.i)).toEqual([2]);
  });
});
