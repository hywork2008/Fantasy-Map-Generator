import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultRaces } from "../../data/races";
import { worldContext } from "../hostCore";
import type { ExtensionAPI } from "../hostTypes";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import {
  HUMAN_DEFAULT_ADULT_MAX,
  HUMAN_DEFAULT_ADULT_MIN,
  isRaceMinor,
  resolveRaceAgeProfile,
  rollDefaultAdultAge,
  scaleHumanAgeToRace,
  scaleHumanDurationToRace
} from "./raceAge";

describe("raceAge scaling", () => {
  afterEach(() => {
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      races: createDefaultRaces()
    } as never;
  });

  it("maps human adult ages onto themselves for humans", () => {
    const human = createDefaultRaces().find(r => r.key === "human")!;
    const profile = resolveRaceAgeProfile(human.i);
    expect(scaleHumanAgeToRace(16, profile)).toBe(16);
    expect(scaleHumanAgeToRace(28, profile)).toBe(28);
    expect(scaleHumanAgeToRace(65, profile)).toBe(65);
    expect(scaleHumanAgeToRace(75, profile)).toBe(75);
  });

  it("places default adult elves well past maturity, not in the human 28–65 band", () => {
    const elf = createDefaultRaces().find(r => r.key === "elf")!;
    const profile = resolveRaceAgeProfile(elf.i);
    expect(profile.maturity).toBe(100);

    const min = scaleHumanAgeToRace(HUMAN_DEFAULT_ADULT_MIN, profile);
    const max = scaleHumanAgeToRace(HUMAN_DEFAULT_ADULT_MAX, profile);
    expect(min).toBeGreaterThanOrEqual(profile.maturity);
    expect(min).toBeGreaterThan(100);
    // Human 28–65 must not stay ~28–65 for a 750-year species.
    expect(min).toBeGreaterThan(150);
    expect(max).toBeGreaterThan(400);
    expect(max).toBeLessThanOrEqual(profile.lifespan);

    for (let i = 0; i < 40; i++) {
      const age = rollDefaultAdultAge(elf.i);
      expect(age).toBeGreaterThanOrEqual(min);
      expect(age).toBeLessThanOrEqual(max);
      expect(isRaceMinor(age, elf.i)).toBe(false);
    }
  });

  it("scales parent–child gaps with adult lifespan, not 1:1 calendar years", () => {
    const elf = createDefaultRaces().find(r => r.key === "elf")!;
    const profile = resolveRaceAgeProfile(elf.i);
    const gap = scaleHumanDurationToRace(20, profile);
    expect(gap).toBeGreaterThan(100);
    expect(gap).toBeLessThan(300);
  });

  it("treats chronological 40-year-old elves as minors", () => {
    const elf = createDefaultRaces().find(r => r.key === "elf")!;
    expect(isRaceMinor(40, elf.i)).toBe(true);
    expect(isRaceMinor(120, elf.i)).toBe(false);
  });
});
