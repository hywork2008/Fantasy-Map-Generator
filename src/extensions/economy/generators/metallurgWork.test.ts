import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGoods,
  getMarkets,
  getMetallurgAssetLedgers,
  getMetallurgMaterialForecasts,
  getMetallurgWorkOrders,
  initEconomyContext,
  setCaravans,
  setGoods,
  setMarkets,
  setMetallurgAssetLedgers,
  setMetallurgToolsUnitScaleVersion,
  setMetallurgWorkOrders
} from "../economyContext";
import { Markets } from "./markets-generator";
import type { Caravan } from "./marketTypes";
import { MetallurgWork } from "./metallurgWork";
import { MilitaryResources } from "./militaryResources";

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
      },
      {
        i: 9,
        name: "Muskets",
        tags: ["military"],
        value: 30,
        unit: "piece",
        icon: "musket",
        color: "#5a3d2b",
        recipes: [{ 1: 1, 2: 1 }]
      },
      {
        i: 10,
        name: "Gunpowder",
        tags: ["military"],
        value: 4,
        unit: "barrel",
        icon: "gunpowder",
        color: "#333",
        recipes: [{ 2: 1 }]
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
        // Arms now covers only the non-firearm troops (cavalry 10 + archers 20); the 30
        // musketeers draw the dedicated Muskets plan below instead (militaryResources.ts's
        // matching arms/muskets demand split).
        expect.objectContaining({
          ownerKind: "state",
          ownerId: 1,
          productGoodId: 4,
          targetUnits: 30,
          serviceableUnits: 30
        }),
        expect.objectContaining({
          ownerKind: "state",
          ownerId: 1,
          productGoodId: 9,
          targetUnits: 30,
          serviceableUnits: 30
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

  it("starts firearm equipment at zero and creates state procurement orders when configured", () => {
    worldContext.options.initialFirearmsUnstocked = true;
    worldContext.pack.states[1].military = [{ i: 1, u: { cavalry: 10, archers: 20, musketeers: 30, artillery: 2 } }];
    setGoods([
      ...getGoods(),
      {
        i: 11,
        name: "Artillery",
        tags: ["military"],
        value: 120,
        unit: "cannon",
        icon: "good-artillery",
        color: "#cd7f32",
        recipes: [{ 1: 2, 2: 1 }]
      }
    ]);

    MetallurgWork.generate();
    MetallurgWork.settleMonthly();

    expect(getMetallurgAssetLedgers()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerKind: "state", ownerId: 1, productGoodId: 4, serviceableUnits: 32 }),
        expect.objectContaining({ ownerKind: "state", ownerId: 1, productGoodId: 9, serviceableUnits: 0 }),
        expect.objectContaining({ ownerKind: "state", ownerId: 1, productGoodId: 11, serviceableUnits: 0 })
      ])
    );
    expect(getMetallurgWorkOrders()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerKind: "state",
          ownerId: 1,
          productGoodId: 9,
          kind: "newBuild",
          requestedUnits: 30
        }),
        expect.objectContaining({
          ownerKind: "state",
          ownerId: 1,
          productGoodId: 11,
          kind: "newBuild",
          requestedUnits: 2
        })
      ])
    );
  });

  it("normalizes burg Tools demand by populationRate", () => {
    worldContext.populationRate = 1000;

    MetallurgWork.generate();

    expect(getMetallurgAssetLedgers()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerKind: "burg",
          ownerId: 1,
          productGoodId: 6,
          targetUnits: 6.25,
          serviceableUnits: 6.25
        })
      ])
    );
  });

  it("migrates a legacy populationRate-inflated Tools asset when the saved burg omits population", () => {
    worldContext.populationRate = 1000;
    setMetallurgAssetLedgers([
      {
        ownerKind: "state",
        ownerId: 1,
        productGoodId: 4,
        targetUnits: 30,
        serviceableUnits: 30,
        maintenanceBacklogWork: 0,
        lastSettledMonth: 6000
      },
      {
        ownerKind: "burg",
        ownerId: 1,
        productGoodId: 6,
        targetUnits: 6250,
        serviceableUnits: 6250,
        maintenanceBacklogWork: 30,
        lastSettledMonth: 6000
      }
    ]);
    worldContext.pack.burgs[1].population = undefined;
    setMetallurgToolsUnitScaleVersion(0);

    expect(MetallurgWork.migrateLegacyToolsUnitScale()).toBe(true);
    expect(getMetallurgAssetLedgers()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerKind: "state", ownerId: 1, productGoodId: 4, targetUnits: 30 }),
        expect.objectContaining({
          ownerKind: "burg",
          ownerId: 1,
          productGoodId: 6,
          targetUnits: 6.25,
          serviceableUnits: 6.25,
          maintenanceBacklogWork: 0
        })
      ])
    );
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
          ownerKind: "state",
          productGoodId: 10,
          kind: "consumable",
          requestedUnits: expect.any(Number),
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
    expect(
      orders.find(order => order.ownerKind === "state" && order.productGoodId === 10 && order.kind === "consumable")
        ?.requestedUnits
    ).toBeGreaterThan(0);
    expect(getMetallurgMaterialForecasts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ marketId: 1, goodId: 1, projectedShortage: expect.any(Number) })
      ])
    );
    expect(getMetallurgMaterialForecasts().some(forecast => forecast.projectedShortage > 0)).toBe(true);
    expect(Array.from(MetallurgWork.getProductionDemandByGood(1).values())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ goodId: 4, priorityCycles: 2, stateFunded: true }),
        expect.objectContaining({ goodId: 7, priorityCycles: 2, stateFunded: true }),
        // State military orders promote renewable inputs as well as finished equipment, so
        // Charcoal can be remade after the first local reserve is consumed.
        expect.objectContaining({ goodId: 2, priorityCycles: 2, stateFunded: true })
      ])
    );
    const ordersById = new Map(orders.map(order => [order.id, order]));
    expect(
      MetallurgWork.getStateMaterialForecasts().every(forecast =>
        forecast.workOrderIds.every(orderId => {
          return ordersById.get(orderId)?.ownerKind === "state";
        })
      )
    ).toBe(true);
  });

  it("keeps consumable work equal to the stockpile gap instead of adding another full reserve each month", () => {
    MilitaryResources.generate();
    MetallurgWork.generate();
    MetallurgWork.settleMonthly();
    const bullets = getGoods().find(good => good.name === "Bullets")!;
    const initialOrder = getMetallurgWorkOrders().find(
      order => order.ownerKind === "state" && order.productGoodId === bullets.i && order.kind === "consumable"
    )!;
    const annualDemand = MilitaryResources.getAnnualDemandForState(1).bullets!;

    MilitaryResources.recordFinishedGoodsDelivery(1, "Bullets", annualDemand / 2);
    const originalYear = worldContext.options.year;
    worldContext.options.year += 1;

    expect(MetallurgWork.settleMonthly()).toBe(true);

    const updatedOrder = getMetallurgWorkOrders().find(order => order.id === initialOrder.id)!;
    expect(updatedOrder.requestedUnits - updatedOrder.completedUnits).toBeCloseTo(annualDemand / 2, 4);
    worldContext.options.year = originalYear;
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
        // Cavalry (10) and archers (20) didn't grow, so Arms' target is unchanged; the new
        // musketeers (30 -> 40) show up as a Muskets newBuild order instead (productGoodId 9).
        expect.objectContaining({ ownerKind: "state", productGoodId: 9, kind: "newBuild", requestedUnits: 10 }),
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

  it("aligns State orders with the military supply market and accepts finished Goods from another State market", () => {
    worldContext.options.initialFirearmsUnstocked = true;
    worldContext.pack.burgs.push({
      i: 2,
      cell: 1,
      x: 10,
      y: 10,
      state: 1,
      market: 2,
      population: 200
    });
    setMarkets([
      ...getMarkets(),
      {
        i: 2,
        centerBurgId: 2,
        color: "#222",
        goods: {
          1: { stock: 0.01, price: 3 },
          2: { stock: 0.01, price: 1 }
        }
      }
    ]);
    MetallurgWork.generate();
    MetallurgWork.settleMonthly();

    const muskets = getGoods().find(good => good.name === "Muskets")!;
    expect(
      getMetallurgWorkOrders().filter(order => order.ownerKind === "state" && order.status !== "completed")
    ).toEqual(expect.arrayContaining([expect.objectContaining({ destinationMarketId: 2 })]));

    // The selected supply market is 2, but this finished batch was made in the smaller State city.
    getMarkets()[0].goods[muskets.i] = { stock: 6, price: muskets.value };
    Markets.sync();
    expect(MetallurgWork.fulfillFromMarkets()).toBe(true);

    expect(getMarkets()[0].goods[muskets.i].stock).toBeLessThan(6);
    expect(
      getMetallurgAssetLedgers().find(
        asset => asset.ownerKind === "state" && asset.ownerId === 1 && asset.productGoodId === muskets.i
      )?.serviceableUnits
    ).toBeGreaterThan(0);
  });

  it("stages domestic military materials at the arsenal market before manufacture", () => {
    worldContext.pack.burgs.push({
      i: 2,
      cell: 1,
      x: 10,
      y: 10,
      state: 1,
      market: 2,
      population: 80
    });
    setMarkets([
      ...getMarkets(),
      {
        i: 2,
        centerBurgId: 2,
        color: "#222",
        goods: {
          1: { stock: 9, price: 3 },
          2: { stock: 9, price: 1 }
        }
      }
    ]);
    setMetallurgWorkOrders([
      {
        id: 1,
        ownerKind: "state",
        ownerId: 1,
        destinationMarketId: 1,
        productGoodId: 9,
        kind: "newBuild",
        recipeIndex: 0,
        requestedUnits: 3,
        completedUnits: 0,
        plannedWork: 3.9,
        completedWork: 0,
        materials: [
          { goodId: 1, units: 3 },
          { goodId: 2, units: 3 }
        ],
        status: "waitingMaterials",
        createdMonth: 6000,
        updatedMonth: 6000
      }
    ]);

    expect(MetallurgWork.stageStateMilitaryMaterials()).toBe(true);
    expect(getMarkets()[0].goods[1].stock).toBe(3);
    expect(getMarkets()[0].goods[2].stock).toBe(3);
    expect(getMarkets()[1].goods[1].stock).toBeCloseTo(6.01, 4);
    expect(getMarkets()[1].goods[2].stock).toBeCloseTo(6.01, 4);
  });
});
