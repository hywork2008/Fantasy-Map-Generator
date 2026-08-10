import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setGoods,
  setMarkets,
  setMetallurgMaterialForecasts,
  setMetallurgWorkOrders
} from "../economyContext";
import { getMetallurgWorkOverviewState } from "../store/metallurgWorkOverviewState";
import { refreshMetallurgWorkOverview } from "./metallurgWorkOverview";

describe("refreshMetallurgWorkOverview", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 0 }, { i: 1, name: "Forge Town", cell: 0, x: 0, y: 0, market: 1, state: 1 }],
      states: [{ i: 0 }, { i: 1, name: "Ironmarch" }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Arms", tags: ["military"], value: 24, unit: "set", icon: "arms", color: "#333" },
      { i: 2, name: "Iron Ingot", tags: ["metal"], value: 3, unit: "ton", icon: "iron", color: "#777" }
    ]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: { 2: { stock: 2, price: 3 } } }]);
    setMetallurgWorkOrders([
      {
        id: 1,
        ownerKind: "state",
        ownerId: 1,
        destinationMarketId: 1,
        productGoodId: 1,
        kind: "maintenance",
        recipeIndex: 0,
        requestedUnits: 8,
        completedUnits: 2,
        plannedWork: 4,
        completedWork: 1,
        materials: [{ goodId: 2, units: 4 }],
        status: "waitingMaterials",
        createdMonth: 6000,
        updatedMonth: 6000
      }
    ]);
    setMetallurgMaterialForecasts([
      {
        marketId: 1,
        goodId: 2,
        requiredUnits: 4,
        availableMarketStock: 2,
        inboundUnits: 0,
        projectedShortage: 2,
        workOrderIds: [1]
      }
    ]);
  });

  afterEach(() => clearEconomyContext());

  it("renders persisted queue and material forecast values without recomputing them", () => {
    refreshMetallurgWorkOverview();

    expect(getMetallurgWorkOverviewState()).toMatchObject({
      queuedWork: 3,
      blockedWork: 3,
      shortageCount: 1,
      orders: [
        expect.objectContaining({
          ownerName: "Ironmarch",
          productName: "Arms",
          remainingUnits: 6,
          materialCoverage: 0.5
        })
      ],
      materials: [
        expect.objectContaining({ marketName: "Forge Town", materialName: "Iron Ingot", projectedShortage: 2 })
      ]
    });
  });
});
