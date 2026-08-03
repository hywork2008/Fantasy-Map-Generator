import { describe, expect, it } from "vitest";
import { createDefaultRaces, DEFAULT_RACE_FERTILITY, getRaceFertility } from "../../data/races";
import { expectedChildrenFromFertility, sampleLitter } from "./fertility";

describe("race fertility", () => {
  it("gives goblins more expected children than elves over the same married years", () => {
    const races = createDefaultRaces();
    const elf = getRaceFertility(races, races.find(r => r.key === "elf")!.i);
    const goblin = getRaceFertility(races, races.find(r => r.key === "goblin")!.i);
    const years = 30;
    const elfKids = expectedChildrenFromFertility(years, 1, elf);
    const goblinKids = expectedChildrenFromFertility(years, 1, goblin);
    expect(goblinKids).toBeGreaterThan(elfKids * 2);
  });

  it("samples litter within [1, litterMax]", () => {
    const fert = { ...DEFAULT_RACE_FERTILITY, litterMean: 2.5, litterMax: 5 };
    for (let i = 0; i < 40; i++) {
      const n = sampleLitter(fert);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});
