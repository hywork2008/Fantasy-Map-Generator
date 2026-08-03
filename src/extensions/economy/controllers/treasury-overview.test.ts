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
    expect(monarchyRow).toMatchObject({
      stateName: "Testland",
      form: "Monarchy",
      publicTreasury: 500,
      rulerPersonal: 0, // no Characters/Nobility context in this test
      nominalDepartments: 350 + 150 + 120 + 50 + 80,
      household: 0,
      marshalcy: 350,
      chancery: 150,
      stewardship: 120,
      spymastery: 50,
      ecclesiastica: 80
    });

    const theocracyRow = rows.find(row => row.id === 2);
    expect(theocracyRow).toMatchObject({
      stateName: "Holyrealm",
      form: "Theocracy",
      publicTreasury: 80,
      marshalcy: 150,
      ecclesiastica: 480
    });

    // Sorted by public treasury stock, highest first (multi-ledger PR-1).
    expect(rows[0].id).toBe(1);
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
