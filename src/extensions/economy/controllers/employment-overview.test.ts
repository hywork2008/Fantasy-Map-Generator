import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setAdministrationEmployment,
  setBasicEmploymentSummary,
  setMarkets,
  setMineOperations,
  setSmelterOperations,
  setStrategicLaborMarkets
} from "../economyContext";
import { getEmploymentOverviewState } from "../store/employmentOverviewState";
import { refreshEmploymentOverview } from "./employment-overview";

describe("refreshEmploymentOverview", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [
        undefined,
        { i: 1, cell: 0, x: 0, y: 0, name: "Capital City", state: 1, capital: 1, market: 1, removed: false },
        { i: 2, cell: 1, x: 1, y: 1, name: "Mining Town", state: 1, market: 2, removed: false }
      ],
      states: [undefined, { i: 1, name: "Testland" }]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("builds one row per Burg, combining administration/mining/smelting/trade into the basic total", () => {
    setAdministrationEmployment([{ burgId: 1, stateId: 1, workers: 10 }]);
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 2,
        marketId: 2,
        workers: 20,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: true
      }
    ]);
    setSmelterOperations([]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
    setStrategicLaborMarkets([
      {
        marketId: 1,
        workersByOccupation: { trade: 5 },
        wageByOccupation: {},
        skillByOccupation: {},
        capacityByOccupation: {}
      }
    ]);
    setBasicEmploymentSummary([
      { burgId: 1, basicEmploymentDemand: 15, serviceEmploymentDemand: 22.5 },
      { burgId: 2, basicEmploymentDemand: 20, serviceEmploymentDemand: 30 }
    ]);

    refreshEmploymentOverview();

    const rows = getEmploymentOverviewState().rows;
    expect(rows).toHaveLength(2);

    const capital = rows.find(row => row.id === 1);
    expect(capital).toMatchObject({
      burgId: 1,
      burgName: "Capital City",
      stateId: 1,
      stateName: "Testland",
      isCapital: true,
      administration: 10,
      mining: 0,
      trade: 5,
      basicEmploymentDemand: 15,
      serviceEmploymentDemand: 22.5,
      employmentDemand: 37.5,
      employmentFocus: "—" // no demographics → no labor ledger
    });

    const miningTown = rows.find(row => row.id === 2);
    expect(miningTown).toMatchObject({
      burgName: "Mining Town",
      isCapital: false,
      administration: 0,
      mining: 20,
      basicEmploymentDemand: 20,
      employmentDemand: 50
    });
  });

  it("fills residual/focus from demographics and sorts by residual first", () => {
    worldContext.pack = {
      burgs: [
        undefined,
        {
          i: 1,
          cell: 0,
          x: 0,
          y: 0,
          name: "Busy Town",
          state: 1,
          capital: 1,
          removed: false,
          population: 5,
          demographics: {
            capacity: 200,
            children: 10,
            maleAdults: 30,
            femaleAdults: 30,
            elders: 5
          }
        },
        {
          i: 2,
          cell: 1,
          x: 1,
          y: 1,
          name: "Idle Town",
          state: 1,
          removed: false,
          population: 8,
          demographics: {
            capacity: 400,
            children: 20,
            maleAdults: 50,
            femaleAdults: 50,
            elders: 10
          }
        }
      ],
      states: [undefined, { i: 1, name: "Testland" }]
    } as unknown as PackedGraph;
    setBasicEmploymentSummary([
      { burgId: 1, basicEmploymentDemand: 40, serviceEmploymentDemand: 60 },
      { burgId: 2, basicEmploymentDemand: 0, serviceEmploymentDemand: 0 }
    ]);
    setAdministrationEmployment([{ burgId: 1, stateId: 1, workers: 40 }]);

    refreshEmploymentOverview();

    const rows = getEmploymentOverviewState().rows;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const idle = rows.find(row => row.id === 2);
    const busy = rows.find(row => row.id === 1);
    expect(idle?.laborResidual).toBeGreaterThan(busy?.laborResidual ?? 0);
    expect(idle?.employmentFocus).not.toBe("—");
    expect(idle?.marketLaborForce).toBeGreaterThan(0);
    // Sorted by residual descending
    expect(rows[0].laborResidual).toBeGreaterThanOrEqual(rows[1].laborResidual);
  });

  it("excludes inactive mine/smelter operations from the sub-breakdown", () => {
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 2,
        marketId: 2,
        workers: 20,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: false
      }
    ]);
    setBasicEmploymentSummary([{ burgId: 2, basicEmploymentDemand: 0, serviceEmploymentDemand: 0 }]);

    refreshEmploymentOverview();

    const rows = getEmploymentOverviewState().rows;
    expect(rows.find(row => row.id === 2)?.mining).toBe(0);
  });
});
