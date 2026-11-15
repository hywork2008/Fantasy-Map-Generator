import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MARKET_SETTINGS, setMarketSettings } from "../../../simulation/marketSettings";
import { settleLeanCondition } from "./livestockFeed";
import type { LivestockFeedLedger } from "./livestockFeedPolicy";

const row = (unmetKg: number, unharvestedKg: number, leanDeficitKg = 0) =>
  ({ unmetKg, unharvestedKg, leanDeficitKg }) as LivestockFeedLedger;

describe("lean condition", () => {
  afterEach(() => setMarketSettings(DEFAULT_MARKET_SETTINGS));

  it("carries unmet feed up to the body reserve and eats it back from spare grass at the refeeding rate", () => {
    const winter = row(300, 0, 50);
    settleLeanCondition(winter, 100);
    expect(winter.leanDeficitKg).toBe(200);
    const spring = row(0, 1000, 200);
    settleLeanCondition(spring, 100);
    expect(spring.refedKg).toBeCloseTo(30);
    expect(spring.leanDeficitKg).toBeCloseTo(170);
    expect(spring.unharvestedKg).toBeCloseTo(970);
  });

  it("keeps no deficit under the legacy rule", () => {
    setMarketSettings({ leanCondition: "off" });
    const r = row(300, 0, 50);
    settleLeanCondition(r, 100);
    expect(r.leanDeficitKg).toBe(0);
  });
});
