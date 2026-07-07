import { afterEach, describe, expect, it, vi } from "vitest";
import type { MilitaryRegiment } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { establishVassalage } from "./vassalage";

function makeRegiment(overrides: Partial<MilitaryRegiment>): MilitaryRegiment {
  return {
    i: 0,
    t: 0,
    name: "Regiment",
    a: 10,
    s: 0,
    cell: 0,
    x: 0,
    y: 0,
    bx: 0,
    by: 0,
    u: {},
    n: 0,
    type: "melee",
    state: 1,
    ...overrides
  };
}

describe("establishVassalage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("charges tribute and detaches a bounded garrison regiment at the vassal's capital", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // rand(5, 15) -> 5 -> rate 0.05
    const pack = {
      burgs: [0, { i: 1, cell: 10, x: 100, y: 200, capital: 1 }],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Suzerainia",
          rural: 0,
          urban: 0,
          capital: 0,
          diplomacy: [undefined, "x", "Suzerain"],
          military: [makeRegiment({ i: 0, name: "A", a: 100, u: { infantry: 100 } })]
        },
        {
          i: 2,
          name: "Vassalia",
          rural: 100,
          urban: 50,
          capital: 1,
          diplomacy: [undefined, "Vassal", "x"],
          military: []
        }
      ]
    } as unknown as PackedGraph;

    establishVassalage(pack, 1000);

    const vassal = pack.states[2];
    expect(vassal.tributeRate).toBe(0.05);
    expect(vassal.tributePaid).toBe(7500); // (100 + 50) * 1000 * 0.05

    const homeRegiment = pack.states[1].military!.find(r => r.name === "A")!;
    const garrison = pack.states[1].military!.find(r => r.garrisonHost === 2)!;

    // 15% of 100 troops detached, home regiment keeps the rest — never emptied out
    expect(garrison.a).toBe(15);
    expect(homeRegiment.a).toBe(85);
    expect(garrison.u.infantry).toBe(15);
    expect(homeRegiment.u.infantry).toBe(85);

    expect(garrison.cell).toBe(10);
    expect(garrison.x).toBe(100);
    expect(garrison.y).toBe(200);
  });

  it("never selects a naval regiment for garrison duty", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pack = {
      burgs: [0, { i: 1, cell: 10, x: 100, y: 200, capital: 1 }],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Suzerainia",
          rural: 0,
          urban: 0,
          capital: 0,
          diplomacy: [undefined, "x", "Suzerain"],
          // only a naval regiment exists — there is no land force to detach a garrison from
          military: [makeRegiment({ i: 0, name: "Fleet", a: 100, n: 1, u: { fleet: 100 } })]
        },
        {
          i: 2,
          name: "Vassalia",
          rural: 100,
          urban: 50,
          capital: 1,
          diplomacy: [undefined, "Vassal", "x"],
          military: []
        }
      ]
    } as unknown as PackedGraph;

    establishVassalage(pack, 1000);

    // tribute is still charged...
    expect(pack.states[2].tributePaid).toBe(7500);
    // ...but no garrison regiment was created, and the fleet is untouched
    expect(pack.states[1].military!.some(r => r.garrisonHost !== undefined)).toBe(false);
    expect(pack.states[1].military![0].a).toBe(100);
    expect(pack.states[1].military![0].cell).toBe(0);
  });

  it("never selects the capital guard for garrison duty, even with no other land force", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pack = {
      burgs: [0, { i: 1, cell: 10, x: 100, y: 200, capital: 1 }],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Suzerainia",
          rural: 0,
          urban: 0,
          capital: 0,
          diplomacy: [undefined, "x", "Suzerain"],
          // only the capital guard exists — it must never ship out to garrison a vassal
          military: [makeRegiment({ i: 0, name: "Guard", a: 100, isCapitalGuard: true, u: { infantry: 100 } })]
        },
        {
          i: 2,
          name: "Vassalia",
          rural: 100,
          urban: 50,
          capital: 1,
          diplomacy: [undefined, "Vassal", "x"],
          military: []
        }
      ]
    } as unknown as PackedGraph;

    establishVassalage(pack, 1000);

    expect(pack.states[2].tributePaid).toBe(7500);
    expect(pack.states[1].military!.some(r => r.garrisonHost !== undefined)).toBe(false);
    expect(pack.states[1].military![0].a).toBe(100);
    expect(pack.states[1].military![0].cell).toBe(0);
  });

  it("leaves states without a Vassal relation completely untouched", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pack = {
      burgs: [0],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Independent",
          rural: 100,
          urban: 50,
          capital: 0,
          diplomacy: [undefined, "x"],
          military: [makeRegiment({ i: 0, name: "A" })]
        }
      ]
    } as unknown as PackedGraph;

    establishVassalage(pack, 1000);

    const state = pack.states[1];
    expect(state.tributeRate).toBeUndefined();
    expect(state.tributePaid).toBeUndefined();
    expect(state.military).toHaveLength(1);
    expect(state.military![0].garrisonHost).toBeUndefined();
    expect(state.military![0].a).toBe(10);
  });

  it("caps the total garrisoned-away share across multiple vassals of the same suzerain", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pack = {
      burgs: [0, { i: 1, cell: 10, x: 100, y: 200, capital: 1 }, { i: 2, cell: 20, x: 300, y: 400, capital: 2 }],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Suzerainia",
          rural: 0,
          urban: 0,
          capital: 0,
          diplomacy: [undefined, "x", "Suzerain", "Suzerain", "Suzerain", "Suzerain"],
          military: [makeRegiment({ i: 0, name: "A", a: 1000, u: { infantry: 1000 } })]
        },
        {
          i: 2,
          name: "VassalOne",
          rural: 1,
          urban: 0,
          capital: 1,
          diplomacy: [undefined, "Vassal", "x", undefined, undefined, undefined],
          military: []
        },
        {
          i: 3,
          name: "VassalTwo",
          rural: 1,
          urban: 0,
          capital: 2,
          diplomacy: [undefined, "Vassal", undefined, "x", undefined, undefined],
          military: []
        },
        {
          i: 4,
          name: "VassalThree",
          rural: 1,
          urban: 0,
          capital: 1,
          diplomacy: [undefined, "Vassal", undefined, undefined, "x", undefined],
          military: []
        },
        {
          i: 5,
          name: "VassalFour",
          rural: 1,
          urban: 0,
          capital: 1,
          diplomacy: [undefined, "Vassal", undefined, undefined, undefined, "x"],
          military: []
        }
      ]
    } as unknown as PackedGraph;

    establishVassalage(pack, 1000);

    // 15% + 15% + 15% = 45% detached for the first three vassals; the fourth would push
    // past the 50% total cap (45% + 15% = 60%), so it only gets the 5% remainder.
    const garrisons = pack.states[1].military!.filter(r => r.garrisonHost !== undefined);
    const totalDetached = garrisons.reduce((sum, r) => sum + r.a, 0);

    expect(garrisons).toHaveLength(4);
    expect(totalDetached).toBe(500); // 50% of the original 1000 troops, never more
    expect(pack.states[1].military!.find(r => r.name === "A")!.a).toBe(500); // home force retains the other half
  });

  it("does not crash when a vassal's suzerain has no military at all", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pack = {
      burgs: [0, { i: 1, cell: 10, x: 100, y: 200, capital: 1 }],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Suzerainia",
          rural: 0,
          urban: 0,
          capital: 0,
          diplomacy: [undefined, "x", "Suzerain"],
          military: []
        },
        {
          i: 2,
          name: "Vassalia",
          rural: 10,
          urban: 0,
          capital: 1,
          diplomacy: [undefined, "Vassal", "x"],
          military: []
        }
      ]
    } as unknown as PackedGraph;

    expect(() => establishVassalage(pack, 1000)).not.toThrow();
    expect(pack.states[2].tributePaid).toBe(500);
  });

  it("skips garrisoning when the detachment would be too small to matter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pack = {
      burgs: [0, { i: 1, cell: 10, x: 100, y: 200, capital: 1 }],
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        {
          i: 1,
          name: "Suzerainia",
          rural: 0,
          urban: 0,
          capital: 0,
          diplomacy: [undefined, "x", "Suzerain"],
          // 15% of 10 troops rounds to 2 — below MIN_GARRISON_TROOPS (5)
          military: [makeRegiment({ i: 0, name: "A", a: 10, u: { infantry: 10 } })]
        },
        {
          i: 2,
          name: "Vassalia",
          rural: 10,
          urban: 0,
          capital: 1,
          diplomacy: [undefined, "Vassal", "x"],
          military: []
        }
      ]
    } as unknown as PackedGraph;

    establishVassalage(pack, 1000);

    expect(pack.states[1].military).toHaveLength(1); // no garrison regiment created
    expect(pack.states[1].military![0].a).toBe(10); // home regiment untouched
  });
});
