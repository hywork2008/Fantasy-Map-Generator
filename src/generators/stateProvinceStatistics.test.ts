import { describe, expect, it } from "vitest";
import type { Province, State } from "../types/models";
import type { WorldState } from "../types/WorldState";
import { Provinces } from "./provinces-generator";
import { States } from "./states-generator";

describe("political aggregates with unclaimed land", () => {
  it("excludes state zero from national statistics while retaining province zero", () => {
    const state: WorldState = {
      pack: {
        cells: {
          i: new Uint16Array([0, 1, 2]),
          h: new Uint8Array([25, 25, 25]),
          state: new Uint16Array([0, 1, 1]),
          province: new Uint16Array([0, 1, 1]),
          area: new Float32Array([5, 7, 11]),
          pop: new Float32Array([3, 13, 17]),
          burg: new Uint16Array([0, 1, 0])
        },
        states: [
          { i: 0, name: "Neutrals" },
          { i: 1, name: "Aster" }
        ],
        provinces: [0, { i: 1, state: 1, burg: 1 }],
        burgs: [0, { i: 1, population: 19 }]
      },
      grid: {} as WorldState["grid"],
      seed: "phase-0"
    } as unknown as WorldState;

    States.collectStatistics(state);
    Provinces.collectStatistics(state);

    const neutral = state.pack.states[0] as State;
    const aster = state.pack.states[1] as State;
    const province = state.pack.provinces[1] as Province;

    expect(neutral).toMatchObject({ cells: 0, area: 0, rural: 0, urban: 0, burgs: 0 });
    expect(aster).toMatchObject({ cells: 2, area: 18, rural: 30, urban: 19, burgs: 1 });
    expect(province).toMatchObject({ area: 18, rural: 30, urban: 19, burgs: [1] });
  });
});
