import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext } from "../nobilityContext";
import "../types";
import { tryRecaptureHomeBurg } from "./homeRecapture";

function makeRegiment(overrides: Partial<{ a: number; state: number; n: number; x: number; y: number }> = {}) {
  return {
    i: 0,
    t: overrides.a ?? 1,
    a: overrides.a ?? 1,
    name: "Test Regiment",
    s: 0,
    cell: 0,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    bx: 0,
    by: 0,
    u: { infantry: overrides.a ?? 1 },
    n: overrides.n ?? 0,
    type: "melee",
    state: overrides.state ?? 1
  };
}

describe("tryRecaptureHomeBurg", () => {
  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options.military = [{ name: "infantry", power: 1 }] as unknown as typeof worldContext.options.military;
    // These tests exercise autonomous-conflict combat resolution directly; the default policy
    // (conflictAutonomy.ts) is player-directed, so it must be set explicitly here.
    worldContext.options.conflictAutonomy = "autonomous";
  });

  afterEach(() => {
    clearNobilityContext();
  });

  // Burg cell 0 (state 2, occupier) is fully enclosed by cell 1 (state 1's own land) — its only
  // land neighbor. `occupierMilitary` lets tests place the occupier's own defending regiments.
  function makePack(burgOverrides: Partial<Record<string, unknown>> = {}, occupierMilitary: unknown[] = []) {
    worldContext.pack = {
      cells: { c: [[1], [0]], h: [50, 50], state: [2, 1], burg: [1, 0] },
      burgs: [
        0,
        {
          i: 1,
          cell: 0,
          x: 0,
          y: 0,
          state: 2,
          stateHistory: [1, 2],
          population: 5000,
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
        { i: 1, name: "Liberators", diplomacy: [undefined, "x", "Enemy"], military: [] },
        { i: 2, name: "Occupiers", diplomacy: [undefined, "Enemy", "x"], military: occupierMilitary }
      ]
    } as unknown as PackedGraph;
    return worldContext.pack as unknown as {
      burgs: { state: number; population: number; stateHistory?: number[] }[];
    };
  }

  it("recaptures unconditionally with a tiny force when the occupier has no nearby garrison, even walled/fortified", () => {
    const pack = makePack({ walls: 1, citadel: 1 });
    const r = makeRegiment({ a: 1 });

    const captured = tryRecaptureHomeBurg(r as never, 0);

    expect(captured).toBe(true);
    expect(pack.burgs[1].state).toBe(1);
    expect(pack.burgs[1].stateHistory).toEqual([1, 2, 1]);
  });

  it("treats a distant occupier regiment (beyond detection radius) as no garrison at all", () => {
    const pack = makePack({}, [makeRegiment({ a: 100000, state: 2, x: 10000, y: 0 })]);
    const r = makeRegiment({ a: 1 });

    const captured = tryRecaptureHomeBurg(r as never, 0);

    expect(captured).toBe(true);
    expect(pack.burgs[1].state).toBe(1);
  });

  it("requires the field attack ratio when the occupier has a real nearby garrison (unfortified)", () => {
    const weakAttacker = makeRegiment({ a: 100 });
    const withoutEnough = makePack({}, [makeRegiment({ a: 100, state: 2, x: 0, y: 0 })]);
    expect(tryRecaptureHomeBurg(weakAttacker as never, 0)).toBe(false);
    expect(withoutEnough.burgs[1].state).toBe(2);

    const strongAttacker = makeRegiment({ a: 1000 });
    makePack({}, [makeRegiment({ a: 100, state: 2, x: 0, y: 0 })]);
    expect(tryRecaptureHomeBurg(strongAttacker as never, 0)).toBe(true);
  });

  it("requires the higher fortified attack ratio when the occupier has a nearby garrison and the town is walled", () => {
    // 1.3x (field ratio) is enough to beat 100 defenders unfortified, but not enough once walls
    // raise the bar to 3x — same regiment/defense strength, only fortification differs.
    const r = makeRegiment({ a: 150 });
    const pack = makePack({ walls: 1 }, [makeRegiment({ a: 100, state: 2, x: 0, y: 0 })]);

    const captured = tryRecaptureHomeBurg(r as never, 0);

    expect(captured).toBe(false);
    expect(pack.burgs[1].state).toBe(2);
  });

  it("is not triggered for a burg that isn't a fully-enclosed, historically-own occupied pocket", () => {
    const pack = makePack({ stateHistory: [2] }); // never owned by state 1
    const r = makeRegiment({ a: 100000 });

    const captured = tryRecaptureHomeBurg(r as never, 0);

    expect(captured).toBe(false);
    expect(pack.burgs[1].state).toBe(2);
  });

  it("fleets don't trigger domestic recapture on land burgs", () => {
    const pack = makePack();
    const r = makeRegiment({ a: 100000, n: 1 });

    const captured = tryRecaptureHomeBurg(r as never, 0);

    expect(captured).toBe(false);
    expect(pack.burgs[1].state).toBe(2);
  });
});
