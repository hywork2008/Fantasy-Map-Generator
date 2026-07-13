import { beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { useOptionsState } from "../../../store/optionsState";
import type { PackedGraph } from "../../hostTypes";
import { Mobilization } from "./mobilization";

function makeState(
  overrides: Partial<{
    i: number;
    rural: number;
    urban: number;
    diplomacy: (string | undefined)[];
    military: unknown[];
  }> = {}
) {
  return {
    i: overrides.i ?? 1,
    name: "Test State",
    rural: overrides.rural ?? 0,
    urban: overrides.urban ?? 0,
    diplomacy: overrides.diplomacy ?? [],
    military: overrides.military ?? []
  };
}

function makeRegiment(overrides: Partial<{ a: number; t: number; n: number }> = {}) {
  return {
    i: 0,
    t: overrides.t ?? 10,
    a: overrides.a ?? 10,
    n: overrides.n ?? 0,
    u: { infantry: overrides.a ?? 10 },
    state: 1
  };
}

describe("Mobilization.conscript", () => {
  beforeEach(() => {
    simulationContext.intelligence = {};
    // Legacy path under test — core tickManpower owns drafting when simManpower is on.
    useOptionsState.getState().setOption("simManpower", false);
  });

  it("raises regiment capacity toward the 1% population baseline when under-conscripted", () => {
    // Population = (800 + 200) * 1000 = 1,000,000; 1% target = 10,000.
    const regiment = makeRegiment({ a: 100, t: 100 });
    const pack = {
      states: [{ i: 0, diplomacy: [] }, makeState({ rural: 800, urban: 200, military: [regiment] })]
    } as unknown as PackedGraph;

    Mobilization.conscript(pack);

    // Gap = 10000 - 100 = 9900; half closed this pass = 4950, spread across the sole regiment.
    expect(regiment.t).toBeCloseTo(100 + 4950, 5);
  });

  it("does not touch a regiment already at or above the target capacity", () => {
    const regiment = makeRegiment({ a: 50000, t: 50000 });
    const pack = {
      states: [{ i: 0, diplomacy: [] }, makeState({ rural: 800, urban: 200, military: [regiment] })]
    } as unknown as PackedGraph;

    Mobilization.conscript(pack);

    expect(regiment.t).toBe(50000);
  });

  it("mobilizes toward the higher existential ratio when a declared enemy outguns current land troops", () => {
    const regiment = makeRegiment({ a: 100, t: 100 });
    const pack = {
      states: [
        { i: 0, diplomacy: [] },
        makeState({ rural: 800, urban: 200, diplomacy: [undefined, "x", "Enemy"], military: [regiment] }),
        { i: 2, diplomacy: [] }
      ]
    } as unknown as PackedGraph;
    simulationContext.intelligence = {
      1: {
        2: {
          estimatedMilitaryPower: 999999,
          estimatedWealth: 0,
          lastUpdatedYear: 1000,
          accuracyLevel: "accurate",
          hiddenBySpymaster: false
        }
      }
    };

    Mobilization.conscript(pack);

    // Existential target = 1,000,000 * 3% = 30000; gap = 29900; half closed = 14950.
    expect(regiment.t).toBeCloseTo(100 + 14950, 5);
  });

  it("leaves fleets untouched and excludes them from the capacity total", () => {
    const landRegiment = makeRegiment({ a: 100, t: 100 });
    const fleet = makeRegiment({ a: 5000, t: 5000, n: 1 });
    const pack = {
      states: [{ i: 0, diplomacy: [] }, makeState({ rural: 800, urban: 200, military: [landRegiment, fleet] })]
    } as unknown as PackedGraph;

    Mobilization.conscript(pack);

    expect(fleet.t).toBe(5000);
    expect(landRegiment.t).toBeGreaterThan(100);
  });

  it("does nothing for a state with no military at all", () => {
    const pack = {
      states: [{ i: 0, diplomacy: [] }, makeState({ rural: 800, urban: 200, military: [] })]
    } as unknown as PackedGraph;

    expect(() => Mobilization.conscript(pack)).not.toThrow();
  });
});
