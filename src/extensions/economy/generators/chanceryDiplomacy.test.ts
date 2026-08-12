import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { updateDiplomaticReliability } from "./chanceryDiplomacy";

describe("chanceryDiplomacy (PR-17g)", () => {
  afterEach(() => clearEconomyContext());
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { states: [], burgs: [], characters: [] } as unknown as PackedGraph;
  });

  it("recovers toward 100 when Chancery is well-funded", () => {
    const state = {
      i: 1,
      diplomaticReliability: 50,
      departmentServiceLevel: { chancery: 0.9, stewardship: 1, spymastery: 1, ecclesiastica: 1 }
    } as unknown as State;

    const result = updateDiplomaticReliability(state);

    expect(result.reliability).toBe(54);
    expect(state.diplomaticReliability).toBe(54);
    expect(result.allianceStrained).toBeNull();
  });

  it("decays mildly when Chancery is moderately underfunded", () => {
    const state = {
      i: 1,
      diplomaticReliability: 50,
      departmentServiceLevel: { chancery: 0.6, stewardship: 1, spymastery: 1, ecclesiastica: 1 }
    } as unknown as State;

    const result = updateDiplomaticReliability(state);

    expect(result.reliability).toBe(48);
  });

  it("decays strongly when Chancery is badly underfunded", () => {
    const state = {
      i: 1,
      diplomaticReliability: 50,
      departmentServiceLevel: { chancery: 0.2, stewardship: 1, spymastery: 1, ecclesiastica: 1 }
    } as unknown as State;

    const result = updateDiplomaticReliability(state);

    expect(result.reliability).toBe(44);
  });

  it("defaults an unset diplomaticReliability to the healthy max (100)", () => {
    const state = { i: 1 } as unknown as State; // no departmentServiceLevel → chancery defaults to 1 (well-funded)

    const result = updateDiplomaticReliability(state);

    expect(result.reliability).toBe(100);
  });

  it("clamps at the floor of 0", () => {
    const state = {
      i: 1,
      diplomaticReliability: 2,
      departmentServiceLevel: { chancery: 0.1, stewardship: 1, spymastery: 1, ecclesiastica: 1 }
    } as unknown as State;

    const result = updateDiplomaticReliability(state);

    expect(result.reliability).toBe(0);
  });

  it("strains exactly one existing Ally the cycle reliability first crosses below the risk threshold", () => {
    const state = {
      i: 1,
      diplomaticReliability: 32,
      diplomacy: ["x", "x", "Ally"],
      departmentServiceLevel: { chancery: 0.1, stewardship: 1, spymastery: 1, ecclesiastica: 1 }
    } as unknown as State;
    const ally = { i: 2, diplomacy: ["x", "x", "Ally"] } as unknown as State;
    worldContext.pack.states = [undefined, state, ally] as unknown as PackedGraph["states"];

    const handler = vi.fn();
    document.addEventListener("fmg:diplomatic-reliability-alliance-strain", handler);
    try {
      const result = updateDiplomaticReliability(state);

      expect(result.reliability).toBe(26); // 32 − 6, crosses below 30
      expect(result.allianceStrained).toEqual({ allyStateId: 2, from: "Ally", to: "Friendly" });
      expect(state.diplomacy?.[2]).toBe("Friendly");
      expect(ally.diplomacy?.[1]).toBe("Friendly"); // bidirectional mirror (diplomacyRelations.ts)
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("fmg:diplomatic-reliability-alliance-strain", handler);
    }
  });

  it("does not re-strain an alliance every cycle reliability stays below the threshold (edge-triggered once)", () => {
    const state = {
      i: 1,
      diplomaticReliability: 26, // already below the threshold from a prior cycle
      diplomacy: ["x", "x", "Ally"],
      departmentServiceLevel: { chancery: 0.1, stewardship: 1, spymastery: 1, ecclesiastica: 1 }
    } as unknown as State;
    const ally = { i: 2, diplomacy: ["x", "x", "Ally"] } as unknown as State;
    worldContext.pack.states = [undefined, state, ally] as unknown as PackedGraph["states"];

    const result = updateDiplomaticReliability(state);

    expect(result.allianceStrained).toBeNull();
    expect(state.diplomacy?.[2]).toBe("Ally"); // untouched — no re-trigger
  });

  it("returns null (no crash) when reliability crosses the threshold but the state has no Ally", () => {
    const state = {
      i: 1,
      diplomaticReliability: 32,
      diplomacy: ["x", "x", "Neutral"],
      departmentServiceLevel: { chancery: 0.1, stewardship: 1, spymastery: 1, ecclesiastica: 1 }
    } as unknown as State;
    worldContext.pack.states = [undefined, state] as unknown as PackedGraph["states"];

    const result = updateDiplomaticReliability(state);

    expect(result.allianceStrained).toBeNull();
  });
});
