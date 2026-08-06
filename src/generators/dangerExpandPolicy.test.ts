import { describe, expect, it } from "vitest";
import {
  canStateClaimCell,
  dangerSuitabilityMultiplier,
  FRONTIER_OUTPOST_MAX_DANGER,
  getStateExpandDangerCost,
  SETTLEMENT_DANGER_ZERO,
  STATE_EXPAND_DANGER_BAN
} from "./dangerExpandPolicy";

describe("dangerExpandPolicy", () => {
  it("bans claim at the ban threshold and above", () => {
    expect(getStateExpandDangerCost(STATE_EXPAND_DANGER_BAN)).toBeNull();
    expect(getStateExpandDangerCost(255)).toBeNull();
    expect(canStateClaimCell(STATE_EXPAND_DANGER_BAN)).toBe(false);
  });

  it("allows safe land with zero cost", () => {
    expect(getStateExpandDangerCost(0)).toBe(0);
    expect(canStateClaimCell(0)).toBe(true);
  });

  it("charges moderate danger without banning it", () => {
    const cost = getStateExpandDangerCost(40);
    expect(cost).not.toBeNull();
    expect(cost!).toBeGreaterThan(0);
    expect(canStateClaimCell(40)).toBe(true);
  });

  it("aligns frontier outpost max with ban policy", () => {
    expect(FRONTIER_OUTPOST_MAX_DANGER).toBe(STATE_EXPAND_DANGER_BAN - 1);
  });

  it("zeros settlement suitability at the expand-ban threshold (not only at 200)", () => {
    expect(SETTLEMENT_DANGER_ZERO).toBe(STATE_EXPAND_DANGER_BAN);
    expect(dangerSuitabilityMultiplier(0)).toBe(1);
    expect(dangerSuitabilityMultiplier(40)).toBeCloseTo(0.5, 5);
    expect(dangerSuitabilityMultiplier(SETTLEMENT_DANGER_ZERO)).toBe(0);
    expect(dangerSuitabilityMultiplier(200)).toBe(0);
    // Historical /200 formula left 0.6 capacity at the ban ring — that was the pop leak.
    expect(dangerSuitabilityMultiplier(80)).toBe(0);
  });

  it("calamity additive field zeros a wide radius under settlement policy", () => {
    // power 50 additive: danger = remaining * 4. At dist 30, danger = 80 → mult 0.
    const dangerAtDist = (power: number, dist: number) => Math.min(255, Math.max(0, power - dist) * 4);
    expect(dangerSuitabilityMultiplier(dangerAtDist(50, 0))).toBe(0);
    expect(dangerSuitabilityMultiplier(dangerAtDist(50, 30))).toBe(0);
    expect(dangerSuitabilityMultiplier(dangerAtDist(50, 35))).toBeCloseTo(0.25, 5);
    expect(dangerSuitabilityMultiplier(dangerAtDist(50, 50))).toBe(1);
  });
});
