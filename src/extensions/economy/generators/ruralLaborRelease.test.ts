import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, getMobileAdultCohorts, initEconomyContext, setMigratableAdults } from "../economyContext";
import { MINIMUM_RURAL_COMMUNITY_POPULATION, releaseRuralLaborSurplus } from "./ruralLaborRelease";

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
  it("moves the migratable surplus out of the cell, split by the cell's existing adult ratio", () => {
    const cells = {
      i: new Uint16Array([0]),
      state: new Uint16Array([7]),
      children: new Float32Array([10]),
      maleAdults: new Float32Array([12]),
      femaleAdults: new Float32Array([18]),
      elders: new Float32Array([5]),
      pop: new Float32Array([45])
    };
    const world = initWorld(cells);
    setMigratableAdults(new Float32Array([6]));

    releaseRuralLaborSurplus(world as never);

    // 6 released out of 30 adults, split 12:18 male:female → 2.4 male, 3.6 female.
    expect(cells.maleAdults[0]).toBeCloseTo(9.6);
    expect(cells.femaleAdults[0]).toBeCloseTo(14.4);
    expect(cells.children[0]).toBe(10);
    expect(cells.elders[0]).toBe(5);
    expect(cells.pop[0]).toBeCloseTo(39);

    const cohorts = getMobileAdultCohorts();
    expect(cohorts).toHaveLength(1);
    expect(cohorts[0]).toMatchObject({ originCell: 0, originState: 7, yearsSearching: 0 });
    expect(cohorts[0].maleAdults).toBeCloseTo(2.4);
    expect(cohorts[0].femaleAdults).toBeCloseTo(3.6);
  });

  it("never drains a cell below MINIMUM_RURAL_COMMUNITY_POPULATION even if migratableAdults allows more", () => {
    const cells = {
      i: new Uint16Array([0]),
      state: new Uint16Array([1]),
      children: new Float32Array([0]),
      maleAdults: new Float32Array([1]),
      femaleAdults: new Float32Array([1]),
      elders: new Float32Array([0]),
      pop: new Float32Array([2])
    };
    const world = initWorld(cells);
    // migratableAdults claims the whole adult stock is surplus (e.g. a stale/edge-case value);
    // the population floor must still protect MINIMUM_RURAL_COMMUNITY_POPULATION.
    setMigratableAdults(new Float32Array([2]));

    releaseRuralLaborSurplus(world as never);

    const totalAfter = cells.children[0] + cells.maleAdults[0] + cells.femaleAdults[0] + cells.elders[0];
    expect(totalAfter).toBeCloseTo(MINIMUM_RURAL_COMMUNITY_POPULATION);
    expect(getMobileAdultCohorts()).toHaveLength(1);
    expect(getMobileAdultCohorts()[0].maleAdults + getMobileAdultCohorts()[0].femaleAdults).toBeCloseTo(1);
  });

  it("skips cells with no migratable surplus or no adults", () => {
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
    // Cell 0 has no surplus this year; cell 1 has "surplus" but no adults to draw from.
    setMigratableAdults(new Float32Array([0, 4]));

    releaseRuralLaborSurplus(world as never);

    expect(cells.maleAdults[0]).toBe(3);
    expect(cells.femaleAdults[0]).toBe(3);
    expect(cells.maleAdults[1]).toBe(0);
    expect(cells.femaleAdults[1]).toBe(0);
    expect(getMobileAdultCohorts()).toHaveLength(0);
  });

  it("is a no-op when migratableAdults hasn't been sized for the current cells", () => {
    const cells = {
      i: new Uint16Array([0]),
      state: new Uint16Array([1]),
      children: new Float32Array([5]),
      maleAdults: new Float32Array([10]),
      femaleAdults: new Float32Array([10]),
      elders: new Float32Array([5]),
      pop: new Float32Array([30])
    };
    const world = initWorld(cells);
    // Left at economyContext's default empty array (length mismatch with cells.i).

    releaseRuralLaborSurplus(world as never);

    expect(cells.maleAdults[0]).toBe(10);
    expect(cells.femaleAdults[0]).toBe(10);
    expect(getMobileAdultCohorts()).toHaveLength(0);
  });
});
