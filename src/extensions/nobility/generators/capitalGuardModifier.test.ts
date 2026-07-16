import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { applyPersonalityToCapitalGuard } from "./capitalGuardModifier";

function makePersonality(overrides: Partial<{ boldness: number; confidence: number }> = {}) {
  return {
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
    confidence: 50,
    ...overrides
  };
}

describe("applyPersonalityToCapitalGuard", () => {
  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearNobilityContext();
  });

  it("inflates the capital guard past every other regiment for a cowardly, insecure ruler", () => {
    worldContext.pack = {
      characters: [{ i: 1, personality: makePersonality({ boldness: 10, confidence: 10 }) }],
      states: [
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Alpha",
          rulerId: 1,
          military: [
            { i: 0, isCapitalGuard: true, a: 50, u: { infantry: 50 } },
            { i: 1, a: 200, u: { infantry: 200 } }
          ]
        }
      ]
    } as unknown as PackedGraph;

    applyPersonalityToCapitalGuard();

    const [guard, army] = worldContext.pack.states[1].military!;
    expect(guard.a).toBeGreaterThan(army.a);
    expect(guard.u.infantry).toBe(guard.a); // unit composition kept in sync with the total
  });

  it("leaves the capital guard untouched for a bold or confident ruler", () => {
    worldContext.pack = {
      characters: [{ i: 1, personality: makePersonality({ boldness: 80, confidence: 10 }) }],
      states: [
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Alpha",
          rulerId: 1,
          military: [
            { i: 0, isCapitalGuard: true, a: 50, u: { infantry: 50 } },
            { i: 1, a: 200, u: { infantry: 200 } }
          ]
        }
      ]
    } as unknown as PackedGraph;

    applyPersonalityToCapitalGuard();

    expect(worldContext.pack.states[1].military![0].a).toBe(50);
  });

  it("does nothing when the guard is already the largest regiment", () => {
    worldContext.pack = {
      characters: [{ i: 1, personality: makePersonality({ boldness: 10, confidence: 10 }) }],
      states: [
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Alpha",
          rulerId: 1,
          military: [
            { i: 0, isCapitalGuard: true, a: 500, u: { infantry: 500 } },
            { i: 1, a: 200, u: { infantry: 200 } }
          ]
        }
      ]
    } as unknown as PackedGraph;

    applyPersonalityToCapitalGuard();

    expect(worldContext.pack.states[1].military![0].a).toBe(500);
  });

  it("does not crash for a state with no ruler, no characters, or no military", () => {
    worldContext.pack = {
      characters: [],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "NoRuler", military: [{ i: 0, isCapitalGuard: true, a: 10, u: {} }] },
        { i: 2, name: "NoMilitary", rulerId: 1 }
      ]
    } as unknown as PackedGraph;

    expect(() => applyPersonalityToCapitalGuard()).not.toThrow();
  });
});
