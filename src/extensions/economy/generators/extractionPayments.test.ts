import { afterEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import { debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import { MINE_HEAD_PRICE_SHARE, MINING_ROYALTY_SHARE, settleExtractionPayment } from "./extractionPayments";
import type { Market } from "./marketTypes";
import { getSubsistenceWage } from "./subsistenceWage";

describe("settleExtractionPayment (docs/plan/farm-labour-calibration.md §13)", () => {
  // Markets.get() caches by id, so every test uses a fresh market id.
  let nextMarketId = 100;
  let market: Market;

  function setUp(state: Partial<State>, period = "highMedieval"): Burg {
    market = { i: nextMarketId++, centerBurgId: 1, color: "#fff", goods: {} } as Market;
    market.marketTreasury = { balance: 1_000_000, ruralGrainPayable: 0 };
    const burg = { i: 1, market: market.i, state: 1, population: 1, treasury: 0 } as unknown as Burg;
    worldContext.populationRate = 1000;
    worldContext.options = { ...(worldContext.options ?? {}), historicalPeriod: period } as never;
    worldContext.pack = {
      states: [{ i: 0 } as State, { i: 1, treasury: 0, ...state } as State],
      burgs: [{ i: 0 } as Burg, burg],
      cells: { i: [], h: [], pop: [], state: [] }
    } as unknown as PackedGraph;
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setMarkets([market]);
    debitHouseholdWealth(1, getHouseholdWealth(1));
    return burg;
  }

  afterEach(() => clearEconomyContext());

  it("pays the royalty to a monarchy, the wages to the town, the rest to the operators, and creates no money", () => {
    const burg = setUp({ form: "Monarchy", formName: "Kingdom" });
    const result = settleExtractionPayment({ marketId: market.i, burgId: 1, people: 1000, outputValue: 1000 });

    expect(result.paid).toBeCloseTo(1000 * MINE_HEAD_PRICE_SHARE, 2);
    expect(worldContext.pack.states[1].treasury).toBeCloseTo(result.paid * MINING_ROYALTY_SHARE, 2);
    // 1,000 people are one labour point.
    expect(result.wages).toBeCloseTo(Math.min(getSubsistenceWage(market), result.paid - result.royalty), 2);
    expect(getHouseholdWealth(1)).toBeCloseTo(result.wages, 2);
    expect(burg.treasury).toBeCloseTo(result.profit, 2);
    expect(market.marketTreasury!.balance + result.paid).toBeCloseTo(1_000_000, 2);
  });

  it("leaves a republic's royalty with the town", () => {
    const burg = setUp({ form: "Republic", formName: "Republic" });
    const result = settleExtractionPayment({ marketId: market.i, burgId: 1, people: 1000, outputValue: 1000 });

    expect(worldContext.pack.states[1].treasury).toBe(0);
    expect(burg.treasury).toBeCloseTo(result.royalty + result.profit, 2);
  });

  it("keeps unfree workers on rations in antiquity, and an empire takes the profit", () => {
    setUp({ form: "Monarchy", formName: "Empire" }, "classicalAntiquity");
    const result = settleExtractionPayment({ marketId: market.i, burgId: 1, people: 1000, outputValue: 1000 });

    expect(result.wages).toBeLessThan(getSubsistenceWage(market));
    expect(worldContext.pack.states[1].treasury).toBeCloseTo(result.royalty + result.profit, 2);
  });
});
