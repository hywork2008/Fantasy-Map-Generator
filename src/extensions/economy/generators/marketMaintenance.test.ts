import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import { getHouseholdWealth } from "./burgMarketLedgers";
import { settleMarketMaintenance } from "./marketMaintenance";
import type { Market } from "./marketTypes";

describe("settleMarketMaintenance", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { economyStartMode: "balanced" } as typeof worldContext.options;
    worldContext.pack = {
      burgs: [{ i: 1, market: 1, population: 10 } as Burg],
      markets: []
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("spends Market cash and lowers the operating condition when upkeep is underfunded", () => {
    const market: Market = {
      i: 1,
      centerBurgId: 1,
      color: "#000",
      goods: {},
      marketTreasury: { balance: 0.3, ruralGrainPayable: 0 }
    };
    setMarkets([market]);

    settleMarketMaintenance();

    expect(market.marketTreasury?.balance).toBe(0);
    expect(market.maintenanceCondition).toBeLessThan(1);
    expect(market.maintenanceCondition).toBeGreaterThan(0);
  });

  it("pays the upkeep as wages to the market town's households instead of destroying it", () => {
    const market: Market = {
      i: 1,
      centerBurgId: 1,
      color: "#000",
      goods: {},
      marketTreasury: { balance: 100, ruralGrainPayable: 0 }
    };
    setMarkets([market]);
    const householdsBefore = getHouseholdWealth(1);

    settleMarketMaintenance();

    const paid = 100 - (market.marketTreasury?.balance ?? 0);
    expect(paid).toBeGreaterThan(0);
    expect(getHouseholdWealth(1) - householdsBefore).toBeCloseTo(paid, 2);
  });
});
