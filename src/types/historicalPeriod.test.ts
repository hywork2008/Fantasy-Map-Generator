import { describe, expect, it } from "vitest";
import { TRADITION_PERIODS } from "../data/civilizationTraditions";
import { windmillsAllowed } from "../extensions/economy/generators/millCapacity";
import { waterTechCeilings } from "../extensions/economy/generators/urbanWaterTech";
import { bridgeCrossingLimitForPeriod } from "../utils/bridgeCrossingPolicy";
import { bridgeSkewLimitForTier, bridgeSkewTierForPeriod } from "../utils/bridgeSkewPolicy";
import { supportsUrbanMorphology } from "../utils/urbanMorphology";
import { HISTORICAL_PERIODS, historicalPeriodIndex, isHistoricalPeriod } from "./historicalPeriod";

const ANTIQUITY = ["classicalAntiquity", "lateAntiquity"] as const;

describe("historical periods", () => {
  it("orders antiquity before the medieval periods and shares the order with traditions", () => {
    expect(HISTORICAL_PERIODS.slice(0, 3)).toEqual(["classicalAntiquity", "lateAntiquity", "earlyMedieval"]);
    expect(TRADITION_PERIODS).toEqual(HISTORICAL_PERIODS);
    expect(historicalPeriodIndex("lateAntiquity")).toBeLessThan(historicalPeriodIndex("earlyMedieval"));
    expect(historicalPeriodIndex("unknown")).toBe(-1);
    expect(isHistoricalPeriod("classicalAntiquity")).toBe(true);
    expect(isHistoricalPeriod("hellenisticAge")).toBe(false);
  });

  it.each(ANTIQUITY)("%s keeps ancient bridge limits (AGENTS.md)", period => {
    const tier = bridgeSkewTierForPeriod(period);
    expect(tier).toBe(0);
    expect(bridgeSkewLimitForTier(tier, "stone")).toBe(15);
    expect(bridgeSkewLimitForTier(tier, "timber")).toBe(20);
    expect(bridgeCrossingLimitForPeriod(period)).toBe(300);
  });

  it.each(ANTIQUITY)("%s has no windmills and no more water tech than earlyMedieval", period => {
    expect(windmillsAllowed(period)).toBe(false);
    expect(waterTechCeilings(period)).toEqual(waterTechCeilings("earlyMedieval"));
    expect(supportsUrbanMorphology(period)).toBe(true);
  });
});
