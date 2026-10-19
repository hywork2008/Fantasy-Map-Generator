import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import type { Market } from "./marketTypes";
import {
  hearPriceGapRumour,
  housesPresentIn,
  knownPrice,
  openBranch,
  RUMOUR_BRANCH_DAYS,
  recordMarketPriceSnapshot,
  seedForeignFactories,
  seedMerchantBranches
} from "./merchantIntelligence";

const market = (i: number, price: number) =>
  ({ i, centerBurgId: i, goods: { 7: { stock: 10, price } } }) as unknown as Market;

describe("merchantIntelligence", () => {
  const sim: { tickCount: number; extensions?: object } = { tickCount: 0 };
  beforeEach(() => {
    delete sim.extensions;
    initEconomyContext({ worldContext, simulationContext: sim } as unknown as ExtensionAPI);
    Object.assign(simulationContext, { extensions: {} });
  });
  afterEach(() => clearEconomyContext());

  it("knows home prices now and branch prices only as old as the journey home", () => {
    const markets = [market(1, 10), market(2, 20)];
    setMarkets(markets);
    sim.tickCount = 0;
    recordMarketPriceSnapshot();
    markets[1].goods[7].price = 50; // the branch market's price rises a month later
    sim.tickCount = 30;
    recordMarketPriceSnapshot();
    sim.tickCount = 40;
    // 20 days away: the newest letter old enough left at tick 0, so the rise is not yet known.
    expect(knownPrice(1, 2, 7, 20, 50)).toBe(20);
    // 5 days away: the tick-30 letter has arrived.
    expect(knownPrice(1, 2, 7, 5, 50)).toBe(50);
    expect(knownPrice(1, 1, 7, 0, 10)).toBe(10);
  });

  it("trades only between markets where one house has agents, and opens branches where its caravans arrive", () => {
    setMarkets([market(1, 10), market(2, 20), market(3, 30), market(4, 40), market(5, 50)]);
    const days: Record<string, number> = { "1-2": 5, "1-3": 10, "1-4": 15, "1-5": 80 };
    const between = (a: number, b: number) => days[`${Math.min(a, b)}-${Math.max(a, b)}`] ?? null;
    seedMerchantBranches(between, 50);
    expect(housesPresentIn(1, 4)).toContain(1);
    expect(housesPresentIn(1, 5)).not.toContain(1); // beyond reach: no agent there
    openBranch(1, 5);
    expect(housesPresentIn(1, 5)).toContain(1);
  });

  it("places factories in the nearest foreign capitals within reach, sparing enemies", () => {
    setMarkets([market(1, 10), market(2, 20), market(3, 30), market(4, 40), market(5, 50)]);
    worldContext.pack = {
      burgs: [{}, ...[1, 2, 3, 4, 5].map(i => ({ i, market: i, state: i }))],
      states: [
        { i: 0 },
        { i: 1, capital: 1, diplomacy: ["x", "x", "x", "x", "Enemy", "x"] },
        { i: 2, capital: 2 },
        { i: 3, capital: 3 },
        { i: 4, capital: 4 },
        { i: 5, capital: 5 }
      ]
    } as never;
    const days: Record<string, number> = { "1-2": 70, "1-3": 40, "1-4": 30, "1-5": 95 };
    const between = (a: number, b: number) => days[`${Math.min(a, b)}-${Math.max(a, b)}`] ?? null;
    seedMerchantBranches(between, 0);
    seedForeignFactories(between, 90);
    expect(housesPresentIn(1, 3)).toContain(1);
    expect(housesPresentIn(1, 2)).toContain(1);
    expect(housesPresentIn(1, 4)).not.toContain(1); // at war
    expect(housesPresentIn(1, 5)).not.toContain(1); // beyond reach
  });

  it("sends an agent where a price gap has been heard of for half a year without a lapse", () => {
    setMarkets([market(1, 10), market(2, 20), market(3, 30)]);
    const between = (a: number, b: number) => (a === b ? 0 : 20);
    seedMerchantBranches(between, 0);
    for (let tick = 0; tick < RUMOUR_BRANCH_DAYS; tick += 30) {
      sim.tickCount = tick;
      hearPriceGapRumour(1, 2, between, 90);
    }
    expect(housesPresentIn(1, 2)).toEqual([]);
    sim.tickCount = RUMOUR_BRANCH_DAYS;
    hearPriceGapRumour(1, 2, between, 90);
    expect(housesPresentIn(1, 2)).toEqual([1]);

    // A lapse of two months starts the count again.
    sim.tickCount = 300;
    hearPriceGapRumour(1, 3, between, 90);
    sim.tickCount = 400;
    hearPriceGapRumour(1, 3, between, 90);
    sim.tickCount = 400 + RUMOUR_BRANCH_DAYS - 30;
    hearPriceGapRumour(1, 3, between, 90);
    expect(housesPresentIn(1, 3)).toEqual([]);
  });
});
