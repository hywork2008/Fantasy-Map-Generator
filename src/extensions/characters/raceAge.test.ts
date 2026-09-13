import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultRaces } from "../../data/races";
import { worldContext } from "../hostCore";
import type { ExtensionAPI } from "../hostTypes";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import {
  HUMAN_DEFAULT_ADULT_MAX,
  HUMAN_DEFAULT_ADULT_MIN,
  isRaceMinor,
  isStateCloseToLivingRealm,
  resolveRaceAgeProfile,
  rollDefaultAdultAge,
  rollUndeadAge,
  scaleHumanAgeToRace,
  scaleHumanDurationToRace,
  scaleRaceDurationToHuman
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
    expect(scaleRaceDurationToHuman(gap, profile)).toBeCloseTo(20, 0);
  });

  it("treats chronological 40-year-old elves as minors", () => {
    const elf = createDefaultRaces().find(r => r.key === "elf")!;
    expect(isRaceMinor(40, elf.i)).toBe(true);
    expect(isRaceMinor(120, elf.i)).toBe(false);
  });

  describe("rollUndeadAge", () => {
    const human = createDefaultRaces().find(r => r.key === "human")!;

    it("rolls living-equivalent adult ages when close to living realms", () => {
      for (let i = 0; i < 30; i++) {
        const zombieAge = rollUndeadAge({
          raceKey: "zombie",
          originalRaceId: human.i,
          isCloseToLivingState: true
        });
        expect(zombieAge).toBeGreaterThanOrEqual(20);
        expect(zombieAge).toBeLessThanOrEqual(55);

        const skeletonAge = rollUndeadAge({
          raceKey: "skeleton",
          originalRaceId: human.i,
          isCloseToLivingState: true
        });
        expect(skeletonAge).toBeGreaterThanOrEqual(25);
        expect(skeletonAge).toBeLessThanOrEqual(70);
      }
    });

    it("rolls ancient ages strictly younger than Lich master when distant from living realms", () => {
      const lichMasterAge = 3000;
      for (let i = 0; i < 30; i++) {
        const zombieAge = rollUndeadAge({
          raceKey: "zombie",
          originalRaceId: human.i,
          isCloseToLivingState: false,
          lichAge: lichMasterAge
        });
        expect(zombieAge).toBeGreaterThanOrEqual(40);
        expect(zombieAge).toBeLessThan(lichMasterAge);
        expect(zombieAge).toBeLessThanOrEqual(Math.floor(lichMasterAge * 0.75));

        const skeletonAge = rollUndeadAge({
          raceKey: "skeleton",
          originalRaceId: human.i,
          isCloseToLivingState: false,
          lichAge: lichMasterAge
        });
        expect(skeletonAge).toBeGreaterThanOrEqual(80);
        expect(skeletonAge).toBeLessThan(lichMasterAge);
        expect(skeletonAge).toBeLessThanOrEqual(Math.floor(lichMasterAge * 0.95));
      }
    });
  });

  describe("isStateCloseToLivingRealm", () => {
    it("returns true when bordering a living state", () => {
      const pack = {
        states: [
          { i: 0, removed: true },
          { i: 1, culture: 1, neighbors: [2] }, // Lich state
          { i: 2, culture: 2, neighbors: [1] } // Living state
        ],
        cultures: [
          { i: 0 },
          { i: 1, race: 16 }, // Lich
          { i: 2, race: 1 } // Human
        ],
        races: [{ i: 0 }, { i: 1, key: "human" }, { i: 16, key: "lich" }],
        burgs: []
      } as never;

      expect(isStateCloseToLivingRealm(1, pack)).toBe(true);
    });

    it("returns false when distant and not bordering living states", () => {
      const pack = {
        states: [
          { i: 0, removed: true },
          { i: 1, culture: 1, neighbors: [0], capital: 1 }, // Lich state
          { i: 2, culture: 2, neighbors: [0], capital: 2 } // Far living state
        ],
        cultures: [
          { i: 0 },
          { i: 1, race: 16 }, // Lich
          { i: 2, race: 1 } // Human
        ],
        races: [{ i: 0 }, { i: 1, key: "human" }, { i: 16, key: "lich" }],
        burgs: [
          null,
          { i: 1, x: 100, y: 100 },
          { i: 2, x: 800, y: 800 } // distance > 300
        ]
      } as never;

      expect(isStateCloseToLivingRealm(1, pack)).toBe(false);
    });
  });
});
