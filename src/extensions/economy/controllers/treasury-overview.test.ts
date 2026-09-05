import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { allocateTreasury, clearTreasuryAllocationSnapshots } from "../generators/treasuryAllocation";
import { getTreasuryOverviewState } from "../store/treasuryOverviewState";
import { refreshTreasuryOverview } from "./treasury-overview";

describe("refreshTreasuryOverview", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
    clearTreasuryAllocationSnapshots();
  });

  it("builds one row per State from the last allocateTreasury() snapshot", () => {
    const monarchy = {
      i: 1,
      form: "Monarchy",
      diplomacy: [],
      name: "Testland",
      treasury: 500
    } as unknown as State;
    const theocracy = {
      i: 2,
      form: "Theocracy",
      diplomacy: [],
      name: "Holyrealm",
      treasury: 80
    } as unknown as State;
    worldContext.pack = { states: [undefined, monarchy, theocracy] } as unknown as PackedGraph;

    allocateTreasury(monarchy, 1000);
    allocateTreasury(theocracy, 1000);

    refreshTreasuryOverview();

    const rows = getTreasuryOverviewState().rows;
    expect(rows).toHaveLength(2);

    const monarchyRow = rows.find(row => row.id === 1);
    // Starting public 500: HH takes 250 → L1; remaining 250 pro-rata to depts (desired 750).
    expect(monarchyRow).toMatchObject({
      stateName: "Testland",
      form: "Monarchy",
      publicTreasury: 0,
      householdPurse: 250,
      departmentBalancesStock: 250,
      rulerPersonal: 0,
      nominalDepartments: 350 + 150 + 80 + 40 + 60 + 70,
      household: 0,
      marshalcy: 350,
      chancery: 150,
      stewardship: 80,
      spymastery: 40,
      ecclesiastica: 60,
      publicWorks: 70
    });

    const theocracyRow = rows.find(row => row.id === 2);
    // Starting public 80: Theocracy HH desired 80 → all to L1; depts get 0.
    expect(theocracyRow).toMatchObject({
      stateName: "Holyrealm",
      form: "Theocracy",
      publicTreasury: 0,
      householdPurse: 80,
      departmentBalancesStock: 0,
      marshalcy: 150,
      ecclesiastica: 430
    });

    // Both public 0; sort falls back to marshalcy (monarchy 350 > theocracy 150).
    expect(rows[0].id).toBe(1);
  });

  it("surfaces per-department service level and budget multiplier (PR-17b/17c/17e)", () => {
    const state = {
      i: 1,
      form: "Theocracy",
      diplomacy: [],
      name: "Holyrealm",
      treasury: 100000,
      departmentBudgetMultiplier: { chancery: 0.7 }
    } as unknown as State;
    worldContext.pack = { states: [undefined, state] } as unknown as PackedGraph;

    allocateTreasury(state, 1000);
    refreshTreasuryOverview();

    const row = getTreasuryOverviewState().rows.find(r => r.id === 1);
    // Fully-funded first cycle → EWMA stays at the healthy default (1) for every department.
    expect(row).toMatchObject({
      chanceryServiceLevel: 1,
      stewardshipServiceLevel: 1,
      spymasteryServiceLevel: 1,
      ecclesiasticaServiceLevel: 1,
      chanceryBudgetMultiplier: 0.7,
      stewardshipBudgetMultiplier: 1,
      spymasteryBudgetMultiplier: 1,
      ecclesiasticaBudgetMultiplier: 1,
      departmentBalanceRemit: 0,
      diplomaticReliability: 100, // PR-17g default until chanceryDiplomacy.ts's updateDiplomaticReliability() runs
      religiousUnrest: 0 // PR-17h default until ecclesiasticaUnrest.ts's updateReligiousUnrest() runs
    });
  });

  it("skips a snapshot whose State has since been removed", () => {
    const state = { i: 1, form: "Monarchy", diplomacy: [], name: "Testland", removed: true } as unknown as State;
    worldContext.pack = { states: [undefined, state] } as unknown as PackedGraph;

    allocateTreasury(state, 1000);
    refreshTreasuryOverview();

    expect(getTreasuryOverviewState().rows).toHaveLength(0);
  });

  it("produces no rows once snapshots are cleared", () => {
    const state = { i: 1, form: "Monarchy", diplomacy: [], name: "Testland" } as unknown as State;
    worldContext.pack = { states: [undefined, state] } as unknown as PackedGraph;

    allocateTreasury(state, 1000);
    clearTreasuryAllocationSnapshots();
    refreshTreasuryOverview();

    expect(getTreasuryOverviewState().rows).toHaveLength(0);
  });
});
