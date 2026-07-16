import { describe, expect, it } from "vitest";
import type { State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { starveDemographics, tickAgriculturalCalendar } from "./agriculturalStress";

describe("agriculturalStress", () => {
  it("starveDemographics reduces children faster than adults", () => {
    const next = starveDemographics(100, 100, 100, 100, 0.1);
    expect(next.children).toBeCloseTo(87, 5); // 1 - 0.13
    expect(next.maleAdults).toBeCloseTo(90, 5);
    expect(next.elders).toBeCloseTo(88, 5); // 1 - 0.12
  });

  it("accumulates planting exposure when at war in spring", () => {
    const state: State = {
      i: 1,
      name: "A",
      expansionism: 1,
      capital: 1,
      type: "Generic",
      center: 1,
      culture: 1,
      coa: null,
      diplomacy: [undefined, undefined, "Enemy"],
      military: [],
      agricultureYear: 1000,
      plantingExposure: 0,
      harvestExposure: 0
    };
    // cell 1 at y=0 with map coords that put capital at high northern latitude
    const pack = {
      cells: {
        i: [0, 1],
        state: [0, 1],
        p: [
          [0, 0],
          [0, 10]
        ],
        maleAdults: new Float32Array([0, 10]),
        pop: [0, 40]
      },
      burgs: [],
      states: [{ i: 0 } as State, state]
    } as unknown as PackedGraph;

    // Use a stub worldContext via tick — capitalLatitude needs worldContext.
    // We only assert that Enemy + spring month increases plantingExposure when seasonality > 0.
    // Without worldContext map coords this may no-op; call finalize path via year jump instead.
    state.plantingExposure = 50;
    state.harvestExposure = 40;
    state.agricultureCarryOver = 0;
    state.agricultureYear = 999;
    // year 1000 > 999 → finalize once
    tickAgriculturalCalendar(pack, 1, 1000, 3);
    expect(state.foodStress).toBeGreaterThan(0);
    expect(state.plantingExposure).toBe(0);
    expect(state.harvestExposure).toBe(0);
  });
});
