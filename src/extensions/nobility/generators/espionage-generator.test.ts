import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { addVoyageIntel, clearVoyageIntel, EspionageGenerator } from "./espionage-generator";

function makeCharacter(overrides: Partial<Character>): Character {
  return {
    i: 0,
    name: "Test",
    age: 30,
    gender: "male",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 0,
    skills: {
      artistry: 5,
      diplomacy: 5,
      engineering: 5,
      geography: 5,
      intrigue: 5,
      learning: 5,
      martial: 5,
      prowess: 5,
      stewardship: 5
    },
    personality: {
      boldness: 50,
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
    },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 0,
    ...overrides
  } as Character;
}

describe("EspionageGenerator + voyage intel (docs/plan/ships.md 航海訓練・偽装通商・諜報)", () => {
  let espionage: EspionageGenerator;

  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    espionage = new EspionageGenerator();
    simulationContext.intelligence = {};
    simulationContext.currentYear = 100;
    clearVoyageIntel();
  });

  afterEach(() => {
    clearNobilityContext();
    clearVoyageIntel();
  });

  it("flips a deceived report to accurate once accumulated voyage intel closes the intrigue gap", () => {
    // Observer has no ruler/spymaster (falls back to default intrigue 5 -> observerIntrigue = 17.5).
    // Target's ruler is far more guileful/intriguing, opening a 25-point gap (deception branch, "unknown").
    const observer: State = { i: 1 } as unknown as State;
    const target: State = { i: 2, rulerId: 99 } as unknown as State;
    worldContext.pack = {
      states: [{} as unknown as State, observer, target],
      characters: [
        makeCharacter({
          i: 99,
          state: 2,
          skills: { ...makeCharacter({}).skills, intrigue: 20 },
          personality: { ...makeCharacter({}).personality, guile: 15, boldness: 50, confidence: 50 }
        })
      ]
    } as unknown as PackedGraph;

    espionage.generate();
    const before = simulationContext.intelligence[1][2];
    expect(before.accuracyLevel).toBe("unknown");

    addVoyageIntel(1, 2, 20); // MAX_VOYAGE_INTEL_BONUS cap — closes the 25-point gap to within +/-10

    espionage.generate();
    const after = simulationContext.intelligence[1][2];
    expect(after.accuracyLevel).toBe("accurate");
  });

  it("caps the accumulated voyage intel bonus rather than letting it grow unbounded", () => {
    addVoyageIntel(1, 2, 15);
    addVoyageIntel(1, 2, 15); // 30 raw, but capped at MAX_VOYAGE_INTEL_BONUS=20

    const observer: State = { i: 1 } as unknown as State;
    const target: State = { i: 2, rulerId: 99 } as unknown as State;
    worldContext.pack = {
      states: [{} as unknown as State, observer, target],
      // Gap large enough (40 points) that even the capped +20 bonus keeps diff below -10.
      characters: [
        makeCharacter({
          i: 99,
          state: 2,
          skills: { ...makeCharacter({}).skills, intrigue: 25 },
          personality: { ...makeCharacter({}).personality, guile: 25, boldness: 50, confidence: 50 }
        })
      ]
    } as unknown as PackedGraph;

    espionage.generate();

    expect(simulationContext.intelligence[1][2].accuracyLevel).toBe("unknown");
  });

  it("clearVoyageIntel() resets the bonus", () => {
    addVoyageIntel(1, 2, 20);
    clearVoyageIntel();

    const observer: State = { i: 1 } as unknown as State;
    const target: State = { i: 2, rulerId: 99 } as unknown as State;
    worldContext.pack = {
      states: [{} as unknown as State, observer, target],
      characters: [
        makeCharacter({
          i: 99,
          state: 2,
          skills: { ...makeCharacter({}).skills, intrigue: 20 },
          personality: { ...makeCharacter({}).personality, guile: 15, boldness: 50, confidence: 50 }
        })
      ]
    } as unknown as PackedGraph;

    espionage.generate();

    expect(simulationContext.intelligence[1][2].accuracyLevel).toBe("unknown");
  });
});
