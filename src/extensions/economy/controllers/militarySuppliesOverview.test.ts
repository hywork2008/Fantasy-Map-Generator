import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setGoods,
  setMetallurgAssetLedgers,
  setMilitaryResourceLedgers
} from "../economyContext";
import { getMilitarySuppliesOverviewState } from "../store/militarySuppliesOverviewState";
import { refreshMilitarySuppliesOverview } from "./militarySuppliesOverview";

describe("refreshMilitarySuppliesOverview", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 2;
    worldContext.options.military = [{ name: "cavalry", type: "mounted" }] as typeof worldContext.options.military;
    worldContext.pack = {
      states: [
        { i: 0 },
        { i: 1, name: "Ironmarch", military: [{ u: { cavalry: 60, infantry: 40 } }] },
        { i: 2, name: "Coastreach", military: [] }
      ]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Arms", tags: [], value: 1, unit: "set", icon: "arms", color: "#000" },
      { i: 2, name: "Muskets", tags: [], value: 1, unit: "set", icon: "arms", color: "#000" },
      { i: 3, name: "Artillery", tags: [], value: 1, unit: "piece", icon: "arms", color: "#000" }
    ]);
    setMetallurgAssetLedgers([
      {
        ownerKind: "state",
        ownerId: 1,
        productGoodId: 1,
        targetUnits: 20,
        serviceableUnits: 18.5,
        maintenanceBacklogWork: 0,
        lastSettledMonth: 1
      },
      {
        ownerKind: "state",
        ownerId: 1,
        productGoodId: 2,
        targetUnits: 10,
        serviceableUnits: 9,
        maintenanceBacklogWork: 0,
        lastSettledMonth: 1
      },
      {
        ownerKind: "state",
        ownerId: 1,
        productGoodId: 3,
        targetUnits: 4,
        serviceableUnits: 3,
        maintenanceBacklogWork: 0,
        lastSettledMonth: 1
      }
    ]);
    setMilitaryResourceLedgers([
      {
        stateId: 1,
        supplyMarketId: 1,
        annualDemand: {},
        lastConsumed: {},
        consumableStock: { arrows: 4.25, bullets: 2.5, gunpowder: 3.75 },
        unmetDemand: {}
      }
    ]);
  });

  afterEach(() => clearEconomyContext());

  it("combines State equipment, stockpiled consumables, and assigned mounts by state", () => {
    refreshMilitarySuppliesOverview();

    expect(getMilitarySuppliesOverviewState().rows).toEqual([
      {
        stateId: 2,
        stateName: "Coastreach",
        arms: 0,
        arrows: 0,
        mounts: 0,
        muskets: 0,
        bullets: 0,
        artillery: 0,
        gunpowder: 0
      },
      {
        stateId: 1,
        stateName: "Ironmarch",
        arms: 18.5,
        arrows: 4.25,
        mounts: 30,
        muskets: 9,
        bullets: 2.5,
        artillery: 3,
        gunpowder: 3.75
      }
    ]);
  });
});
