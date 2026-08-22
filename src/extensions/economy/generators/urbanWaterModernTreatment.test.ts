import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { isModernWaterEraAvailable, settleModernWaterTreatmentInvestment } from "./urbanWaterModernTreatment";

function burg(overrides: Partial<Burg> = {}): Burg {
  return {
    i: 1,
    cell: 0,
    x: 0,
    y: 0,
    population: 10,
    type: "Generic",
    treasury: 5000,
    product: 400,
    ...overrides
  };
}

const noProgress = {
  drinkingTreatmentTier: 0 as const,
  wastewaterTreatmentTier: 0 as const,
  sourceProtection: 0,
  drinkingTreatmentUpgradeProgress: 0,
  wastewaterTreatmentUpgradeProgress: 0
};

describe("isModernWaterEraAvailable", () => {
  it("is available from steamEra onward, not before", () => {
    expect(isModernWaterEraAvailable("lateMedieval")).toBe(false);
    expect(isModernWaterEraAvailable("ageOfExploration")).toBe(false);
    expect(isModernWaterEraAvailable("preIndustrialEra")).toBe(false);
    expect(isModernWaterEraAvailable("steamEra")).toBe(true);
    expect(isModernWaterEraAvailable("industrialChemistryEra")).toBe(true);
    expect(isModernWaterEraAvailable("rocketryEra")).toBe(true);
    expect(isModernWaterEraAvailable(undefined)).toBe(false);
  });
});

