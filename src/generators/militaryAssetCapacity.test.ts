import { describe, expect, it } from "vitest";
import type { State } from "../types/models";
import { constrainRegimentUnits } from "./militaryAssetCapacity";

function makeState(): State {
  return {
    i: 1,
    military: [
      {
        i: 0,
        t: 10,
        a: 10,
        s: 0,
        cell: 1,
        x: 0,
        y: 0,
        bx: 0,
        by: 0,
        u: { cavalry: 8, infantry: 2 },
        n: 0,
        type: "mounted",
        state: 1,
        name: "First"
      },
      {
        i: 1,
        t: 6,
        a: 6,
        s: 0,
        cell: 2,
        x: 0,
        y: 0,
        bx: 0,
        by: 0,
        u: { cavalry: 6 },
        n: 0,
        type: "mounted",
        state: 1,
        name: "Second"
      }
    ]
  } as State;
}

describe("constrainRegimentUnits", () => {
  it("moves the unavailable portion into plannedU without changing other unit types", () => {
    const state = makeState();

    expect(constrainRegimentUnits(state, new Set(["cavalry"]), 9)).toBe(true);
    expect(state.military?.[0].u).toEqual({ cavalry: 8, infantry: 2 });
    expect(state.military?.[1].u).toEqual({ cavalry: 1 });
    expect(state.military?.[1].plannedU).toEqual({ cavalry: 6 });
    expect(state.military?.[1].a).toBe(1);
  });

  it("returns dormant formations to active service when capacity is restored", () => {
    const state = makeState();
    constrainRegimentUnits(state, new Set(["cavalry"]), 9);

    constrainRegimentUnits(state, new Set(["cavalry"]), 14);

    expect(state.military?.[1].u).toEqual({ cavalry: 6 });
    expect(state.military?.[1].plannedU).toBeUndefined();
    expect(state.military?.[1].a).toBe(6);
  });
});
