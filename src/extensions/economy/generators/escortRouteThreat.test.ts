import { describe, expect, it } from "vitest";
import {
  computeBaseEscortFee,
  computeRouteThreat,
  escortCombatDifficulty,
  escortUiDifficulty,
  finalizeEscortFee,
  marketRateFromSeed
} from "./escortRouteThreat";

describe("marketRateFromSeed", () => {
  it("returns low, market, or high with multipliers around 1", () => {
    const rates = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const { rate, mult } = marketRateFromSeed(seed);
      rates.add(rate);
      expect(mult).toBeGreaterThanOrEqual(0.75);
      expect(mult).toBeLessThanOrEqual(1.3);
    }
    expect(rates.has("low")).toBe(true);
    expect(rates.has("market")).toBe(true);
    expect(rates.has("high")).toBe(true);
  });
});

describe("computeRouteThreat", () => {
  it("is low on safe inland roads", () => {
    const threat = computeRouteThreat({
      dangerSamples: [0, 0, 5],
      banditPressure: 0,
      frontierWildernessShare: 0
    });
    expect(threat.threatScore).toBeLessThan(0.15);
    expect(threat.securityDeficit).toBeLessThan(0.1);
    expect(threat.beastThreat).toBeLessThan(0.1);
  });

  it("rises with danger, bandits, and wilderness", () => {
    const safe = computeRouteThreat({ dangerSamples: [0], banditPressure: 0 });
    const hot = computeRouteThreat({
      dangerSamples: [180, 200, 255],
      banditPressure: 0.8,
      frontierWildernessShare: 0.5
    });
    expect(hot.avgDanger).toBeGreaterThan(safe.avgDanger);
    expect(hot.banditThreat).toBeGreaterThan(0.7);
    expect(hot.securityDeficit).toBeGreaterThan(0.5);
    expect(hot.beastThreat).toBeGreaterThan(0.4);
    expect(hot.threatScore).toBeGreaterThan(safe.threatScore);
    expect(hot.threatScore).toBeLessThanOrEqual(1.5);
  });
});

describe("escort fee", () => {
  it("pays more for longer, riskier trade caravans", () => {
    const shortSafe = computeBaseEscortFee({
      missionDays: 3,
      threatScore: 0.05,
      kind: "traveler",
      transport: "foot"
    });
    const longDanger = computeBaseEscortFee({
      missionDays: 20,
      threatScore: 0.8,
      kind: "trade",
      transport: "caravan"
    });
    expect(longDanger).toBeGreaterThan(shortSafe * 3);
  });

  it("applies market-rate variance to fee and partial", () => {
    const base = 10;
    const low = finalizeEscortFee(base, 0.75);
    const high = finalizeEscortFee(base, 1.3);
    expect(low.fee).toBeLessThan(high.fee);
    expect(low.feePartial).toBeLessThan(low.fee);
    expect(high.feePartial).toBeCloseTo(high.fee * 0.4, 5);
  });
});

describe("escort combat difficulty", () => {
  it("maps threat to a usable combat range", () => {
    expect(escortCombatDifficulty(0, "traveler", "caravan")).toBeGreaterThanOrEqual(18);
    expect(escortCombatDifficulty(1.2, "trade", "foot")).toBeLessThanOrEqual(90);
    expect(escortCombatDifficulty(0.5, "trade", "caravan")).toBeGreaterThan(
      escortCombatDifficulty(0.5, "traveler", "caravan")
    );
  });

  it("ui difficulty tiers 1–5", () => {
    expect(escortUiDifficulty(0)).toBe(1);
    expect(escortUiDifficulty(0.9)).toBe(5);
  });
});
