import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import {
  advanceCharacterHealth,
  diseaseDeathReason,
  diseaseDeathRiskFor,
  getCharacterHealth,
  HEALTH_FULL,
  isCharacterSick,
  resolveCharacterSanitation
} from "./characterHealth";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import type { Character } from "./characterTypes";
import "./types";

/** Minimal living adult human, no affliction, seeded at full health, zero wealth (vulnerability multiplier 1). */
function baseCharacter(overrides: Partial<Character> = {}): Character {
  return {
    i: overrides.i ?? 0,
    name: "Test",
    age: 30,
    gender: "male",
    culture: 0,
    race: 0,
    titles: [],
    affinities: {},
    marriages: [],
    skills: {} as never,
    personality: {} as never,
    family: {} as never,
    pastTitles: [],
    state: 1,
    location: 0,
    appearance: 50,
    prestige: 50,
    wealth: 0,
    health: HEALTH_FULL,
    ...overrides
  } as Character;
}

describe("getCharacterHealth / isCharacterSick", () => {
  it("defaults missing health to full", () => {
    expect(getCharacterHealth({ health: undefined })).toBe(HEALTH_FULL);
  });

  it("passes through a set health value", () => {
    expect(getCharacterHealth({ health: 42 })).toBe(42);
  });

  it("reports sick only when an affliction is present", () => {
    expect(isCharacterSick({ affliction: undefined })).toBe(false);
    expect(isCharacterSick({ affliction: { kind: "fever", severity: "mild", sinceYear: 1 } })).toBe(true);
  });
});

describe("resolveCharacterSanitation", () => {
  afterEach(() => {
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {} as unknown as PackedGraph;
  });

  it("returns the neutral default without a characters context", () => {
    clearCharactersContext();
    expect(resolveCharacterSanitation({ location: 0, state: 1 })).toBe(50);
  });

  it("reads the character's burg sanitation when available", () => {
    worldContext.pack.burgs = [{ i: 0, sanitation: 22 }] as never;
    expect(resolveCharacterSanitation({ location: 0, state: 1 })).toBe(22);
  });

  it("ignores a removed burg and falls back to the state", () => {
    worldContext.pack.burgs = [{ i: 0, removed: true, sanitation: 22 }] as never;
    worldContext.pack.states = [{}, { i: 1, sanitation: 71 }] as never;
    expect(resolveCharacterSanitation({ location: 0, state: 1 })).toBe(71);
  });

  it("falls back to the state when location is unset", () => {
    worldContext.pack.states = [{}, { i: 1, sanitation: 65 }] as never;
    expect(resolveCharacterSanitation({ location: undefined, state: 1 })).toBe(65);
  });

  it("prefers nationalityStateId over state when both resolve", () => {
    worldContext.pack.states = [{}, { i: 1, sanitation: 65 }, { i: 2, sanitation: 10 }] as never;
    expect(resolveCharacterSanitation({ location: undefined, state: 1, nationalityStateId: 2 })).toBe(10);
  });

  it("returns the neutral default (50) when nothing resolves", () => {
    worldContext.pack.states = [{}] as never;
    expect(resolveCharacterSanitation({ location: undefined, state: 1 })).toBe(50);
  });
});

