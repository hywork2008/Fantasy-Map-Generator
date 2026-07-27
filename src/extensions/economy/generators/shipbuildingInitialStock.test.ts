import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, ShipbuildingStrategicProcurementDemand, State } from "../../hostTypes";
import { clearEconomyContext, getMarkets, initEconomyContext } from "../economyContext";
import type { Good } from "./goods-generator";
import type { Market } from "./marketTypes";
import { seedShipbuildingInitialStock } from "./shipbuildingInitialStock";

const WOOD_GOOD_ID = 1;
const TAR_GOOD_ID = 2;

/**
 * Three states exercising §4.6's two independent access paths:
 * - State 1 "Rich Port State": high treasury + a port, desert biome (no raw-material self-sufficiency).
 * - State 2 "Poor Unconnected State": no treasury, no port, desert biome — hits the floor on both paths.
 * - State 3 "Naval Self-Sufficient State": no treasury, no port, but its land is 100% forest
 *   (Wood's biomeOutput biome) and its market's center burg is Naval-cultured.
 */
function setupWorld(): void {
  const woodGood = {
    i: WOOD_GOOD_ID,
    name: "Wood",
    value: 1,
    tags: ["construction"],
    unit: "pile",
    icon: "wood",
    color: "#663",
    biomeOutput: { 6: 0.1 }
  } as Good;
  const tarGood = {
    i: TAR_GOOD_ID,
    name: "Tar",
    value: 2,
    tags: ["naval"],
    unit: "barrel",
    icon: "tar",
    color: "#727272"
  } as Good;

  const burgs: Burg[] = [
    {} as Burg, // index 0 unused
    { i: 1, state: 1, market: 1, port: 1, type: "Generic", cell: 1, x: 0, y: 0 } as Burg,
    { i: 2, state: 2, market: 2, port: 0, type: "Generic", cell: 2, x: 0, y: 0 } as Burg,
    { i: 3, state: 3, market: 3, port: 0, type: "Naval", cell: 3, x: 0, y: 0 } as Burg
  ];

  const markets: Market[] = [
    { i: 1, centerBurgId: 1, color: "#1", goods: {} },
    { i: 2, centerBurgId: 2, color: "#2", goods: {} },
    { i: 3, centerBurgId: 3, color: "#3", goods: {} }
  ];

  const states: State[] = [
    {} as State, // index 0 neutral
    { i: 1, name: "Rich Port State", treasury: 200 } as State,
    { i: 2, name: "Poor Unconnected State", treasury: 0 } as State,
    { i: 3, name: "Naval Self-Sufficient State", treasury: 0 } as State
  ];

  worldContext.pack = {
    goods: [woodGood, tarGood],
    markets,
    burgs,
    states,
    cells: {
      i: [0, 1, 2, 3],
      h: [0, 50, 50, 50], // cell 0 is water; 1-3 are land, one per state
      state: [0, 1, 2, 3],
      biomeCode: [0, 1, 1, 6] // state1/2 sit on desert (1, not in Wood's biomeOutput); state3 on biome 6 (forest)
    }
  } as unknown as PackedGraph;
}

function demandFor(stateId: number, marketId: number): ShipbuildingStrategicProcurementDemand {
  return {
    source: "shipbuilding",
    stateId,
    destinationMarketId: marketId,
    annualMaterials: { Wood: 1, Sails: 0, Ropes: 0, Tar: 1 }
  };
}

describe("seedShipbuildingInitialStock", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("does nothing for an empty demand list", () => {
    setupWorld();
    seedShipbuildingInitialStock([]);
    expect(getMarkets()[0].goods).toEqual({});
  });

  it("gives a wealthy, well-ported state a mid-range stock, biased toward the intermediate good (Tar over Wood)", () => {
    setupWorld();

    seedShipbuildingInitialStock([demandFor(1, 1)]);

    const goods = getMarkets()[0].goods;
    expect(goods[WOOD_GOOD_ID]).toEqual({ stock: 0.59, price: 1 });
    expect(goods[TAR_GOOD_ID]).toEqual({ stock: 1.09, price: 2 });
    // Same access score, but Tar (intermediate) reserves more days than Wood (raw material).
    expect(goods[TAR_GOOD_ID].stock).toBeGreaterThan(goods[WOOD_GOOD_ID].stock);
  });

  it("floors a poor, portless, biome-unsuited state at the baseline reserve — no material bias applies there", () => {
    setupWorld();

    seedShipbuildingInitialStock([demandFor(2, 2)]);

    const goods = getMarkets()[1].goods;
    // accessScore is 0 here, so days = MIN_RESERVE_DAYS regardless of raw-vs-intermediate bias.
    expect(goods[WOOD_GOOD_ID]).toEqual({ stock: 0.25, price: 1 });
    expect(goods[TAR_GOOD_ID]).toEqual({ stock: 0.25, price: 2 });
  });

  it("gives a poor, portless but self-sufficient Naval state a healthy stock via candidate②, without any wealth", () => {
    setupWorld();

    seedShipbuildingInitialStock([demandFor(3, 3)]);

    const goods = getMarkets()[2].goods;
    expect(goods[WOOD_GOOD_ID]).toEqual({ stock: 0.7, price: 1 });
    expect(goods[TAR_GOOD_ID]).toEqual({ stock: 1.38, price: 2 });
  });

  it("never lowers stock that Production.produce()'s first cycle already placed above the computed target", () => {
    setupWorld();
    getMarkets()[1].goods[WOOD_GOOD_ID] = { stock: 999, price: 50 };

    seedShipbuildingInitialStock([demandFor(2, 2)]);

    expect(getMarkets()[1].goods[WOOD_GOOD_ID]).toEqual({ stock: 999, price: 50 });
  });

  it("skips a demand whose market or state no longer exists, without throwing", () => {
    setupWorld();

    expect(() => seedShipbuildingInitialStock([demandFor(1, 999)])).not.toThrow();
    expect(getMarkets()[0].goods).toEqual({});
  });

  describe("abundant-stock console.warn", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("warns for a state whose accessScore clears the threshold (wealth+port path)", () => {
      setupWorld();

      seedShipbuildingInitialStock([demandFor(1, 1)]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message] = warnSpy.mock.calls[0];
      expect(message).toContain("Rich Port State");
      expect(message).toContain("market 1");
      expect(message).toContain("Wood=0.59");
      expect(message).toContain("Tar=1.09");
    });

    it("warns for a state whose accessScore clears the threshold via the self-sufficiency path", () => {
      setupWorld();

      seedShipbuildingInitialStock([demandFor(3, 3)]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain("Naval Self-Sufficient State");
    });

    it("does not warn for a state floored at the baseline reserve (accessScore 0)", () => {
      setupWorld();

      seedShipbuildingInitialStock([demandFor(2, 2)]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("reports the actual final stock in the warning, even when pre-existing stock already exceeded the computed target", () => {
      setupWorld();
      getMarkets()[0].goods[WOOD_GOOD_ID] = { stock: 5, price: 3 };

      seedShipbuildingInitialStock([demandFor(1, 1)]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain("Wood=5");
      // Pre-existing stock/price above the computed target is left untouched by seeding.
      expect(getMarkets()[0].goods[WOOD_GOOD_ID]).toEqual({ stock: 5, price: 3 });
    });
  });
});
