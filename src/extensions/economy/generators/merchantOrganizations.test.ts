import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import type { Market } from "./marketTypes";
import { openBranch } from "./merchantIntelligence";
import {
  explainMarketTradeRefusal,
  getOrganizationMaxTradeDays,
  isMarketTradePermitted
} from "./merchantOrganizations";

describe("merchant organization travel-day limits", () => {
  const source: Market = { i: 1, centerBurgId: 1, color: "#000", goods: {} };
  const target: Market = { i: 2, centerBurgId: 2, color: "#fff", goods: {} };

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.distanceScale = 1;
    worldContext.pack = {
      burgs: [
        { i: 0 } as unknown as Burg,
        { i: 1, state: 1, population: 20, x: 0, y: 0 } as unknown as Burg,
        { i: 2, state: 1, population: 20, x: 900, y: 0 } as unknown as Burg
      ],
      merchantOrganizations: [
        {
          i: 1,
          name: "Local Traders",
          scale: "local",
          homeBurgId: 1,
          homeMarketId: 1,
          homeStateId: 1,
          chairpersonCharacterId: 1,
          memberCharacterIds: [1],
          tradeRangeKm: 120,
          urbanPreference: 0.2,
          ruralFocus: 0.7
        }
      ]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("uses organization scale limits in days instead of a universal 400 km cap", () => {
    expect(getOrganizationMaxTradeDays("local")).toBe(12);
    expect(getOrganizationMaxTradeDays("regional")).toBe(25);
    expect(getOrganizationMaxTradeDays("major")).toBe(50);
    expect(isMarketTradePermitted(source, target, 12)).toBe(true);
    expect(isMarketTradePermitted(source, target, 13)).toBe(false);
  });
});

describe("great house reach with fmg-long-distance-trade (long-distance-merchant-reach-capital.md §4)", () => {
  const market = (i: number): Market => ({ i, centerBurgId: i, color: "#000", goods: {} });
  const house = (i: number, homeStateId: number) => ({
    i,
    name: `House ${i}`,
    scale: "major",
    homeBurgId: i,
    homeMarketId: i,
    homeStateId,
    chairpersonCharacterId: i,
    memberCharacterIds: [i],
    tradeRangeKm: 400,
    urbanPreference: 0.8,
    ruralFocus: 0.1
  });

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.distanceScale = 1;
    // House 1 at home in state 1; markets 2 and 3 lie in other states, far from its home.
    worldContext.pack = {
      burgs: [
        { i: 0 } as unknown as Burg,
        { i: 1, state: 1, population: 50, x: 0, y: 0 } as unknown as Burg,
        { i: 2, state: 2, population: 50, x: 2000, y: 0 } as unknown as Burg,
        { i: 3, state: 3, population: 50, x: 4000, y: 0 } as unknown as Burg
      ],
      merchantOrganizations: [house(1, 1)]
    } as unknown as PackedGraph;
    simulationContext.worldSettings = { "fmg-long-distance-trade": "on" };
  });

  afterEach(() => {
    delete simulationContext.worldSettings;
    clearEconomyContext();
  });

  it("carries high-value cargo up to 90 days, other cargo up to 50", () => {
    expect(isMarketTradePermitted(market(1), market(2), 80, { highValue: true })).toBe(true);
    expect(isMarketTradePermitted(market(1), market(2), 91, { highValue: true })).toBe(false);
    expect(isMarketTradePermitted(market(1), market(2), 80)).toBe(false);
    simulationContext.worldSettings = {};
    expect(isMarketTradePermitted(market(1), market(2), 80, { highValue: true })).toBe(false);
  });

  it("trades between two branches far from home", () => {
    expect(explainMarketTradeRefusal(market(2), market(3), 20)).toBe("outsideHomeGround");
    openBranch(1, 2);
    openBranch(1, 3);
    expect(isMarketTradePermitted(market(2), market(3), 20)).toBe(true);
  });

  it("lifts the village limit only for high-value cargo through its own agents", () => {
    (worldContext.pack.burgs[2] as Burg).population = 5;
    expect(explainMarketTradeRefusal(market(1), market(2), 20, { highValue: true })).toBe("smallVillage");
    openBranch(1, 2);
    expect(isMarketTradePermitted(market(1), market(2), 20, { highValue: true })).toBe(true);
    expect(explainMarketTradeRefusal(market(1), market(2), 20)).toBe("smallVillage");
  });
});
