import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getAdministrationEmployment,
  getBasicEmploymentSummary,
  getMineOperations,
  getSmelterOperations,
  initEconomyContext,
  setCraftEmploymentRecords,
  setMarkets,
  setMineOperations,
  setMineralDeposits,
  setSmelterOperations,
  setStrategicLaborMarkets
} from "../economyContext";
import { reconcileAnnualBasicEmploymentWorkers } from "./basicEmployment";

describe("reconcileAnnualBasicEmploymentWorkers", () => {
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

    reconcileAnnualBasicEmploymentWorkers();

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

    reconcileAnnualBasicEmploymentWorkers();

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

    reconcileAnnualBasicEmploymentWorkers();

    expect(getMineOperations()[0].workers).toBe(4);
  });

  it("ramps administration employment at a state's capital toward population+Burg-count demand", () => {
    setBurgs({ maleAdults: 100, femaleAdults: 100 });
    worldContext.pack.states = [
      undefined,
      { i: 1, name: "Test", capital: 1, burgs: 10, rural: 2000, urban: 3000, removed: false }
    ] as unknown as PackedGraph["states"];

    reconcileAnnualBasicEmploymentWorkers();

    // required = 4 + 5000*0.005 + 10*1 = 39; maxChange = max(1, 39*0.25) = 9.75 -> 0 to 9.75.
    const [record] = getAdministrationEmployment();
    expect(record).toMatchObject({ burgId: 1, stateId: 1 });
    expect(record.workers).toBeCloseTo(9.75, 5);
  });

  it("allocates administration before a mine sharing the same capital Burg", () => {
    setBurgs({ maleAdults: 5, femaleAdults: 5 });
    worldContext.pack.states = [
      undefined,
      { i: 1, name: "Test", capital: 1, burgs: 1, rural: 0, urban: 0, removed: false }
    ] as unknown as PackedGraph["states"];
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

    reconcileAnnualBasicEmploymentWorkers();

    // admin required = 4 + 0 + 1 = 5; maxChange = max(1, 5*0.25) = 1.25 -> 0 to 1.25.
    const [administration] = getAdministrationEmployment();
    expect(administration.workers).toBeCloseTo(1.25, 5);
    // remaining adults after admin = 10 - 1.25 = 8.75; mine's own step (8.5) fits within that.
    expect(getMineOperations()[0].workers).toBeCloseTo(8.5, 5);
  });

  it("drops the administration record once a state loses its capital Burg", () => {
    setBurgs({ maleAdults: 100, femaleAdults: 100 });
    worldContext.pack.states = [
      undefined,
      { i: 1, name: "Test", capital: 1, burgs: 1, rural: 0, urban: 0, removed: false }
    ] as unknown as PackedGraph["states"];

    reconcileAnnualBasicEmploymentWorkers();
    expect(getAdministrationEmployment()).toHaveLength(1);

    worldContext.pack.states = [
      undefined,
      { i: 1, name: "Test", capital: 1, burgs: 1, rural: 0, urban: 0, removed: true }
    ] as unknown as PackedGraph["states"];
    reconcileAnnualBasicEmploymentWorkers();

    expect(getAdministrationEmployment()).toHaveLength(0);
  });

  it("attributes a market's trade employment to its center Burg without an admin/mine/smelter slot", () => {
    setBurgs({ maleAdults: 100, femaleAdults: 100 });
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
    setStrategicLaborMarkets([
      {
        marketId: 1,
        workersByOccupation: { trade: 12 },
        wageByOccupation: {},
        skillByOccupation: {},
        capacityByOccupation: {}
      }
    ]);

    reconcileAnnualBasicEmploymentWorkers();

    // No admin/mine/smelter at this Burg — trade is the only contributor, and it is read
    // (not reallocated) so it does not draw on the Burg's own adult pool here.
    const [summary] = getBasicEmploymentSummary();
    expect(summary).toMatchObject({ burgId: 1, basicEmploymentDemand: 12 });
    expect(summary.serviceEmploymentDemand).toBeCloseTo(12 * 1.5, 5);
  });

  it("sums the non-trade strategic occupations (forestry/sailmaking/ropeMaking/tarBurning) into the center Burg's basicEmploymentDemand", () => {
    setBurgs({ maleAdults: 100, femaleAdults: 100 });
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
    setStrategicLaborMarkets([
      {
        marketId: 1,
        workersByOccupation: { forestry: 4, sailmaking: 2, ropeMaking: 1, tarBurning: 1, trade: 9 },
        wageByOccupation: {},
        skillByOccupation: {},
        capacityByOccupation: {}
      }
    ]);

    reconcileAnnualBasicEmploymentWorkers();

    // trade (9) is attributed separately from forestry+sailmaking+ropeMaking+tarBurning (4+2+1+1=8);
    // both are read (not reallocated), so basicEmploymentDemand = 9 + 8 = 17.
    const [summary] = getBasicEmploymentSummary();
    expect(summary).toMatchObject({ burgId: 1, basicEmploymentDemand: 17 });
  });

  it("attributes a Burg's craft employment record without an admin/mine/smelter slot", () => {
    setBurgs({ maleAdults: 100, femaleAdults: 100 });
    setCraftEmploymentRecords([{ burgId: 1, workers: 7 }]);

    reconcileAnnualBasicEmploymentWorkers();

    // Craft is read (not reallocated), like trade — it does not draw on the Burg's own adult pool.
    const [summary] = getBasicEmploymentSummary();
    expect(summary).toMatchObject({ burgId: 1, basicEmploymentDemand: 7 });
    expect(summary.serviceEmploymentDemand).toBeCloseTo(7 * 1.5, 5);
  });

  it("sums craft employment alongside admin/mine/smelter/trade into the same Burg's basicEmploymentDemand", () => {
    setBurgs({ maleAdults: 100, femaleAdults: 100 });
    worldContext.pack.states = [
      undefined,
      { i: 1, name: "Test", capital: 1, burgs: 1, rural: 0, urban: 0, removed: false }
    ] as unknown as PackedGraph["states"];
    setCraftEmploymentRecords([{ burgId: 1, workers: 3 }]);

    reconcileAnnualBasicEmploymentWorkers();

    // admin required = 4 + 0 + 1 = 5; maxChange = max(1, 5*0.25) = 1.25 -> 0 to 1.25.
    const [summary] = getBasicEmploymentSummary();
    expect(summary.basicEmploymentDemand).toBeCloseTo(1.25 + 3, 5);
  });

  it("derives serviceEmploymentDemand as 1.5x the Burg's basicEmploymentDemand subtotal", () => {
    setBurgs({ maleAdults: 100, femaleAdults: 100 });
    worldContext.pack.states = [
      undefined,
      { i: 1, name: "Test", capital: 1, burgs: 1, rural: 0, urban: 0, removed: false }
    ] as unknown as PackedGraph["states"];

    reconcileAnnualBasicEmploymentWorkers();

    // Only administration is present at this Burg (no mine/smelter): required = 4 + 0 + 1 = 5;
    // maxChange = max(1, 5*0.25) = 1.25 -> basicEmploymentDemand = 1.25.
    const [summary] = getBasicEmploymentSummary();
    expect(summary.burgId).toBe(1);
    expect(summary.basicEmploymentDemand).toBeCloseTo(1.25, 5);
    expect(summary.serviceEmploymentDemand).toBeCloseTo(1.25 * 1.5, 5);
  });
});
