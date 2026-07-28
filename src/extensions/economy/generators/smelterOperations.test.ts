import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getSmelterOperations,
  initEconomyContext,
  setGoods,
  setMarkets,
  setMineOperations,
  setMineralDeposits
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { SmelterOperations } from "./smelterOperations";

describe("SmelterOperationsModule", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    simulationContext.frontier.cellStages = new Uint8Array([0, 0]);
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    worldContext.biomesData = { tags: [[], ["forest"]] } as typeof worldContext.biomesData;
    worldContext.pack = {
      burgs: [
        { i: 0, cell: 0, x: 0, y: 0, market: 0 },
        { i: 1, cell: 0, x: 0, y: 0, market: 1, state: 1 }
      ],
      states: [
        { i: 0, name: "Neutral" },
        { i: 1, name: "Test State", treasury: 10, supplyStrain: 0 }
      ],
      cells: {
        i: [0, 1],
        p: [
          [0, 0],
          [5, 0]
        ],
        c: [[1], [0]],
        biomeCode: Uint8Array.from([0, 1]),
        r: Uint16Array.from([0, 1]),
        state: Uint16Array.from([1, 1]),
        danger: Uint8Array.from([0, 0])
      }
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Iron Ore", tags: ["ore"], value: 2, unit: "wagon", icon: "iron", color: "#777" },
      { i: 2, name: "Iron Ingot", tags: ["ingot"], value: 4, unit: "wagon", icon: "iron", color: "#777" },
      { i: 3, name: "Coal", tags: ["mineral"], value: 1, unit: "wagon", icon: "coal", color: "#333" }
    ]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: { 1: { stock: 20, price: 2 } } }]);
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "bandedIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 100, annualCapacityTons: 120 }],
        richness: 2,
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
        workers: 10,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: true
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
    vi.restoreAllMocks();
  });

  it("places a smelter at the neighboring river-and-forest site, then refines bounded Ore stock", () => {
    SmelterOperations.generate();

    expect(getSmelterOperations()).toEqual([
      expect.objectContaining({
        depositId: 1,
        cell: 1,
        burgId: 1,
        marketId: 1,
        waterPower: 1,
        fuelAccess: 1,
        annualCapacityTons: 120,
        smeltingYield: 0.8,
        securityInvestment: 0,
        active: true
      })
    ]);

    SmelterOperations.produceMonth();

    expect(getMarkets()[0].goods[1].stock).toBe(10);
    expect(getMarkets()[0].goods[2].stock).toBe(8);
  });

  it("does not create a smelter for mines that produce only unsmelted fuel minerals", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "coalSeam",
        primaryCommodity: "coal",
        commodities: ["coal"],
        yields: [{ commodity: "coal", reserveTons: 100, annualCapacityTons: 120 }],
        richness: 2,
        depth: "surface",
        accessibility: 1,
        discovered: true,
        exhausted: false
      }
    ]);

    SmelterOperations.generate();

    expect(getSmelterOperations()).toEqual([]);
  });

  it("charges state-funded security and suppresses a guaranteed frontier theft roll", () => {
    worldContext.pack.cells.state = Uint16Array.from([0, 0]);
    worldContext.pack.cells.danger = Uint8Array.from([255, 255]);
    worldContext.pack.states[1].supplyStrain = 1;
    simulationContext.frontier.cellStages = new Uint8Array([0, 0]);
    SmelterOperations.generate();
    getSmelterOperations()[0].securityInvestment = 1;
    vi.spyOn(Math, "random").mockReturnValue(0);

    SmelterOperations.produceMonth();

    expect(worldContext.pack.states[1].treasury).toBe(8.7);
    expect(getSmelterOperations()[0]).toMatchObject({
      lastSecurityUpkeep: 1.3,
      lastTheftRisk: 0,
      lastTheftLoss: 0
    });
    expect(getMarkets()[0].goods[2].stock).toBe(8);
  });

  it("steals a bounded share of a newly refined batch in dangerous, unprotected frontier land", () => {
    worldContext.pack.cells.state = Uint16Array.from([0, 0]);
    worldContext.pack.cells.danger = Uint8Array.from([255, 255]);
    worldContext.pack.states[1].supplyStrain = 1;
    simulationContext.frontier.cellStages = new Uint8Array([0, 0]);
    SmelterOperations.generate();
    vi.spyOn(Math, "random").mockReturnValue(0);

    SmelterOperations.produceMonth();

    expect(getSmelterOperations()[0]).toMatchObject({
      lastSecurityUpkeep: 0,
      lastTheftRisk: 0.08,
      lastTheftLoss: 2
    });
    expect(getMarkets()[0].goods[2].stock).toBe(6);
  });
});
