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

  describe("Spymastery service level effect (PR-17d)", () => {
    function makeObserverAndTarget(observerDepartmentServiceLevel?: State["departmentServiceLevel"]): {
      observer: State;
      target: State;
    } {
      const observer: State = {
        i: 1,
        departmentServiceLevel: observerDepartmentServiceLevel
      } as unknown as State;
      const target: State = { i: 2, rulerId: 99 } as unknown as State;
      worldContext.pack = {
        states: [{} as unknown as State, observer, target],
        characters: [
          makeCharacter({
            i: 50,
            state: 1,
            titles: [{ title: "Spymaster", landed: false, entityType: "state", entityId: 1 }],
            skills: { ...makeCharacter({}).skills, intrigue: 20 }
          }),
          makeCharacter({
            i: 99,
            state: 2,
            skills: { ...makeCharacter({}).skills, intrigue: 15 },
            personality: { ...makeCharacter({}).personality, guile: 12, boldness: 50, confidence: 50 }
          })
        ]
      } as unknown as PackedGraph;
      return { observer, target };
    }

    it("stays at full effectiveness when departmentServiceLevel is undefined (Economy disabled — unchanged pre-PR-17d behavior)", () => {
      makeObserverAndTarget(undefined);

      espionage.generate();

      // observerIntrigue = 20×1.5 + 5 + 5 = 40; targetIntrigue = 5×1.5 + 15 + 12 = 34.5; diff 5.5 → accurate.
      expect(simulationContext.intelligence[1][2].accuracyLevel).toBe("accurate");
    });

    it("blunts intrigue-gathering enough to flip an accurate reading to a deceived one when Spymastery is fully neglected", () => {
      makeObserverAndTarget({ chancery: 1, stewardship: 1, spymastery: 0, ecclesiastica: 1 });

      espionage.generate();

      // effectiveness floors at 0.4 → observerIntrigue 40×0.4 = 16; diff 16 − 34.5 = −18.5 → deception branch,
      // target boldness/confidence both 50 (neither cautious nor bold) → general deception → "unknown".
      expect(simulationContext.intelligence[1][2].accuracyLevel).toBe("unknown");
    });
  });
});
