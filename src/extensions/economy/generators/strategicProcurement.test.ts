import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { Caravans } from "./caravans";
import type { Good } from "./goods-generator";
import type { Market } from "./marketTypes";
import { StrategicProcurementModule } from "./strategicProcurement";
import { TradeAnimation } from "./trade-animation";

const demand = {
  source: "shipbuilding" as const,
  stateId: 1,
  destinationMarketId: 1,
  annualMaterials: { Wood: 0.4, Sails: 0, Ropes: 0, Tar: 0 }
};

function setupWorld({ treasury = 100, sourceStateId = 1 }: { treasury?: number; sourceStateId?: number } = {}): void {
  const destination: Market = { i: 1, centerBurgId: 1, color: "#111", goods: { 1: { stock: 0, price: 10 } } };
  const source: Market = { i: 2, centerBurgId: 2, color: "#222", goods: { 1: { stock: 1, price: 10 } } };
  const stateOne: State = {
    i: 1,
    name: "Harbor State",
    treasury,
    salesTax: 0,
    diplomacy: [undefined, "x", "Enemy"]
  } as State;
  const stateTwo: State = {
    i: 2,
    name: "Enemy State",
    salesTax: 0,
    diplomacy: [undefined, "Enemy", "x"]
  } as State;

  worldContext.graphWidth = 100;
  worldContext.graphHeight = 100;
  worldContext.distanceScale = 1;
  worldContext.options = { month: 1, gunpowderEraEnabled: true } as typeof worldContext.options;
  worldContext.pack = {
    goods: [
      {
        i: 1,
        name: "Wood",
        value: 10,
        tags: ["construction"],
        unit: "pile",
        icon: "wood",
        color: "#663"
      } as Good
    ],
    markets: [destination, source],
    burgs: [
      { i: 0 } as Burg,
      { i: 1, state: 1, cell: 1, x: 10, y: 0 } as Burg,
      { i: 2, state: sourceStateId, cell: 2, x: 0, y: 0 } as Burg
    ],
    states: [{ i: 0 } as State, stateOne, stateTwo],
    deals: [],
    caravans: [],
    strategicProcurementOrders: [],
    strategicGoodsPolicies: [],
    nextStrategicProcurementOrderId: 0
  } as unknown as PackedGraph;
}

describe("StrategicProcurementModule", () => {
  let procurement: StrategicProcurementModule;

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    vi.spyOn(TradeAnimation, "findRoutePath").mockReturnValue(null);
    procurement = new StrategicProcurementModule();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearEconomyContext();
  });

  it("pays the state treasury, removes only supplier surplus, and fulfills stock only when its Caravan arrives", () => {
    setupWorld();

    procurement.handleShipbuildingDemand(demand);

    const order = procurement.getOrders()[0];
    expect(order).toMatchObject({
      stateId: 1,
      destinationMarketId: 1,
      goodId: 1,
      requestedUnits: 0.4,
      sourceMarketId: 2,
      status: "inTransit"
    });
    // The state pays the landed price: supplier price plus the route's transport cost.
    expect(worldContext.pack.states[1].treasury).toBeCloseTo(95.86, 2);
    expect(worldContext.pack.burgs[2].treasury).toBe(4);
    expect(worldContext.pack.markets[1].goods[1].stock).toBe(0.6);
    expect(worldContext.pack.markets[0].goods[1].stock).toBe(0);
    expect(worldContext.pack.caravans).toHaveLength(1);
    expect(procurement.getShipbuildingProcurementStatus(1, 1).find(status => status.material === "Wood")).toMatchObject(
      {
        inTransit: 0.4,
        sourceStateId: 1
      }
    );

    const caravanTick = Caravans.tick(1);
    procurement.reconcileCaravans(caravanTick.arrived, caravanTick.lost);

    expect(worldContext.pack.markets[0].goods[1].stock).toBe(0.4);
    expect(order).toMatchObject({ fulfilledUnits: 0.4, status: "fulfilled" });
    expect(procurement.getShipbuildingProcurementStatus(1, 1).find(status => status.material === "Wood")).toMatchObject(
      {
        inTransit: 0,
        sourceStateId: null
      }
    );
  });

  it("does not create duplicate active orders for repeated demand signals", () => {
    setupWorld();

    procurement.handleShipbuildingDemand(demand);
    procurement.handleShipbuildingDemand(demand);

    expect(procurement.getOrders()).toHaveLength(1);
    expect(worldContext.pack.caravans).toHaveLength(1);
  });

  it("records a foreign-policy block when only an Enemy source can supply the material", () => {
    setupWorld({ sourceStateId: 2 });

    procurement.handleShipbuildingDemand(demand);

    expect(procurement.getOrders()).toMatchObject([{ status: "blocked", blockedReason: "foreignPolicy" }]);
    expect(worldContext.pack.markets[1].goods[1].stock).toBe(1);
    expect(worldContext.pack.caravans).toHaveLength(0);
  });

  it("records insufficient treasury without creating cargo or inventory", () => {
    setupWorld({ treasury: 3 });

    procurement.handleShipbuildingDemand(demand);

    expect(procurement.getOrders()).toMatchObject([{ status: "blocked", blockedReason: "insufficientTreasury" }]);
    expect(worldContext.pack.states[1].treasury).toBe(3);
    expect(worldContext.pack.markets[1].goods[1].stock).toBe(1);
    expect(worldContext.pack.markets[0].goods[1].stock).toBe(0);
    expect(worldContext.pack.caravans).toHaveLength(0);
  });
});