describe("settleModernWaterTreatmentInvestment", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
  });

  afterEach(() => clearEconomyContext());

  it("does not invest before the modern water era", () => {
    const settlement = burg();
    const before = settlement.treasury!;
    const result = settleModernWaterTreatmentInvestment({
      burg: settlement,
      people: 5000,
      period: "lateMedieval",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: true,
      modernizationAffinity: 1,
      waterContamination: 0.8,
      previous: noProgress
    });
    expect(result.sourceProtection).toBe(0);
    expect(result.lastModernConstructionSpend).toBe(0);
    expect(settlement.treasury).toBe(before);
  });

  it("does not invest below the minimum population even in the modern era", () => {
    const settlement = burg({ population: 1 });
    const result = settleModernWaterTreatmentInvestment({
      burg: settlement,
      people: 50,
      period: "steamEra",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: true,
      modernizationAffinity: 1,
      waterContamination: 0.8,
      previous: noProgress
    });
    expect(result.sourceProtection).toBe(0);
    expect(result.lastModernConstructionSpend).toBe(0);
  });

  it("no-ops and spends nothing once both tiers already reached 1", () => {
    const settlement = burg();
    const before = settlement.treasury!;
    const result = settleModernWaterTreatmentInvestment({
      burg: settlement,
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: true,
      modernizationAffinity: 1,
      waterContamination: 0.8,
      previous: { ...noProgress, drinkingTreatmentTier: 1, wastewaterTreatmentTier: 1 }
    });
    expect(result.lastModernConstructionSpend).toBe(0);
    expect(settlement.treasury).toBe(before);
  });

  it("spends toward source protection first, before any drinking-tier progress, when hasUpstreamIntake", () => {
    const settlement = burg();
    const before = settlement.treasury!;
    // Low affinity/contamination keeps this year's step small, so a fresh (sourceProtection: 0)
    // burg cannot cross SOURCE_PROTECTION_MIN_FOR_FILTRATION in the same call — isolates step 1.
    const result = settleModernWaterTreatmentInvestment({
      burg: settlement,
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: false,
      modernizationAffinity: 0,
      waterContamination: 0,
      previous: noProgress
    });
    expect(result.sourceProtection).toBeGreaterThan(0);
    expect(result.sourceProtection).toBeLessThan(0.6);
    expect(result.drinkingTreatmentUpgradeProgress).toBe(0);
    expect(result.drinkingTreatmentTier).toBe(0);
    expect(result.lastModernConstructionSpend).toBeGreaterThan(0);
    expect(settlement.treasury).toBeLessThan(before);
  });

  it("can cascade straight from source protection into drinking-tier progress within the same year when urgency/affinity are high enough to cross the threshold", () => {
    const result = settleModernWaterTreatmentInvestment({
      burg: burg(),
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: false,
      modernizationAffinity: 1,
      waterContamination: 0.8,
      previous: noProgress
    });
    expect(result.sourceProtection).toBeGreaterThanOrEqual(0.6);
    expect(result.drinkingTreatmentUpgradeProgress).toBeGreaterThan(0);
  });

  it("never invests toward source protection or drinking tier without an upstream intake", () => {
    const settlement = burg();
    const result = settleModernWaterTreatmentInvestment({
      burg: settlement,
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: false,
      hasDownstreamOutfall: false,
      modernizationAffinity: 1,
      waterContamination: 0.8,
      previous: noProgress
    });
    expect(result.sourceProtection).toBe(0);
    expect(result.drinkingTreatmentUpgradeProgress).toBe(0);
  });

  it("does not progress drinking-tier filtration until source protection crosses its threshold", () => {
    // Low affinity/contamination keeps this year's own step-1 addition small, so the pre-existing
    // sourceProtection value (not this year's top-up) decides which side of the threshold it lands.
    const belowThreshold = settleModernWaterTreatmentInvestment({
      burg: burg(),
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: false,
      modernizationAffinity: 0,
      waterContamination: 0,
      previous: { ...noProgress, sourceProtection: 0.4 }
    });
    expect(belowThreshold.sourceProtection).toBeLessThan(0.6);
    expect(belowThreshold.drinkingTreatmentUpgradeProgress).toBe(0);

    const aboveThreshold = settleModernWaterTreatmentInvestment({
      burg: burg(),
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: false,
      modernizationAffinity: 0,
      waterContamination: 0,
      previous: { ...noProgress, sourceProtection: 0.7 }
    });
    expect(aboveThreshold.drinkingTreatmentUpgradeProgress).toBeGreaterThan(0);
  });

  it("raises drinkingTreatmentTier to 1 once upgrade progress completes", () => {
    const result = settleModernWaterTreatmentInvestment({
      burg: burg({ treasury: 50000 }),
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: false,
      modernizationAffinity: 1,
      waterContamination: 0.8,
      previous: { ...noProgress, sourceProtection: 1, drinkingTreatmentUpgradeProgress: 0.99 }
    });
    expect(result.drinkingTreatmentTier).toBe(1);
    expect(result.drinkingTreatmentUpgradeProgress).toBe(0);
  });

  it("progresses wastewaterTreatmentTier independently of sourceProtection, gated on hasDownstreamOutfall", () => {
    const withOutfall = settleModernWaterTreatmentInvestment({
      burg: burg(),
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: false,
      hasDownstreamOutfall: true,
      modernizationAffinity: 1,
      waterContamination: 0.8,
      previous: noProgress
    });
    expect(withOutfall.wastewaterTreatmentUpgradeProgress).toBeGreaterThan(0);

    const withoutOutfall = settleModernWaterTreatmentInvestment({
      burg: burg(),
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: false,
      hasDownstreamOutfall: false,
      modernizationAffinity: 1,
      waterContamination: 0.8,
      previous: noProgress
    });
    expect(withoutOutfall.wastewaterTreatmentUpgradeProgress).toBe(0);
  });

  it("invests faster with higher modernizationAffinity, all else equal", () => {
    const low = settleModernWaterTreatmentInvestment({
      burg: burg(),
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: false,
      modernizationAffinity: 0.05,
      waterContamination: 0.5,
      previous: noProgress
    });
    const high = settleModernWaterTreatmentInvestment({
      burg: burg(),
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: false,
      modernizationAffinity: 0.95,
      waterContamination: 0.5,
      previous: noProgress
    });
    expect(high.sourceProtection).toBeGreaterThan(low.sourceProtection);
  });

  it("funds operations only once a tier has actually been reached, from a separate pool than construction", () => {
    const settlement = burg({ treasury: 20000 });
    const result = settleModernWaterTreatmentInvestment({
      burg: settlement,
      people: 5000,
      period: "steamEra",
      hasUpstreamIntake: true,
      hasDownstreamOutfall: true,
      modernizationAffinity: 1,
      waterContamination: 0.3,
      previous: { ...noProgress, drinkingTreatmentTier: 1, wastewaterTreatmentTier: 0 }
    });
    expect(result.treatmentOperationsFunding).toBeGreaterThan(0);
    expect(result.wastewaterOperationsFunding).toBe(0);
  });
});
