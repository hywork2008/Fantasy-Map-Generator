import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setAdministrationEmployment,
  setCraftEmploymentRecords,
  setFarmLaborRequired,
  setHuntingWorkers,
  setMigratableAdults
} from "../economyContext";
import { getStateEmploymentOverviewState } from "../store/stateEmploymentOverviewState";
import { refreshStateEmploymentOverview } from "./state-employment-overview";

describe("refreshStateEmploymentOverview", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 10;
    worldContext.pack = {
      cells: {
        i: [0, 1, 2],
        state: [1, 1, 2],
        maleAdults: [10, 5, 8],
        femaleAdults: [10, 5, 8]
      },
      burgs: [
        undefined,
        {
          i: 1,
          cell: 0,
          x: 0,
          y: 0,
          name: "Capital City",
          state: 1,
          capital: 1,
          removed: false,
          population: 5,
          demographics: { capacity: 100, children: 5, maleAdults: 20, femaleAdults: 20, elders: 5 }
        }
      ],
      states: [undefined, { i: 1, name: "Testland" }, { i: 2, name: "Farmreach" }]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("rolls up rural cells by cells.state, unaffected by whether the state has any Burg", () => {
    // Population points: farmLaborRequired/migratableAdults per cell.
    setFarmLaborRequired(new Float32Array([5, 2, 3]));
    setMigratableAdults(new Float32Array([2, 1, 1]));
    setHuntingWorkers(new Float32Array([1, 0, 0])); // real headcount, not scaled by populationRate

    refreshStateEmploymentOverview();

    const rows = getStateEmploymentOverviewState().rows;
    const farmreach = rows.find(row => row.stateId === 2);
    // State 2 has no Burg — figures come from cell 2 alone, scaled by populationRate (10).
    expect(farmreach).toMatchObject({
      stateName: "Farmreach",
      ruralPopulation: 160, // (8 + 8) * 10
      ruralEmployed: 30, // 3 * 10
      ruralSurplus: 10, // 1 * 10
      urbanPopulation: 0,
      administration: 0
    });
    expect(farmreach?.totalLaborForce).toBe(farmreach?.ruralPopulation);
    expect(farmreach?.totalSurplus).toBe(farmreach?.ruralSurplus);
    expect(farmreach?.unemploymentPct).toBeCloseTo(6.25, 1);

    const testland = rows.find(row => row.stateId === 1);
    // Cells 0 and 1 both belong to State 1.
    expect(testland?.ruralPopulation).toBe(300); // (10+10 + 5+5) * 10
    expect(testland?.ruralEmployed).toBe(70); // (5 + 2) * 10
    expect(testland?.ruralSurplus).toBe(30); // (2 + 1) * 10
    expect(testland?.huntingWorkers).toBe(1); // real headcount, summed as-is
  });

  it("adds the urban ledger (administration/craft/etc.) on top of the rural ledger for the same State", () => {
    setAdministrationEmployment([{ burgId: 1, stateId: 1, workers: 12 }]);
    setCraftEmploymentRecords([{ burgId: 1, workers: 4 }]);
    setFarmLaborRequired(new Float32Array([1, 1, 1]));
    setMigratableAdults(new Float32Array([0, 0, 0]));

    refreshStateEmploymentOverview();

    const testland = getStateEmploymentOverviewState().rows.find(row => row.stateId === 1);
    expect(testland?.administration).toBe(12);
    expect(testland?.craft).toBe(4);
    expect(testland?.urbanPopulation).toBeGreaterThan(0);
    // Internal consistency: totals are exactly rural + urban, not recomputed independently.
    expect(testland?.totalLaborForce).toBeCloseTo(
      (testland?.ruralPopulation ?? 0) + (testland?.urbanPopulation ?? 0),
      5
    );
    expect(testland?.totalSurplus).toBeCloseTo((testland?.ruralSurplus ?? 0) + (testland?.urbanSurplus ?? 0), 5);
  });

  it("sorts rows by unemployment percentage, highest first", () => {
    setFarmLaborRequired(new Float32Array([5, 2, 3]));
    setMigratableAdults(new Float32Array([2, 1, 8])); // state 2 (cell 2) gets a much larger surplus share

    refreshStateEmploymentOverview();

    const rows = getStateEmploymentOverviewState().rows;
    expect(rows[0].unemploymentPct).toBeGreaterThanOrEqual(rows[1].unemploymentPct);
  });

  it("excludes removed/unassigned States and rural-only cells with state 0", () => {
    worldContext.pack = {
      cells: {
        i: [0, 1],
        state: [0, 1], // cell 0 unassigned — must not create a phantom "State 0" row
        maleAdults: [10, 5],
        femaleAdults: [10, 5]
      },
      burgs: [],
      states: [undefined, { i: 1, name: "Testland" }]
    } as unknown as PackedGraph;

    refreshStateEmploymentOverview();

    const rows = getStateEmploymentOverviewState().rows;
    expect(rows.every(row => row.stateId !== 0)).toBe(true);
  });
});
