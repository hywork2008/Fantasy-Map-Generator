import { describe, expect, it } from "vitest";
import { createDefaultRaces, raceIdByKey } from "../../data/races";
import type { Character, CharacterPersonality } from "./characterTypes";
import {
  combineStateWarlike,
  OFFICE_RESIGNATION_BOREDOM,
  OFFICE_RESIGNATION_STRESS,
  officeResignationReason,
  shouldResignFromMartialEnnui
} from "./officeResignation";

const races = createDefaultRaces();

function personality(boldness: number): CharacterPersonality {
  return {
    boldness,
    compassion: 50,
    greed: 50,
    honor: 50,
    rationality: 50,
    sociability: 50,
    vengefulness: 50,
    zeal: 50,
    energy: 50,
    piety: 50,
    guile: 50,
    confidence: 50
  };
}

function subject(
  raceKey: string,
  boldness = 50,
  appearance?: Character["raceAppearance"]
): Pick<Character, "race" | "culture" | "raceAppearance" | "personality"> {
  return {
    race: raceIdByKey(races, raceKey),
    culture: 1,
    personality: personality(boldness),
    ...(appearance ? { raceAppearance: appearance } : {})
  };
}

const wolf = { kind: "beastfolk" as const, animal: "wolf" as const, furryScale: 5 };

describe("combineStateWarlike", () => {
  it("takes the stronger of ruler policy and current wars", () => {
    expect(combineStateWarlike(30, 0)).toBe(30);
    expect(combineStateWarlike(30, 8)).toBe(80);
    expect(combineStateWarlike(90, 2)).toBe(90);
    expect(combineStateWarlike(undefined, 0)).toBe(50);
  });
});

describe("officeResignationReason", () => {
  it("labels elf and dark elf non-martial resignations as boredom", () => {
    expect(officeResignationReason(subject("elf"), { races, title: "Chancellor" })).toBe(OFFICE_RESIGNATION_BOREDOM);
    expect(officeResignationReason(subject("dark_elf"), { races, title: "Steward" })).toBe(OFFICE_RESIGNATION_BOREDOM);
  });

  it("labels carnivorous beastfolk non-martial resignations as boredom", () => {
    expect(officeResignationReason(subject("beastfolk", 50, wolf), { races, title: "Chancellor" })).toBe(
      OFFICE_RESIGNATION_BOREDOM
    );
  });

  it("keeps herbivorous beastfolk and humans on stress without a martial mismatch", () => {
    expect(
      officeResignationReason(subject("beastfolk", 50, { kind: "beastfolk", animal: "deer", furryScale: 4 }), {
        races,
        title: "Chancellor"
      })
    ).toBe(OFFICE_RESIGNATION_STRESS);
    expect(officeResignationReason(subject("human"), { races, title: "Chancellor" })).toBe(OFFICE_RESIGNATION_STRESS);
  });

  it("calls a hawk marshal in a peaceful state bored, even if human", () => {
    const human = subject("human", 80);
    const ctx = { races, title: "Marshal", primarySkill: "martial" as const, stateWarlike: 25 };
    expect(officeResignationReason(human, ctx)).toBe(OFFICE_RESIGNATION_BOREDOM);
    expect(shouldResignFromMartialEnnui(human, ctx)).toBe(true);
  });

  it("calls a dove marshal in a warlike state stressed, even if elf", () => {
    const elf = subject("elf", 20);
    const ctx = { races, title: "Marshal", primarySkill: "martial" as const, stateWarlike: 80 };
    expect(officeResignationReason(elf, ctx)).toBe(OFFICE_RESIGNATION_STRESS);
    expect(shouldResignFromMartialEnnui(elf, ctx)).toBe(false);
  });

  it("does not let martial mismatch fire when the officer matches the state's war posture", () => {
    expect(
      officeResignationReason(subject("elf", 70), {
        races,
        title: "Marshal",
        primarySkill: "martial",
        stateWarlike: 75
      })
    ).toBe(OFFICE_RESIGNATION_BOREDOM);
    expect(
      officeResignationReason(subject("human", 70), {
        races,
        title: "Marshal",
        primarySkill: "martial",
        stateWarlike: 75
      })
    ).toBe(OFFICE_RESIGNATION_STRESS);
  });
});
