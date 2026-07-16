import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { tryCaptureOnPassing } from "./marchCapture";

function makeRegiment(overrides: Partial<{ a: number; state: number; n: number }> = {}) {
  return {
    i: 0,
    t: overrides.a ?? 60000,
    a: overrides.a ?? 60000,
    name: "Test Regiment",
    s: 0,
    cell: 0,
    x: 0,
    y: 0,
    bx: 0,
    by: 0,
    u: { infantry: overrides.a ?? 60000 },
    n: overrides.n ?? 0,
    type: "melee",
    state: overrides.state ?? 1
  };
}

describe("tryCaptureOnPassing", () => {
  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.options.military = [{ name: "infantry", power: 1 }] as unknown as typeof worldContext.options.military;
    // These tests exercise autonomous-conflict combat resolution directly; the default policy
    // (conflictAutonomy.ts) is player-directed, so it must be set explicitly here.
    worldContext.options.conflictAutonomy = "autonomous";
  });

  afterEach(() => {
    clearNobilityContext();
  });

  function makePack(burgOverrides: Partial<Record<string, unknown>> = {}) {
    worldContext.pack = {
      cells: { burg: [1, 0], state: [2, 2] },
      burgs: [
        { i: 0, cell: -1, removed: true },
        {
          i: 1,
          cell: 0,
          x: 0,
          y: 0,
          state: 2,
          stateHistory: [2],
          population: 5,
          treasury: 1000,
          product: 1000,
          walls: 0,
          citadel: 0,
          ...burgOverrides
        }
      ],
      characters: [],
      routes: [],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "Attackers", diplomacy: [undefined, "x", "Enemy"], military: [] },
        { i: 2, name: "Defenders", diplomacy: [undefined, "Enemy", "x"], military: [] }
      ]
    } as unknown as PackedGraph;
    return worldContext.pack as unknown as {
      burgs: {
        state: number;
        population: number;
        treasury: number;
        product: number;
        walls: number;
        citadel: number;
        stateHistory?: number[];
      }[];
    };
  }

  it("captures an unwalled, undefended enemy town a large army marches through", () => {
    const pack = makePack();
    const r = makeRegiment({ a: 60000 });

    const captured = tryCaptureOnPassing(r as never, 0);

    expect(captured).toBe(true);
    expect(pack.burgs[1].state).toBe(1);
    expect(pack.burgs[1].stateHistory).toEqual([2, 1]);
  });

  it("never captures a walled/citadel town in passing, regardless of force size", () => {
    const pack = makePack({ walls: 1 });
    const r = makeRegiment({ a: 60000 });

    const captured = tryCaptureOnPassing(r as never, 0);

    expect(captured).toBe(false);
    expect(pack.burgs[1].state).toBe(2);
  });

  it("still forages (population/wealth loss) a walled town it cannot capture", () => {
    const pack = makePack({ walls: 1 });
    const r = makeRegiment({ a: 60000 });

    tryCaptureOnPassing(r as never, 0);

    expect(pack.burgs[1].population).toBeLessThan(5);
    expect(pack.burgs[1].treasury).toBeLessThan(1000);
    expect(pack.burgs[1].product).toBeLessThan(1000);
  });

  it("leaves a non-enemy (or own) town completely untouched", () => {
    const pack = makePack();
    pack.burgs[1].state = 1; // already the regiment's own state
    const r = makeRegiment({ a: 60000, state: 1 });

    const captured = tryCaptureOnPassing(r as never, 0);

    expect(captured).toBe(false);
    expect(pack.burgs[1].population).toBe(5);
    expect(pack.burgs[1].treasury).toBe(1000);
  });

  it("barely dents a real city's population/wealth when only a small patrol passes through", () => {
    const pack = makePack({ population: 50 });
    const r = makeRegiment({ a: 100 });

    const captured = tryCaptureOnPassing(r as never, 0);

    expect(captured).toBe(false); // 100 troops can't take a 50,000-population city's militia
    expect(pack.burgs[1].population).toBeGreaterThan(49.9);
  });

  it("keeps a small burg above zero when a passing army raids it", () => {
    const pack = makePack({ population: 0.2, walls: 1 }); // 200 inhabitants
    const r = makeRegiment({ a: 100 });

    tryCaptureOnPassing(r as never, 0);

    expect(pack.burgs[1].population).toBeGreaterThan(0);
    expect(pack.burgs[1].population).toBeLessThan(0.2);
  });

  it("fleets don't trigger passing capture on land burgs", () => {
    const pack = makePack();
    const r = makeRegiment({ a: 60000, n: 1 });

    const captured = tryCaptureOnPassing(r as never, 0);

    expect(captured).toBe(false);
    expect(pack.burgs[1].state).toBe(2);
  });
});
