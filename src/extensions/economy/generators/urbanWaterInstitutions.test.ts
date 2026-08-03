import { describe, expect, it } from "vitest";
import {
  cleaningTaxRevenue,
  compostingEfficiency,
  evolveInstitutions,
  healthPressureFromSanitation,
  institutionalTargets,
  localMixedIntakeOutfall,
  pollutionExport,
  propagateRiverPollution,
  resolveOrganicPathways,
  tierDrinkingHealthBonus
} from "./urbanWaterInstitutions";
import { culturalHygieneProfile } from "./urbanWaterSystem";

describe("institutions", () => {
  it("does not grant strong connection permits below tier 3", () => {
    const low = institutionalTargets({
      tier: 1,
      contamination: 0.8,
      sanitationBurden: 0.7,
      demandUrgency: 0.8,
      administrationBonus: 1
    });
    const high = institutionalTargets({
      tier: 3,
      contamination: 0.8,
      sanitationBurden: 0.7,
      demandUrgency: 0.8,
      administrationBonus: 1
    });
    expect(high.connectionPermitCoverage).toBeGreaterThan(low.connectionPermitCoverage);
    expect(high.dischargeRegulation).toBeGreaterThan(low.dischargeRegulation);
  });

  it("evolves toward targets gradually", () => {
    const first = evolveInstitutions({
      previous: null,
      tier: 3,
      contamination: 0.7,
      sanitationBurden: 0.6,
      demandUrgency: 0.7,
      administrationBonus: 1.1
    });
    const second = evolveInstitutions({
      previous: first,
      tier: 3,
      contamination: 0.7,
      sanitationBurden: 0.6,
      demandUrgency: 0.7,
      administrationBonus: 1.1
    });
    expect(second.cleaningTaxRate).toBeGreaterThanOrEqual(first.cleaningTaxRate);
    expect(cleaningTaxRevenue({ cleaningTaxRate: 0.02, people: 5000, product: 100 })).toBeGreaterThan(0);
  });
});

describe("intake/outfall and tier drinking bonus", () => {
  it("marks same-river discharge without regulation as mixed", () => {
    expect(
      localMixedIntakeOutfall({
        hasRiver: true,
        hasSeparateWastewaterRoute: false,
        dischargeRegulation: 0.2
      })
    ).toBe(true);
    expect(
      localMixedIntakeOutfall({
        hasRiver: true,
        hasSeparateWastewaterRoute: false,
        dischargeRegulation: 0.7
      })
    ).toBe(false);
  });

  it("withholds tier health bonus when intake mixes with outfall", () => {
    const mixed = tierDrinkingHealthBonus({
      tier: 3,
      localMixed: true,
      dischargeRegulation: 0.1,
      hasUpstreamIntake: true
    });
    const protectedBonus = tierDrinkingHealthBonus({
      tier: 3,
      localMixed: false,
      dischargeRegulation: 0.6,
      hasUpstreamIntake: true
    });
    expect(mixed).toBe(0);
    expect(protectedBonus).toBeGreaterThan(0);
  });
});

describe("organic pathways and composting", () => {
  it("lets cold composting proceed with mass and cover, but slower than warm", () => {
    const cold = compostingEfficiency({
      ambientTemperature: -2,
      people: 12000,
      managedCompostingShare: 0.4,
      hasStorageCover: true
    });
    const warm = compostingEfficiency({
      ambientTemperature: 18,
      people: 12000,
      managedCompostingShare: 0.4,
      hasStorageCover: true
    });
    const tinyCold = compostingEfficiency({
      ambientTemperature: -2,
      people: 80,
      managedCompostingShare: 0.4,
      hasStorageCover: false
    });
    expect(cold).toBeGreaterThan(0);
    expect(warm).toBeGreaterThan(cold);
    expect(cold).toBeGreaterThan(tinyCold);
  });

  it("treats free-range pigs as scavenging, not pig toilets", () => {
    const profile = culturalHygieneProfile("Generic");
    const outcome = resolveOrganicPathways({
      profile,
      people: 6000,
      ambientTemperature: 12,
      tier: 1,
      isCapital: false,
      isPort: false,
      pigScavenging: 0.8,
      connectionPermitCoverage: 0,
      irrigationCapacity: 0.3
    });
    expect(outcome.pigToiletPractice).toBe(0);
    expect(outcome.scavengingRelief).toBeGreaterThan(0);
    expect(outcome.scavengingRisk).toBeGreaterThan(0);
  });

  it("reduces open dumping when connection permits are high", () => {
    const profile = culturalHygieneProfile("Generic");
    const open = resolveOrganicPathways({
      profile,
      people: 8000,
      ambientTemperature: 12,
      tier: 3,
      isCapital: true,
      isPort: false,
      pigScavenging: 0,
      connectionPermitCoverage: 0,
      irrigationCapacity: 0.3
    });
    const permitted = resolveOrganicPathways({
      profile,
      people: 8000,
      ambientTemperature: 12,
      tier: 3,
      isCapital: true,
      isPort: false,
      pigScavenging: 0,
      connectionPermitCoverage: 0.8,
      irrigationCapacity: 0.3
    });
    expect(permitted.openDisposalShare).toBeLessThan(open.openDisposalShare);
  });
});

describe("river pollution externalities", () => {
  it("passes pollution from upstream burgs to downstream ones", () => {
    const result = propagateRiverPollution([
      { burgId: 1, riverId: 9, upstreamRank: 100, exportLoad: 0.6 },
      { burgId: 2, riverId: 9, upstreamRank: 50, exportLoad: 0.1 },
      { burgId: 3, riverId: 9, upstreamRank: 10, exportLoad: 0.05 }
    ]);
    expect(result.get(1)?.upstreamPollutionImport).toBe(0);
    expect(result.get(2)?.upstreamPollutionImport).toBeGreaterThan(0.3);
    // Downstream still carries a material plume even after intermediate dilution.
    expect(result.get(3)?.upstreamPollutionImport).toBeGreaterThan(0.25);
    expect(result.get(2)?.upstreamPollutionImport).toBeGreaterThan(result.get(1)!.upstreamPollutionImport);
  });

  it("lowers export when discharge regulation is strict", () => {
    const raw = pollutionExport({
      wasteDeficit: 0.5,
      waterDischargeShare: 0.4,
      openDisposalShare: 0.2,
      dischargeRegulation: 0,
      hasDownstreamOutfall: true,
      people: 10000
    });
    const regulated = pollutionExport({
      wasteDeficit: 0.5,
      waterDischargeShare: 0.4,
      openDisposalShare: 0.2,
      dischargeRegulation: 0.8,
      hasDownstreamOutfall: true,
      people: 10000
    });
    expect(regulated).toBeLessThan(raw);
  });
});

describe("health pressure", () => {
  it("rises with contamination and falls with drinking security", () => {
    const bad = healthPressureFromSanitation({
      waterContamination: 0.8,
      sanitationBurden: 0.7,
      organicStreetLoad: 0.6,
      scavengingRisk: 0.4,
      upstreamPollutionImport: 0.3,
      drinkingWaterSecurity: 0.2
    });
    const good = healthPressureFromSanitation({
      waterContamination: 0.1,
      sanitationBurden: 0.15,
      organicStreetLoad: 0.1,
      scavengingRisk: 0.05,
      upstreamPollutionImport: 0,
      drinkingWaterSecurity: 0.85
    });
    expect(bad).toBeGreaterThan(good);
  });
});
