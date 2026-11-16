import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MARKET_SETTINGS, setMarketSettings } from "../../../simulation/marketSettings";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { getOrCreateLivestockFeedTable, initEconomyContext } from "../economyContext";
import { settleLeanCondition } from "./livestockFeed";
import type { LivestockFeedLedger } from "./livestockFeedPolicy";
import { getFeedShortfallResponse, getLeanMilkFactor, livestockFeedPeriod } from "./livestockFeedState";

const row = (unmetKg: number, unharvestedKg: number, leanDeficitKg = 0) =>
  ({
    requiredKg: 100,
    unmetKg,
    unharvestedKg,
    leanDeficitKg,
    leanNeedKg: 100
  }) as LivestockFeedLedger;

describe("lean condition", () => {
  afterEach(() => setMarketSettings(DEFAULT_MARKET_SETTINGS));

  it("eats the deficit back from spare grass at the refeeding rate", () => {
    const spring = row(0, 1000, 150);
    settleLeanCondition(spring, 100);
    expect(spring.refedKg).toBeCloseTo(30);
    expect(spring.leanDeficitKg).toBeCloseTo(120);
    expect(spring.unharvestedKg).toBeCloseTo(970);
  });

  it("kills the share of the herd owed beyond the reserve, or stops the deficit there without deaths", () => {
    const starved = row(300, 0, 50);
    expect(settleLeanCondition(starved, 100)).toBeCloseTo(0.75);
    expect(starved.leanDeficitKg).toBeCloseTo(50);
    setMarketSettings({ leanDeaths: "off" });
    const capped = row(300, 0, 50);
    expect(settleLeanCondition(capped, 100)).toBe(0);
    expect(capped.leanDeficitKg).toBe(200);
  });

  it("sells the unfed mouths once the reserve is spent past the threshold, scaling the deficit by the herd kept", () => {
    const lean = row(40, 0, 20);
    settleLeanCondition(lean, 100);
    expect(lean.leanCullShare).toBeCloseTo(0.4);
    const sold = { ...lean, unmetKg: 0 } as LivestockFeedLedger;
    settleLeanCondition(sold, 60);
    expect(sold.leanDeficitKg).toBeCloseTo(36);
    const mild = row(10, 0, 0);
    settleLeanCondition(mild, 100);
    expect(mild.leanCullShare).toBe(0);
  });

  it("keeps no deficit under the legacy rule", () => {
    setMarketSettings({ leanCondition: "off" });
    const r = row(300, 0, 50);
    settleLeanCondition(r, 100);
    expect(r.leanDeficitKg).toBe(0);
  });
});

describe("lean milk and shortfall response", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    simulationContext.currentYear = 1000;
    simulationContext.currentMonth = 4;
    initEconomyContext({
      worldContext,
      simulationContext
    } as unknown as ExtensionAPI);
  });
  afterEach(() => setMarketSettings(DEFAULT_MARKET_SETTINGS));

  const setRow = (row: Partial<LivestockFeedLedger>) => {
    getOrCreateLivestockFeedTable()![0] = row as LivestockFeedLedger;
  };
  const year = (fedKg: number, grainFeedKg = 0) => {
    const period = livestockFeedPeriod();
    setRow({
      samples: Array.from({ length: 12 }, (_, k) => ({
        period: period - k,
        requiredKg: 100,
        fedKg,
        grainFeedKg
      }))
    } as never);
  };

  it("withholds milk in proportion to the reserve spent, capped at the whole reserve", () => {
    setRow({ leanNeedKg: 100, leanDeficitKg: 100 });
    expect(getLeanMilkFactor(0)).toBeCloseTo(0.75);
    setRow({ leanNeedKg: 100, leanDeficitKg: 900 });
    expect(getLeanMilkFactor(0)).toBeCloseTo(0.5);
    setMarketSettings({ leanMilkLoss: 0 });
    expect(getLeanMilkFactor(0)).toBe(1);
  });

  it("answers only a year short beyond 1% of need, counting grain as short, with the chosen or drawn response", () => {
    setMarketSettings({ feedShortfallResponse: "herd" });
    year(99.5);
    expect(getFeedShortfallResponse(0)).toBeNull();
    year(100, 5);
    expect(getFeedShortfallResponse(0)).toBe("herd");
    setMarketSettings({ feedShortfallResponse: "legacy" });
    expect(getFeedShortfallResponse(0)).toBeNull();
    setMarketSettings({
      feedShortfallResponse: "random",
      feedShortfallWorkShare: 1
    });
    expect(getFeedShortfallResponse(0)).toBe("work");
    setMarketSettings({ feedShortfallWorkShare: 0 });
    expect(getFeedShortfallResponse(0)).toBe("herd");
  });
});
