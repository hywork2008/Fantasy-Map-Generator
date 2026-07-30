import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMineOperations,
  getSmelterOperations,
  initEconomyContext,
  setMineOperations,
  setMineralDeposits,
  setSmelterOperations
} from "../economyContext";
import { reconcileAnnualIndustrialWorkers } from "./basicEmployment";

describe("reconcileAnnualIndustrialWorkers", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
  });

  afterEach(() => clearEconomyContext());

  function setBurgs(demographics: { maleAdults: number; femaleAdults: number }): void {
    worldContext.pack = {
      burgs: [
        undefined,
        {
          i: 1,
          cell: 0,
          x: 0,
          y: 0,
          market: 1,
          population: 0,
          demographics: { ...demographics, capacity: 1000, children: 0, elders: 0 }
        }
      ]
    } as unknown as PackedGraph;
  }

  it("ramps a single mine's workers toward the deposit's full requirement, bounded by the annual step", () => {
    setBurgs({ maleAdults: 100, femaleAdults: 100 });
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "bandedIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 100, annualCapacityTons: 120 }],
        richness: 5,
        depth: "surface",
        accessibility: 1,
        discovered: true,
        exhausted: false
      }
    ]);
    // richness 5 -> required workers = 4 + 5*6 = 34; starts far below that.
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 1,
        marketId: 1,
        workers: 4,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: true
      }
    ]);

    reconcileAnnualIndustrialWorkers();

    // maxChange = max(1, 34 * 0.25) = 8.5 -> workers moves from 4 to 12.5.
    expect(getMineOperations()[0].workers).toBeCloseTo(12.5, 5);
  });

  it("allocates the shared Burg adult pool to the mine before the smelter", () => {
    setBurgs({ maleAdults: 5, femaleAdults: 5 });
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "bandedIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 100, annualCapacityTons: 120 }],
        richness: 5,
        depth: "surface",
        accessibility: 1,
        discovered: true,
        exhausted: false
      }
    ]);
    // Both start at 0 (fully reconciled down previously); Burg has only 10 adults total.
    // Mine required = 4 + 5*6 = 34, smelter required = 4 + 120*0.05 = 10.
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 1,
        marketId: 1,
        workers: 0,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: true
      }
    ]);
    setSmelterOperations([
      {
        i: 1,
        depositId: 1,
        cell: 0,
        burgId: 1,
        marketId: 1,
        waterPower: 1,
        fuelAccess: 1,
        technology: 1,
        smeltingYield: 0.8,
        annualCapacityTons: 120,
        workers: 0,
        securityInvestment: 0,
        lastSecurityUpkeep: 0,
        lastTheftLoss: 0,
        lastTheftRisk: 0,
        active: true
      }
    ]);

    reconcileAnnualIndustrialWorkers();

    // Mine's annual step (max(1, 34*0.25)=8.5) is fully available (desired=min(34,10)=10),
    // leaving 1.5 adults for the smelter, whose own step (max(1, 10*0.25)=2.5) easily covers it.
    const mine = getMineOperations()[0];
    const smelter = getSmelterOperations()[0];
    expect(mine.workers).toBeCloseTo(8.5, 5);
    expect(smelter.workers).toBeCloseTo(1.5, 5);
    expect(mine.workers + smelter.workers).toBeCloseTo(10, 5);
  });

  it("leaves inactive operations untouched", () => {
    setBurgs({ maleAdults: 100, femaleAdults: 100 });
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "bandedIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 0, annualCapacityTons: 120 }],
        richness: 5,
        depth: "surface",
        accessibility: 1,
        discovered: true,
        exhausted: true
      }
    ]);
    setMineOperations([
      {
        i: 1,
        depositId: 1,
        burgId: 1,
        marketId: 1,
        workers: 4,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: false
      }
    ]);

    reconcileAnnualIndustrialWorkers();

    expect(getMineOperations()[0].workers).toBe(4);
  });
});
