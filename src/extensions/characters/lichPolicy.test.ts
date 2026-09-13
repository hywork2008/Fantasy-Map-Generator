import { describe, expect, it } from "vitest";
import { createDefaultRaces } from "../../data/races";
import type { Character } from "./characterTypes";
import { MAX_LICHES_PER_MAP, mayCreateLichRuler, youngestLichAge } from "./lichPolicy";

describe("Lich policy", () => {
  const races = createDefaultRaces();
  const lichRace = races.find(race => race.key === "lich")!;

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
});
