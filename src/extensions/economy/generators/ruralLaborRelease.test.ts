import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "../../hostTypes";
import {
  clearEconomyContext,
  getMobileAdultCohorts,
  initEconomyContext,
  setMigratableAdults,
  setRuralReleasePressure
} from "../economyContext";
import { releaseRuralLaborSurplus } from "./ruralLaborRelease";

afterEach(() => clearEconomyContext());

function initWorld(cells: {
  i: Uint16Array;
  state: Uint16Array;
  children: Float32Array;
  maleAdults: Float32Array;
  femaleAdults: Float32Array;
  elders: Float32Array;
  pop: Float32Array;
}) {
  const world = { pack: { cells } };
  initEconomyContext({ worldContext: world, simulationContext: { extensions: {} } } as unknown as ExtensionAPI);
  return world;
}

describe("releaseRuralLaborSurplus", () => {
  it("caps release at sustainableAdultOutflow (children / 15) even when the other two caps allow more", () => {
    const cells = {
      i: new Uint16Array([0]),
      state: new Uint16Array([7]),
      // sustainableAdultOutflow = 30 / 15 = 2, tighter than migratableAdults/ruralReleasePressure.
      children: new Float32Array([30]),
      maleAdults: new Float32Array([20]),
      femaleAdults: new Float32Array([20]),
      elders: new Float32Array([5]),
      pop: new Float32Array([75])
    };
    const world = initWorld(cells);
    setMigratableAdults(new Float32Array([10]));
    setRuralReleasePressure(new Float32Array([10]));

    releaseRuralLaborSurplus(world as never);

    // Released 2, split 50/50 → 1 male, 1 female.
    expect(cells.maleAdults[0]).toBeCloseTo(19);
    expect(cells.femaleAdults[0]).toBeCloseTo(19);
    expect(cells.children[0]).toBe(30);
    expect(cells.elders[0]).toBe(5);
    expect(cells.pop[0]).toBeCloseTo(73);

    const cohorts = getMobileAdultCohorts();
    expect(cohorts).toHaveLength(1);
    expect(cohorts[0]).toMatchObject({ originCell: 0, originState: 7, yearsSearching: 0 });
    expect(cohorts[0].maleAdults).toBeCloseTo(1);
    expect(cohorts[0].femaleAdults).toBeCloseTo(1);
  });

  it("caps release at migratableAdults when it is the tightest of the three", () => {
    const cells = {
      i: new Uint16Array([0]),
      state: new Uint16Array([1]),
      children: new Float32Array([300]), // sustainableAdultOutflow = 20, not binding
      maleAdults: new Float32Array([20]),
      femaleAdults: new Float32Array([20]),
      elders: new Float32Array([0]),
      pop: new Float32Array([340])
    };
    const world = initWorld(cells);
    setMigratableAdults(new Float32Array([3])); // tightest cap
    setRuralReleasePressure(new Float32Array([15]));

    releaseRuralLaborSurplus(world as never);

    expect(cells.maleAdults[0]).toBeCloseTo(18.5);
    expect(cells.femaleAdults[0]).toBeCloseTo(18.5);
    expect(getMobileAdultCohorts()[0].maleAdults + getMobileAdultCohorts()[0].femaleAdults).toBeCloseTo(3);
  });

  it("caps release at ruralReleasePressure when it is the tightest of the three", () => {
    const cells = {
      i: new Uint16Array([0]),
      state: new Uint16Array([1]),
      children: new Float32Array([300]), // sustainableAdultOutflow = 20, not binding
      maleAdults: new Float32Array([20]),
      femaleAdults: new Float32Array([20]),
      elders: new Float32Array([0]),
      pop: new Float32Array([340])
    };
    const world = initWorld(cells);
    setMigratableAdults(new Float32Array([15]));
    setRuralReleasePressure(new Float32Array([2])); // tightest cap: barely above own subsistence need

    releaseRuralLaborSurplus(world as never);

    expect(getMobileAdultCohorts()[0].maleAdults + getMobileAdultCohorts()[0].femaleAdults).toBeCloseTo(2);
  });

  it("falls back to the available sex when a 50/50 split would exceed one sex's stock", () => {
    const cells = {
      i: new Uint16Array([0]),
      state: new Uint16Array([1]),
      children: new Float32Array([60]), // sustainableAdultOutflow = 4, binding
      maleAdults: new Float32Array([10]),
      femaleAdults: new Float32Array([1]), // far fewer women than the 50/50 split would ask for
      elders: new Float32Array([0]),
      pop: new Float32Array([71])
    };
    const world = initWorld(cells);
    setMigratableAdults(new Float32Array([10]));
    setRuralReleasePressure(new Float32Array([10]));

    releaseRuralLaborSurplus(world as never);

    // Released 4: 50/50 would ask for 2 female, but only 1 exists — the rest shifts to male.
    expect(cells.femaleAdults[0]).toBeCloseTo(0);
    expect(cells.maleAdults[0]).toBeCloseTo(7);
    expect(getMobileAdultCohorts()[0]).toMatchObject({ femaleAdults: 1 });
    expect(getMobileAdultCohorts()[0].maleAdults).toBeCloseTo(3);
  });

  it("blocks release entirely once a cell is already at MINIMUM_RURAL_COMMUNITY_POPULATION, even though the other three caps are positive", () => {
    // Values are exact negative powers of two so the total is exactly representable in
    // Float32Array, keeping populationFloorRoom exactly 0 rather than a rounding artifact.
    const cells = {
      i: new Uint16Array([0]),
      state: new Uint16Array([1]),
      children: new Float32Array([0.5]),
      maleAdults: new Float32Array([0.25]),
      femaleAdults: new Float32Array([0.125]),
      elders: new Float32Array([0]),
      pop: new Float32Array([0.875]) // below MINIMUM_RURAL_COMMUNITY_POPULATION already
    };
    const world = initWorld(cells);
    setMigratableAdults(new Float32Array([1]));
    setRuralReleasePressure(new Float32Array([1]));

    releaseRuralLaborSurplus(world as never);

    // sustainableAdultOutflow (0.5/15 ≈ 0.033) is positive, but populationFloorRoom is 0.
    expect(cells.maleAdults[0]).toBeCloseTo(0.25);
    expect(cells.femaleAdults[0]).toBeCloseTo(0.125);
    expect(getMobileAdultCohorts()).toHaveLength(0);
  });

  it("skips cells with no surplus under any cap, or no adults", () => {
    const cells = {
      i: new Uint16Array([0, 1]),
      state: new Uint16Array([1, 1]),
      children: new Float32Array([5, 5]),
      maleAdults: new Float32Array([3, 0]),
      femaleAdults: new Float32Array([3, 0]),
      elders: new Float32Array([1, 1]),
      pop: new Float32Array([12, 6])
    };
    const world = initWorld(cells);
    // Cell 0 has no migratable surplus this year; cell 1 has surplus but no adults to draw from.
    setMigratableAdults(new Float32Array([0, 4]));
    setRuralReleasePressure(new Float32Array([4, 4]));

    releaseRuralLaborSurplus(world as never);

    expect(cells.maleAdults[0]).toBe(3);
    expect(cells.femaleAdults[0]).toBe(3);
    expect(cells.maleAdults[1]).toBe(0);
    expect(cells.femaleAdults[1]).toBe(0);
    expect(getMobileAdultCohorts()).toHaveLength(0);
  });

  it("is a no-op when migratableAdults or ruralReleasePressure hasn't been sized for the current cells", () => {
    const cells = {
      i: new Uint16Array([0]),
      state: new Uint16Array([1]),
      children: new Float32Array([300]),
      maleAdults: new Float32Array([10]),
      femaleAdults: new Float32Array([10]),
      elders: new Float32Array([5]),
      pop: new Float32Array([325])
    };
    const world = initWorld(cells);
    // Left at economyContext's default empty arrays (length mismatch with cells.i).

    releaseRuralLaborSurplus(world as never);

    expect(cells.maleAdults[0]).toBe(10);
    expect(cells.femaleAdults[0]).toBe(10);
    expect(getMobileAdultCohorts()).toHaveLength(0);
  });
});
