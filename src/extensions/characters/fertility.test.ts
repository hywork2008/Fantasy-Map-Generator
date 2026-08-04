import { describe, expect, it } from "vitest";
import { createDefaultRaces, DEFAULT_RACE_FERTILITY, getRaceFertility } from "../../data/races";
import {
  EPISODIC_PAIRING_AVAILABILITY,
  expectedChildrenEpisodic,
  expectedChildrenFromFertility,
  lifetimeExpectedBirths,
  rearingSpanYears,
  sampleLitter
} from "./fertility";

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

  it("calibrates long-lived races near replacement lifetime births (R_max)", () => {
    const races = createDefaultRaces();
    const byKey = (key: string) => getRaceFertility(races, races.find(r => r.key === key)!.i);

    const elfR = lifetimeExpectedBirths(byKey("elf"));
    const darkElfR = lifetimeExpectedBirths(byKey("dark_elf"));
    const dwarfR = lifetimeExpectedBirths(byKey("dwarf"));
    const giantR = lifetimeExpectedBirths(byKey("giant"));
    const draconicR = lifetimeExpectedBirths(byKey("draconic"));
    const humanR = lifetimeExpectedBirths(byKey("human"));
    const goblinR = lifetimeExpectedBirths(byKey("goblin"));

    // Near-immortal / long-lived: scarce completed families, not human TFR stretched thin.
    expect(elfR).toBeGreaterThanOrEqual(2);
    expect(elfR).toBeLessThanOrEqual(3.5);
    expect(darkElfR).toBeGreaterThan(elfR);
    expect(darkElfR).toBeLessThanOrEqual(4);
    expect(dwarfR).toBeGreaterThanOrEqual(3);
    expect(dwarfR).toBeLessThanOrEqual(5.5);
    expect(giantR).toBeGreaterThanOrEqual(2);
    expect(giantR).toBeLessThanOrEqual(4);
    expect(draconicR).toBeGreaterThanOrEqual(2);
    expect(draconicR).toBeLessThanOrEqual(3.5);

    // Short-lived: higher lifetime births (boom or pre-modern TFR).
    expect(humanR).toBeGreaterThan(6);
    expect(goblinR).toBeGreaterThan(humanR * 2);
  });

  it("samples litter within [1, litterMax]", () => {
    const fert = { ...DEFAULT_RACE_FERTILITY, litterMean: 2.5, litterMax: 5 };
    for (let i = 0; i < 40; i++) {
      const n = sampleLitter(fert);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("applies availability discount for episodic long-lived child expectation", () => {
    const races = createDefaultRaces();
    const elf = getRaceFertility(races, races.find(r => r.key === "elf")!.i);
    const fullWindow = expectedChildrenFromFertility(elf.fertilityEnd - elf.fertilityStart, 1, elf);
    const episodic = expectedChildrenEpisodic(elf.fertilityEnd, elf.fertilityStart, elf);
    expect(episodic).toBeCloseTo(fullWindow * EPISODIC_PAIRING_AVAILABILITY, 5);
    expect(rearingSpanYears(elf)).toBeGreaterThan(20);
  });
});
