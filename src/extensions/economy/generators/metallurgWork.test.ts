import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getMetallurgAssetLedgers,
  getMetallurgMaterialForecasts,
  getMetallurgWorkOrders,
  initEconomyContext,
  setCaravans,
  setGoods,
  setMarkets
} from "../economyContext";
import { Markets } from "./markets-generator";
import type { Caravan } from "./marketTypes";
import { MetallurgWork } from "./metallurgWork";

describe("MetallurgWorkModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.options = {
      year: 500,
      month: 1,
      military: [
        { name: "cavalry", type: "mounted" },
        { name: "archers", type: "ranged" },
        { name: "musketeers", type: "ranged" }
      ]
    } as typeof worldContext.options;
    worldContext.pack = {
      burgs: [{ i: 0 }, { i: 1, cell: 0, x: 0, y: 0, state: 1, market: 1, population: 100 }],
      states: [{ i: 0 }, { i: 1, military: [{ i: 1, u: { cavalry: 10, archers: 20, musketeers: 30 } }] }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Iron Ingot", tags: ["metal"], value: 3, unit: "ton", icon: "iron", color: "#777" },
      { i: 2, name: "Charcoal", tags: ["fuel"], value: 1, unit: "pile", icon: "coal", color: "#333" },
      { i: 3, name: "Leather", tags: ["material"], value: 2, unit: "hide", icon: "leather", color: "#654" },
      {
        i: 4,
        name: "Arms",
        tags: ["military"],
        value: 24,
        unit: "set",
        icon: "arms",
        color: "#333",
        recipes: [{ 1: 0.5, 2: 1, 3: 0.5 }]
      },
      {
        i: 5,
        name: "Harnesses",
        tags: ["military"],
        value: 10,
        unit: "set",
        icon: "harness",
        color: "#a52",
        recipes: [{ 1: 0.25, 3: 0.5 }]
      },
      {
        i: 6,
        name: "Tools",
        tags: ["utilities"],
        value: 14,
        unit: "set",
        icon: "tools",
        color: "#777",
        recipes: [{ 1: 0.5, 2: 1 }]
      },
      {
        i: 7,
        name: "Arrows",
        tags: ["military"],
        value: 3,
        unit: "quiver",
        icon: "arrows",
        color: "#852",
        recipes: [{ 1: 0.1 }]
      },
      {
        i: 8,
        name: "Bullets",
        tags: ["military"],
        value: 6,
        unit: "pouch",
        icon: "bullets",
        color: "#555",
        recipes: [{ 1: 1 }]
      }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.01, price: 3 },
          2: { stock: 0.01, price: 1 },
          3: { stock: 0.01, price: 2 }
        }
      }
    ]);
  });

  afterEach(() => clearEconomyContext());

  it("seeds existing military and urban assets without inventing a startup rearmament order", () => {
    MetallurgWork.generate();

    expect(getMetallurgAssetLedgers()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerKind: "state",
          ownerId: 1,
          productGoodId: 4,
          targetUnits: 60,
          serviceableUnits: 60
        }),
        expect.objectContaining({
          ownerKind: "burg",
          ownerId: 1,
          productGoodId: 6,
          targetUnits: 6.25,
          serviceableUnits: 6.25
        })
      ])
    );
    expect(getMetallurgWorkOrders()).toEqual([]);
  });

  it("creates recurring military and urban maintenance plus material shortages once per month", () => {
    MetallurgWork.generate();

    expect(MetallurgWork.settleMonthly()).toBe(true);
    expect(MetallurgWork.settleMonthly()).toBe(false);

    const orders = getMetallurgWorkOrders();
    expect(orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerKind: "state",
          productGoodId: 4,
          kind: "maintenance",
          status: "waitingMaterials"
        }),
        expect.objectContaining({
          ownerKind: "state",
          productGoodId: 7,
          kind: "consumable",
          status: "waitingMaterials"
        }),
        expect.objectContaining({
          ownerKind: "burg",
          productGoodId: 6,
          kind: "maintenance",
          status: "waitingMaterials"
        })
      ])
    );
    expect(getMetallurgMaterialForecasts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ marketId: 1, goodId: 1, projectedShortage: expect.any(Number) })
      ])
    );
    expect(getMetallurgMaterialForecasts().some(forecast => forecast.projectedShortage > 0)).toBe(true);
    expect(Array.from(MetallurgWork.getProductionDemandByGood(1).values())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ goodId: 4, priorityCycles: 2 }),
        expect.objectContaining({ goodId: 7, priorityCycles: 2 })
      ])
    );
  });

  it("subtracts actual inbound merchant cargo from the material purchase recommendation", () => {
    MetallurgWork.generate();
    setCaravans([
      {
        i: 9,
        seller: 2,
        sellerType: "market",
        buyer: 1,
        buyerType: "market",
        payload: [{ goodId: 1, dealId: 9, units: 2, value: 6 }],
        state: "transit"
      } as Caravan
    ]);

    MetallurgWork.settleMonthly();

    const iron = getMetallurgMaterialForecasts().find(forecast => forecast.marketId === 1 && forecast.goodId === 1);
    expect(iron).toMatchObject({ inboundUnits: 2 });
    expect(iron?.projectedShortage).toBeLessThan(iron?.requiredUnits ?? 0);
  });

  it("turns population and force growth into one additional new-build order on the next month", () => {
    MetallurgWork.generate();
    MetallurgWork.settleMonthly();
    worldContext.options = { ...worldContext.options, month: 2 };
    worldContext.pack.burgs[1].population = 200;
    worldContext.pack.states[1].military = [{ i: 1, u: { cavalry: 10, archers: 20, musketeers: 40 } }];

    MetallurgWork.settleMonthly();

    expect(getMetallurgWorkOrders()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerKind: "state", productGoodId: 4, kind: "newBuild", requestedUnits: 10 }),
        expect.objectContaining({ ownerKind: "burg", productGoodId: 6, kind: "newBuild", requestedUnits: 6.25 })
      ])
    );
  });

  it("settles finished market goods into work orders and clears the matching maintenance backlog", () => {
    MetallurgWork.generate();
    MetallurgWork.settleMonthly();
    getMarkets()[0].goods[4] = { stock: 3, price: 24 };
    Markets.sync();

    expect(MetallurgWork.fulfillFromMarkets()).toBe(true);

    const armsRepair = getMetallurgWorkOrders().find(
      order => order.ownerKind === "state" && order.productGoodId === 4 && order.kind === "maintenance"
    );
    expect(armsRepair).toMatchObject({ status: "completed" });
    expect(getMarkets()[0].goods[4].stock).toBeLessThan(3);
    expect(
      getMetallurgAssetLedgers().find(
        asset => asset.ownerKind === "state" && asset.ownerId === 1 && asset.productGoodId === 4
      )?.maintenanceBacklogWork
    ).toBe(0);
  });
});
