import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import { pruneDeadCharacters } from "./characterPruning";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import "./types";

function makeCharacter(overrides: Record<string, unknown>) {
  return {
    i: 0,
    age: 40,
    dead: false,
    titles: [],
    pastTitles: [],
    ...overrides
  } as never;
}

describe("pruneDeadCharacters", () => {
  afterEach(() => {
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {} as unknown as PackedGraph;
    worldContext.options = { year: 1000 } as never;
  });

  it("does nothing when there are no characters", () => {
    worldContext.pack.characters = [];
    expect(pruneDeadCharacters()).toBe(0);
  });

  it("leaves living characters untouched", () => {
    worldContext.pack.characters = [makeCharacter({ i: 0, dead: false })];

    expect(pruneDeadCharacters()).toBe(0);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("removes a dead character once past the grace period with no lingering references", () => {
    worldContext.pack.characters = [makeCharacter({ i: 1, dead: true, deathYear: 990 })];

    const removed = pruneDeadCharacters({ graceYears: 5 });

    expect(removed).toBe(1);
    expect(worldContext.pack.characters).toHaveLength(0);
  });

  it("keeps a recently dead character inside the grace period", () => {
    worldContext.pack.characters = [makeCharacter({ i: 1, dead: true, deathYear: 999 })];

    const removed = pruneDeadCharacters({ graceYears: 5 });

    expect(removed).toBe(0);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("keeps a dead character with no recorded deathYear rather than guessing", () => {
    worldContext.pack.characters = [makeCharacter({ i: 1, dead: true, deathYear: undefined })];

    expect(pruneDeadCharacters({ graceYears: 0 })).toBe(0);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("never removes an id present in protectedIds, no matter how long dead", () => {
    worldContext.pack.characters = [makeCharacter({ i: 7, dead: true, deathYear: 900 })];

    const removed = pruneDeadCharacters({ graceYears: 1, protectedIds: new Set([7]) });

    expect(removed).toBe(0);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("keeps a dead character who still holds an open title (death not fully processed yet)", () => {
    worldContext.pack.characters = [
      makeCharacter({
        i: 1,
        dead: true,
        deathYear: 900,
        titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }]
      })
    ];

    expect(pruneDeadCharacters({ graceYears: 1 })).toBe(0);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("keeps a dead character who still holds an open (unclosed) non-political role", () => {
    worldContext.pack.characters = [
      makeCharacter({
        i: 1,
        dead: true,
        deathYear: 900,
        roles: [{ source: "economy", kind: "guildMaster", entityType: "burg", entityId: 3, label: "Guildmaster" }]
      })
    ];

    expect(pruneDeadCharacters({ graceYears: 1 })).toBe(0);
    expect(worldContext.pack.characters).toHaveLength(1);
  });

  it("removes a dead character whose roles are all closed (endYear set)", () => {
    worldContext.pack.characters = [
      makeCharacter({
        i: 1,
        dead: true,
        deathYear: 900,
        roles: [
          {
            source: "economy",
            kind: "guildMaster",
            entityType: "burg",
            entityId: 3,
            label: "Guildmaster",
            endYear: 901
          }
        ]
      })
    ];

    expect(pruneDeadCharacters({ graceYears: 1 })).toBe(1);
    expect(worldContext.pack.characters).toHaveLength(0);
  });

  it("prunes only the eligible characters out of a mixed roster", () => {
    worldContext.pack.characters = [
      makeCharacter({ i: 0, dead: false }), // alive
      makeCharacter({ i: 1, dead: true, deathYear: 900 }), // long dead, eligible
      makeCharacter({ i: 2, dead: true, deathYear: 1000 }), // died this year, in grace period
      makeCharacter({ i: 3, dead: true, deathYear: 900 }) // long dead, but protected
    ];

    const removed = pruneDeadCharacters({ graceYears: 1, protectedIds: new Set([3]) });

    expect(removed).toBe(1);
    expect(worldContext.pack.characters.map(c => c.i)).toEqual([0, 2, 3]);
  });
});
