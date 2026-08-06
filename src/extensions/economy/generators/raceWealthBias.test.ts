import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultRaces } from "../../../data/races";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import "../../characters/types";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { RACE_HOARD_SP_PER_ADULT_YEAR, raceHoardBonus } from "./raceWealthBias";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Test",
    age: 40,
    gender: "male",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {} as Character["skills"],
    personality: {} as Character["personality"],
    family: {} as Character["family"],
    appearance: 0,
    prestige: 0,
    wealth: 0,
    pastTitles: [],
    ...overrides
  };
}

describe("raceWealthBias", () => {
  const races = createDefaultRaces();
  const draconicId = races.find(race => race.key === "draconic")!.i;
  const elfId = races.find(race => race.key === "elf")!.i;
  const humanId = races.find(race => race.key === "human")!.i;

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);
    worldContext.pack = { races, characters: [] } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  it("is 0 for races without a hoarding entry, regardless of age", () => {
    const elder = makeCharacter({ race: humanId, age: 90 });
    expect(raceHoardBonus(elder)).toBe(0);
  });

  it("is 0 for a race that deliberately does not hoard (Elf), even at a long-lived age", () => {
    const elder = makeCharacter({ race: elfId, age: 700 });
    expect(raceHoardBonus(elder)).toBe(0);
  });

  it("is 0 for a hoarding race still below its own maturity age", () => {
    // Draconic maturity (fertilityStart) = 100.
    const hatchling = makeCharacter({ race: draconicId, age: 50 });
    expect(raceHoardBonus(hatchling)).toBe(0);
  });

  it("scales linearly with adult years lived for a hoarding race (Draconic)", () => {
    // Draconic maturity 100 => age 1000 is 900 adult years.
    const elder = makeCharacter({ race: draconicId, age: 1000 });
    expect(raceHoardBonus(elder)).toBeCloseTo(900 * RACE_HOARD_SP_PER_ADULT_YEAR.draconic, 5);
  });
});
