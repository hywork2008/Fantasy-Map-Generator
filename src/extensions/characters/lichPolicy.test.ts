import { describe, expect, it } from "vitest";
import { createDefaultRaces, HUMAN_RACE_ID } from "../../data/races";
import type { Character } from "./characterTypes";
import {
  fallbackRaceIdWhenLichDisallowed,
  isEligibleMortalBaseRace,
  isLichCharacter,
  isLichCultureId,
  isLichRaceId,
  isLichRaceKey,
  isLichState,
  isUndeadRaceKey,
  isUndeadThrallRaceKey,
  MAX_LICHES_PER_MAP,
  mayCreateLichRuler,
  raceKeyForId,
  youngestLichAge
} from "./lichPolicy";

describe("Lich policy", () => {
  const races = createDefaultRaces();
  const lichRace = races.find(race => race.key === "lich")!;
  const zombieRace = races.find(race => race.key === "zombie")!;
  const skeletonRace = races.find(race => race.key === "skeleton")!;

  function lich(age: number): Character {
    return { age, race: lichRace.i } as Character;
  }

  it("allows no more than the map-wide number of Lich rulers", () => {
    const eligibility = {
      roleClass: "ruler" as const,
      stateRaceId: lichRace.i,
      isExplicitRaceOverride: false,
      races
    };

    expect(mayCreateLichRuler({ ...eligibility, existingCharacters: [lich(900), lich(1200)] })).toBe(false);
    expect(MAX_LICHES_PER_MAP).toBe(2);
  });

  it("uses the youngest Lich as the map-wide undead age boundary", () => {
    expect(youngestLichAge([lich(1800), lich(900)], races)).toBe(900);
  });

  it("identifies Lich keys, race ids, characters, cultures, and states through one classifier", () => {
    expect(isLichRaceKey("lich")).toBe(true);
    expect(isLichRaceKey("human")).toBe(false);
    expect(isLichRaceId(races, lichRace.i)).toBe(true);
    expect(isLichCharacter({ race: lichRace.i } as Character, races)).toBe(true);

    const cultures = [{ race: 1 }, { race: lichRace.i }];
    expect(isLichCultureId(races, cultures, 1)).toBe(true);
    expect(isLichState(races, cultures, { culture: 1 })).toBe(true);
    expect(isLichState(races, cultures, { culture: 0 })).toBe(false);
  });

  it("resolves race keys from both id-indexed and sparse race tables", () => {
    const sparse = [
      { i: 0, key: "unknown" },
      { i: 1, key: "human" },
      { i: 16, key: "lich" }
    ];
    expect(raceKeyForId(sparse, 16)).toBe("lich");
    expect(isLichRaceId(sparse, 16)).toBe(true);
    expect(raceKeyForId(races, lichRace.i)).toBe("lich");
  });

  it("classifies undead thralls separately from the Lich sovereign", () => {
    expect(isUndeadThrallRaceKey("zombie")).toBe(true);
    expect(isUndeadThrallRaceKey("skeleton")).toBe(true);
    expect(isUndeadThrallRaceKey("lich")).toBe(false);
    expect(isUndeadRaceKey("lich")).toBe(true);
    expect(isUndeadRaceKey("human")).toBe(false);
  });

  it("demotes a disallowed Lich to Zombie, then Skeleton, then Human", () => {
    expect(fallbackRaceIdWhenLichDisallowed(races, HUMAN_RACE_ID)).toBe(zombieRace.i);
    const withoutZombie = races.filter(race => race.key !== "zombie");
    expect(fallbackRaceIdWhenLichDisallowed(withoutZombie, HUMAN_RACE_ID)).toBe(skeletonRace.i);
    const livingOnly = races.filter(race => race.key !== "zombie" && race.key !== "skeleton");
    expect(fallbackRaceIdWhenLichDisallowed(livingOnly, HUMAN_RACE_ID)).toBe(HUMAN_RACE_ID);
  });

  it("rejects undead, infernal, and unknown races as a mortal original body", () => {
    expect(isEligibleMortalBaseRace(races.find(race => race.key === "human")!)).toBe(true);
    expect(isEligibleMortalBaseRace(lichRace)).toBe(false);
    expect(isEligibleMortalBaseRace(zombieRace)).toBe(false);
    expect(isEligibleMortalBaseRace(races.find(race => race.key === "demon")!)).toBe(false);
    expect(isEligibleMortalBaseRace(races.find(race => race.key === "unknown")!)).toBe(false);
  });
});
