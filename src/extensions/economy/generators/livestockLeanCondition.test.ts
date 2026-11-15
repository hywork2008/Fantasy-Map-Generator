import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MARKET_SETTINGS, setMarketSettings } from "../../../simulation/marketSettings";
import { settleLeanCondition } from "./livestockFeed";
import type { LivestockFeedLedger } from "./livestockFeedPolicy";

const row = (unmetKg: number, unharvestedKg: number, leanDeficitKg = 0) =>
  ({ requiredKg: 100, unmetKg, unharvestedKg, leanDeficitKg, leanNeedKg: 100 }) as LivestockFeedLedger;

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
