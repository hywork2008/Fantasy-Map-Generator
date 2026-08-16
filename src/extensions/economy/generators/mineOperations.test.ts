import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getMineOperations,
  getMineralDeposits,
  initEconomyContext,
  setGoodCellColumn,
  setGoods,
  setMarketCellColumn,
  setMarkets,
  setMineOperations,
  setMineralDeposits
} from "../economyContext";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { getMineDrainageFactor, getMineDrainageRequirement, MineOperations } from "./mineOperations";

describe("MineOperationsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 1, cell: 0, x: 0, y: 0, market: 1 }],
      cells: {
        i: [0],
        p: [[0, 0]],
        h: Uint8Array.from([55]),
        r: Uint16Array.from([0]),
        routes: {}
      }
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Lead Ore", tags: ["ore"], value: 3, unit: "wagon", icon: "lead", color: "#777" },
      { i: 2, name: "Silver Ore", tags: ["ore"], value: 20, unit: "bullion", icon: "silver", color: "#ccc" }
    ]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
    setGoodCellColumn(new Uint16Array([0]));
    setMarketCellColumn(new Uint16Array([1]));
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => clearEconomyContext());

  it("creates an accessible operation and supplies every co-product to its market", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "polymetallicVein",
        primaryCommodity: "lead",
        commodities: ["lead", "silver"],
        yields: [
          { commodity: "lead", reserveTons: 100, annualCapacityTons: 120 },
          { commodity: "silver", reserveTons: 20, annualCapacityTons: 12 }
        ],
        richness: 2,
        depth: "surface",
        accessibility: 1,
        discovered: false,
        exhausted: false
      }
    ]);

    MineOperations.generate();
    MineOperations.produceMonth();

    expect(getMineOperations()).toHaveLength(1);
    expect(getMineralDeposits()[0].discovered).toBe(true);
    expect(getMineralDeposits()[0].yields[0].reserveTons).toBeLessThan(100);
    expect(getMarkets()[0].goods[1].stock).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[2].stock).toBeGreaterThan(0);
  });

  it("keeps unclaimed deposits undiscovered when frontier market coverage reaches them", () => {
    const previousPattern = worldContext.options.initialSettlementPattern;
    worldContext.options.initialSettlementPattern = "frontier";
    worldContext.pack.cells.state = Uint16Array.from([0]);
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "bandedIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 100, annualCapacityTons: 10 }],
        richness: 2,
        depth: "surface",
        accessibility: 1,
        discovered: false,
        exhausted: false
      }
    ]);

    try {
      MineOperations.generate();
      expect(getMineOperations()).toHaveLength(0);
      expect(getMineralDeposits()[0].discovered).toBe(false);
    } finally {
      worldContext.options.initialSettlementPattern = previousPattern;
    }
  });

  it("prefers river panning for a reachable placer-gold discovery", () => {
    worldContext.pack = {
      burgs: [],
      cells: {
        i: [0, 1, 2],
        p: [
          [0, 0],
          [1, 0],
          [2, 0]
        ],
        c: [[1], [0, 2], [1]],
        h: Uint8Array.from([40, 40, 55]),
        r: Uint16Array.from([7, 7, 0]),
        state: Uint16Array.from([1, 0, 0])
      }
    } as unknown as PackedGraph;
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 1,
        type: "placer",
        primaryCommodity: "gold",
        commodities: ["gold"],
        yields: [{ commodity: "gold", reserveTons: 10, annualCapacityTons: 1 }],
        richness: 2,
        depth: "surface",
        accessibility: 0.5,
        discovered: false,
        exhausted: false
      },
      {
        i: 2,
        districtId: 2,
        cell: 2,
        type: "bandedIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 100, annualCapacityTons: 10 }],
        richness: 5,
        depth: "deep",
        accessibility: 0.5,
        discovered: false,
        exhausted: false
      }
    ]);

    const result = MineOperations.prospectForState({
      stateId: 1,
      geography: 100,
      engineering: 0,
      surveyAdvantage: 0,
      random: () => 0
    });

    expect(result).toMatchObject({ discovered: true, cellId: 1, commodity: "gold", method: "riverPanning" });
    expect(getMineralDeposits()[0].discovered).toBe(true);
    expect(getMineralDeposits()[1].discovered).toBe(false);
  });

  it("does not survey through another State's territory", () => {
    worldContext.pack = {
      burgs: [],
      cells: {
        i: [0, 1, 2],
        p: [
          [0, 0],
          [1, 0],
          [2, 0]
        ],
        c: [[1], [0, 2], [1]],
        h: Uint8Array.from([40, 40, 40]),
        r: Uint16Array.from([3, 3, 3]),
        state: Uint16Array.from([1, 2, 0])
      }
    } as unknown as PackedGraph;
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 2,
        type: "placer",
        primaryCommodity: "gold",
        commodities: ["gold"],
        yields: [{ commodity: "gold", reserveTons: 10, annualCapacityTons: 1 }],
        richness: 2,
        depth: "surface",
        accessibility: 0.5,
        discovered: false,
        exhausted: false
      }
    ]);

    expect(
      MineOperations.prospectForState({
        stateId: 1,
        geography: 100,
        engineering: 100,
        surveyAdvantage: 100,
        random: () => 0
      })
    ).toEqual({ discovered: false });
  });

  it("uses a magnetic anomaly for a sufficiently skilled engineering survey", () => {
    worldContext.pack = {
      burgs: [],
      cells: {
        i: [0, 1],
        p: [
          [0, 0],
          [1, 0]
        ],
        c: [[1], [0]],
        h: Uint8Array.from([55, 55]),
        r: Uint16Array.from([0, 0]),
        state: Uint16Array.from([1, 0])
      }
    } as unknown as PackedGraph;
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 1,
        type: "bandedIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 100, annualCapacityTons: 10 }],
        richness: 4,
        depth: "shallow",
        surveyEvidence: ["ironOxideOutcrop", "magneticAnomaly"],
        accessibility: 0.5,
        discovered: false,
        exhausted: false
      }
    ]);

    expect(
      MineOperations.prospectForState({
        stateId: 1,
        geography: 0,
        engineering: 80,
        surveyAdvantage: 0,
        random: () => 0
      })
    ).toMatchObject({ discovered: true, cellId: 1, commodity: "iron", method: "magneticSurvey" });
  });

  it("uses wetland signs for bog iron when Geography is stronger than Engineering", () => {
    worldContext.pack = {
      burgs: [],
      cells: {
        i: [0, 1],
        p: [
          [0, 0],
          [1, 0]
        ],
        c: [[1], [0]],
        h: Uint8Array.from([40, 35]),
        r: Uint16Array.from([0, 0]),
        state: Uint16Array.from([1, 0])
      }
    } as unknown as PackedGraph;
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 1,
        type: "bogIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 30, annualCapacityTons: 5 }],
        richness: 1,
        depth: "surface",
        surveyEvidence: ["bogIron"],
        accessibility: 0.5,
        discovered: false,
        exhausted: false
      }
    ]);

    expect(
      MineOperations.prospectForState({
        stateId: 1,
        geography: 100,
        engineering: 0,
        surveyAdvantage: 0,
        random: () => 0
      })
    ).toMatchObject({ discovered: true, cellId: 1, commodity: "iron", method: "wetlandSurvey" });
  });

  it("replenishes bog iron without marking the renewable deposit exhausted", () => {
    setGoods([{ i: 1, name: "Iron Ore", tags: ["ore"], value: 3, unit: "wagon", icon: "iron", color: "#777" }]);
    Goods.sync();
    Markets.sync();
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "bogIron",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [
          {
            commodity: "iron",
            reserveTons: 0,
            annualCapacityTons: 12,
            annualRechargeTons: 12,
            reserveCeilingTons: 36
          }
        ],
        richness: 1,
        depth: "surface",
        accessibility: 1,
        discovered: false,
        exhausted: false
      }
    ]);

    MineOperations.generate();
    MineOperations.produceMonth();

    expect(getMineralDeposits()[0].exhausted).toBe(false);
    expect(getMineOperations()[0].active).toBe(true);
    expect(getMarkets()[0].goods[1].stock).toBeGreaterThan(0);
  });

  it("exhausts a deposit instead of supplying it indefinitely", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "polymetallicVein",
        primaryCommodity: "lead",
        commodities: ["lead"],
        yields: [{ commodity: "lead", reserveTons: 0.1, annualCapacityTons: 120 }],
        richness: 1,
        depth: "surface",
        accessibility: 1,
        discovered: false,
        exhausted: false
      }
    ]);

    MineOperations.generate();
    MineOperations.produceMonth();
    const stockAfterExhaustion = getMarkets()[0].goods[1].stock;
    MineOperations.produceMonth();

    expect(getMineralDeposits()[0].exhausted).toBe(true);
    expect(getMineOperations()[0].active).toBe(false);
    expect(getMarkets()[0].goods[1].stock).toBe(stockAfterExhaustion);
  });

  it("keeps low-accessibility deposits hidden initially, then opens them through prospecting", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "polymetallicVein",
        primaryCommodity: "lead",
        commodities: ["lead"],
        yields: [{ commodity: "lead", reserveTons: 100, annualCapacityTons: 120 }],
        richness: 1,
        depth: "deep",
        accessibility: 0.35,
        discovered: false,
        exhausted: false
      }
    ]);

    MineOperations.generate();
    const result = MineOperations.prospect();

    expect(getMineOperations()).toHaveLength(1);
    expect(result.discovered).toBe(1);
    expect(getMineralDeposits()[0].discovered).toBe(true);
    expect(getMineOperations()[0]).toMatchObject({ technology: 1.1, drainage: 0.7, fuelAccess: 0.7 });
  });

  it("reduces deep-mine output drainage in wet river cells while preserving legacy deposits", () => {
    const dryLegacyDeposit = { depth: "deep" as const };
    const wetRiverDeposit = { depth: "deep" as const, groundwaterPressure: 0.9 };
    const operation = { drainage: 0.7 };

    expect(getMineDrainageRequirement(dryLegacyDeposit)).toBe(1);
    expect(getMineDrainageFactor(operation, dryLegacyDeposit)).toBeCloseTo(0.7, 5);
    expect(getMineDrainageRequirement(wetRiverDeposit)).toBeGreaterThan(1);
    expect(getMineDrainageFactor(operation, wetRiverDeposit)).toBeLessThan(0.7);
  });

  it("reattaches an opened mine to the market that now covers its deposit and supplies that market", () => {
    worldContext.pack = {
      burgs: [{ i: 0 }, { i: 1, cell: 0, x: 0, y: 0, market: 1 }, { i: 2, cell: 1, x: 10, y: 0, market: 2 }],
      cells: {
        i: [0, 1],
        p: [
          [0, 0],
          [10, 0]
        ],
        h: Uint8Array.from([55, 55]),
        r: Uint16Array.from([0, 0]),
        routes: {}
      }
    } as unknown as PackedGraph;
    setGoods([{ i: 1, name: "Iron Ore", tags: ["ore"], value: 2, unit: "wagon", icon: "iron", color: "#777" }]);
    setMarkets([
      { i: 1, centerBurgId: 1, color: "#111", goods: {} },
      { i: 2, centerBurgId: 2, color: "#222", goods: {} }
    ]);
    setGoodCellColumn(new Uint16Array([0, 0]));
    setMarketCellColumn(new Uint16Array([1, 2]));
    Goods.sync();
    Markets.sync();
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 1,
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
        workers: 0,
        technology: 1,
        drainage: 1,
        fuelAccess: 1,
        annualOutputTons: {},
        active: true
      }
    ]);

    expect(MineOperations.reanchorOperations()).toBe(1);
    expect(getMineOperations()[0]).toEqual(
      expect.objectContaining({ burgId: 2, marketId: 2, workers: 16, active: true })
    );

    MineOperations.produceMonth();

    expect(getMarkets()[0].goods[1]).toBeUndefined();
    expect(getMarkets()[1].goods[1].stock).toBeGreaterThan(0);
  });

  it("applies groundwater pressure to the monthly output of a deep mine", () => {
    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "polymetallicVein",
        primaryCommodity: "lead",
        commodities: ["lead"],
        yields: [{ commodity: "lead", reserveTons: 100, annualCapacityTons: 120 }],
        richness: 1,
        depth: "deep",
        groundwaterPressure: 0.9,
        accessibility: 1,
        discovered: false,
        exhausted: false
      }
    ]);

    MineOperations.generate();
    MineOperations.produceMonth();

    // A dry deep mine's 0.5 drainage supplies 5 units/month from this 120/year deposit.
    expect(getMarkets()[0].goods[1].stock).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[1].stock).toBeLessThan(5);
  });

  it("commissions a trail to the network for a disconnected deposit instead of leaving it stuck at base accessibility", () => {
    worldContext.pack = {
      burgs: [{ i: 0 }, { i: 1, cell: 1, x: 10, y: 0, state: 1, market: 1, feature: 1 }],
      cells: {
        c: [[1], [0]],
        h: Uint8Array.from([25, 25]),
        r: Uint16Array.from([0, 0]),
        biomeCode: [1, 1],
        p: [
          [0, 0],
          [10, 0]
        ],
        burg: [0, 1],
        f: [1, 1],
        state: [1, 1],
        routes: {}
      },
      routes: []
    } as unknown as PackedGraph;
    worldContext.biomesData = { habitability: [0, 100] } as unknown as typeof worldContext.biomesData;
    // Replacing worldContext.pack drops every economy slice beforeEach() set on the old pack
    // object (goods/markets/columns all live on the economy slice, keyed off the current
    // pack) — recreate what prospect() needs against the new fixture.
    setGoods([{ i: 1, name: "Iron Ore", tags: ["ore"], value: 3, unit: "wagon", icon: "iron", color: "#777" }]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
    setGoodCellColumn(new Uint16Array([0, 0]));
    setMarketCellColumn(new Uint16Array([1, 1]));

    setMineralDeposits([
      {
        i: 1,
        districtId: 1,
        cell: 0,
        type: "polymetallicVein",
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [{ commodity: "iron", reserveTons: 100, annualCapacityTons: 120 }],
        richness: 1,
        depth: "surface",
        accessibility: 0.35,
        discovered: false,
        exhausted: false
      }
    ]);

    expect(worldContext.pack.cells.routes[0]).toBeUndefined();

    const result = MineOperations.prospect();

    expect(result.connected).toBe(1);
    expect(worldContext.pack.cells.routes[0]).toBeDefined();
    // base 0.35 + the newly commissioned route's 0.25 — no river/haven in this fixture.
    expect(getMineralDeposits()[0].accessibility).toBeCloseTo(0.6, 5);
    expect(getMineOperations()).toHaveLength(1);
  });
});