describe("diseaseDeathRiskFor / diseaseDeathReason", () => {
  afterEach(() => {
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {} as unknown as PackedGraph;
  });

  it("is zero for a healthy character with no affliction", () => {
    const character = baseCharacter({ health: HEALTH_FULL });
    expect(diseaseDeathRiskFor(character)).toBe(0);
    expect(diseaseDeathReason(character)).toBeUndefined();
  });

  it("adds a small baseline risk once health drops below the chronic threshold", () => {
    const barelyLow = baseCharacter({ health: 19 });
    const veryLow = baseCharacter({ health: 1 });
    expect(diseaseDeathRiskFor(barelyLow)).toBeGreaterThan(0);
    expect(diseaseDeathRiskFor(veryLow)).toBeGreaterThan(diseaseDeathRiskFor(barelyLow));
  });

  it("scales with affliction severity for an unremarkable adult human (vulnerability multiplier 1)", () => {
    const mild = baseCharacter({ affliction: { kind: "flux", severity: "mild", sinceYear: 1 } });
    const critical = baseCharacter({ affliction: { kind: "flux", severity: "critical", sinceYear: 1 } });
    // 0.001 * 0.8 (flux deathRiskMultiplier) * 1 (baseline vulnerability)
    expect(diseaseDeathRiskFor(mild)).toBeCloseTo(0.0008, 6);
    // 0.12 * 0.8
    expect(diseaseDeathRiskFor(critical)).toBeCloseTo(0.096, 6);
    expect(diseaseDeathRiskFor(critical)).toBeGreaterThan(diseaseDeathRiskFor(mild));
  });

  it("weighs plague as deadlier than pox at the same severity", () => {
    const plague = baseCharacter({ affliction: { kind: "plague", severity: "severe", sinceYear: 1 } });
    const pox = baseCharacter({ affliction: { kind: "pox", severity: "severe", sinceYear: 1 } });
    expect(diseaseDeathRiskFor(plague)).toBeGreaterThan(diseaseDeathRiskFor(pox));
  });

  it("returns a flavor death reason only while afflicted", () => {
    const sick = baseCharacter({ affliction: { kind: "plague", severity: "critical", sinceYear: 1 } });
    expect(diseaseDeathReason(sick)).toBe("Died of plague");
    expect(diseaseDeathReason(baseCharacter({}))).toBeUndefined();
  });
});

describe("advanceCharacterHealth", () => {
  afterEach(() => {
    clearCharactersContext();
  });

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {} as unknown as PackedGraph;
  });

  it("does nothing for a non-positive deltaYears", () => {
    const character = baseCharacter({ health: 80 });
    worldContext.pack.characters = [character] as never;
    advanceCharacterHealth(0);
    expect(character.health).toBe(80);
  });

  it("skips dead characters", () => {
    const character = baseCharacter({ health: 80, dead: true });
    worldContext.pack.characters = [character] as never;
    advanceCharacterHealth(5);
    expect(character.health).toBe(80);
  });

  it("drains health from an ongoing critical affliction", () => {
    const character = baseCharacter({
      health: 90,
      affliction: { kind: "flux", severity: "critical", sinceYear: 1 }
    });
    worldContext.pack.characters = [character] as never;
    advanceCharacterHealth(0.1); // short tick so drain alone is observable regardless of recovery roll
    expect(character.health).toBeLessThan(90);
  });

  it("drifts health up toward 100 for an unafflicted resident of a clean city", () => {
    const character = baseCharacter({ health: 40, location: 0 });
    worldContext.pack.burgs = [{ i: 0, sanitation: 90 }] as never;
    worldContext.pack.characters = [character] as never;
    advanceCharacterHealth(1);
    expect(character.health).toBeGreaterThan(40);
  });

  it("caps unafflicted health below 100 in a chronically squalid city", () => {
    const character = baseCharacter({ health: 95, location: 0 });
    worldContext.pack.burgs = [{ i: 0, sanitation: 0 }] as never;
    worldContext.pack.characters = [character] as never;
    // Many years so health has settled at its sanitation-capped ceiling.
    advanceCharacterHealth(50);
    expect(character.health).toBeLessThan(HEALTH_FULL - 15); // CHRONIC_HEALTH_DRAG_MAX is 20 at sanitation 0
  });

  it("infects residents of a squalid city more often than residents of a clean one (statistical)", () => {
    const trials = 250;
    let squalidInfections = 0;
    let cleanInfections = 0;

    for (let i = 0; i < trials; i++) {
      const squalid = baseCharacter({ i: 0, health: HEALTH_FULL, location: 0 });
      const clean = baseCharacter({ i: 1, health: HEALTH_FULL, location: 1 });
      worldContext.pack.burgs = [
        { i: 0, sanitation: 5 },
        { i: 1, sanitation: 95 }
      ] as never;
      worldContext.pack.characters = [squalid, clean] as never;

      advanceCharacterHealth(1);

      if (squalid.affliction) squalidInfections++;
      if (clean.affliction) cleanInfections++;
    }

    expect(squalidInfections).toBeGreaterThan(cleanInfections);
  });

  it("recovers an afflicted character when Math.random always favors success", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const character = baseCharacter({
        health: 30,
        affliction: { kind: "fever", severity: "mild", sinceYear: 1 }
      });
      worldContext.pack.characters = [character] as never;
      advanceCharacterHealth(1);
      expect(character.affliction).toBeUndefined();
      expect(character.timesIllness).toBe(1);
    } finally {
      random.mockRestore();
    }
  });
});
