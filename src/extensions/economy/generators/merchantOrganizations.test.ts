import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import "../types";
import type { Market } from "./marketTypes";
import { getOrganizationMaxTradeDays, isMarketTradePermitted } from "./merchantOrganizations";

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
