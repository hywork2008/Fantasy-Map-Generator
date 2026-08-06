import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import { advanceCharacterAging } from "./advanceAge";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import "./types";

describe("advanceCharacterAging", () => {
  afterEach(() => {
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {} as unknown as PackedGraph;
  });

  it("does nothing for a non-positive deltaYears", () => {
    worldContext.pack.characters = [
      {
        i: 0,
        age: 30,
        appearance: 50,
        skills: { prowess: 50 } as never,
        titles: []
      } as never
    ];
    const before = worldContext.pack.characters.map(c => c.age);

    advanceCharacterAging(0);

    expect(worldContext.pack.characters.map(c => c.age)).toEqual(before);
  });

  it("ages every non-dead character by deltaYears", () => {
    worldContext.pack.characters = [
      {
        i: 0,
        age: 30,
        dead: false,
        appearance: 50,
        skills: { prowess: 50 } as never,
        personality: { confidence: 50 } as never,
        titles: [],
        pastTitles: []
      } as never,
      {
        i: 1,
        age: 20,
        dead: true,
        appearance: 60,
        skills: { prowess: 60 } as never,
        personality: { confidence: 50 } as never,
        titles: [],
        pastTitles: []
      } as never
    ];

    advanceCharacterAging(3);

    const [alive, dead] = worldContext.pack.characters;
    expect(alive.age).toBe(33);
    expect(dead.age).toBe(20); // dead characters are skipped entirely
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

    advanceCharacterAging(3); // 34 -> 37, 2 years past the age-35 threshold

    const character = worldContext.pack.characters[0];
    expect(character.age).toBe(37);
    expect(character.appearance).toBe(79); // 80 - floor(2 * 0.55 vitality rate)
    expect(character.skills.prowess).toBe(76); // civilian: 80 - floor(2 * 2)
  });

  it("declines prowess at half rate for military careers", () => {
    worldContext.pack.characters = [
      {
        i: 0,
        age: 34,
        appearance: 80,
        skills: { prowess: 80 } as never,
        titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }]
      } as never
    ];

    advanceCharacterAging(3); // 34 -> 37, 2 years past threshold at rate 1

    const character = worldContext.pack.characters[0];
    expect(character.age).toBe(37);
    expect(character.appearance).toBe(79); // appearance is unchanged by military status
    expect(character.skills.prowess).toBe(78); // military: 80 - floor(2 * 1)
  });

  it("does not decline appearance/prowess while still under the age-35 threshold", () => {
    worldContext.pack.characters = [
      {
        i: 0,
        age: 28, // past the random skill-growth cap (25) after aging, so the test stays deterministic
        appearance: 50,
        skills: { prowess: 50 } as never,
        personality: { confidence: 50 } as never,
        titles: []
      } as never
    ];

    advanceCharacterAging(5); // 28 -> 33, still under 35

    const character = worldContext.pack.characters[0];
    expect(character.appearance).toBe(50);
    expect(character.skills.prowess).toBe(50);
  });

  it("never declines appearance/prowess below 1", () => {
    worldContext.pack.characters = [
      { i: 0, age: 90, appearance: 2, skills: { prowess: 2 } as never, titles: [] } as never
    ];

    advanceCharacterAging(10);

    const character = worldContext.pack.characters[0];
    expect(character.appearance).toBe(1);
    expect(character.skills.prowess).toBe(1);
  });

  it("does nothing when there are no characters", () => {
    worldContext.pack.characters = [];
    expect(() => advanceCharacterAging(5)).not.toThrow();
  });

  it("a character with a critical affliction dies more often than an unafflicted twin (statistical, characterHealth.ts integration)", () => {
    const trials = 200;
    let sickDeaths = 0;
    let healthyDeaths = 0;

    const makeTwin = (i: number, afflicted: boolean) =>
      ({
        i,
        age: 30,
        dead: false,
        appearance: 50,
        skills: { prowess: 50 } as never,
        personality: { confidence: 50, sociability: 50, boldness: 50 } as never,
        titles: [],
        pastTitles: [],
        state: 1,
        wealth: 0,
        health: 100,
        affliction: afflicted ? { kind: "plague" as const, severity: "critical" as const, sinceYear: 1 } : undefined
      }) as never;

    for (let i = 0; i < trials; i++) {
      const sick = makeTwin(0, true);
      const healthy = makeTwin(1, false);
      worldContext.pack.characters = [sick, healthy];

      advanceCharacterAging(1);

      if (sick.dead) sickDeaths++;
      if (healthy.dead) healthyDeaths++;
    }

    expect(sickDeaths).toBeGreaterThan(healthyDeaths);
  });
});
