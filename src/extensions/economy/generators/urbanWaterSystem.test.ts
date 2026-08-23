import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { useOptionsState, worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getUrbanWaterSystems,
  initEconomyContext,
  setGoods,
  setGuildKnowledgeStocks,
  setMarkets,
  setUrbanWaterLastSettledYear,
  setUrbanWaterSystems
} from "../economyContext";
import type { Good } from "./goodsGeneratorTypes";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";
import { raceKeyForBurgWaterworks } from "./resolveBurgCulture";
import type { BurgWaterGeography } from "./urbanWaterSystem";
import {
  annualMaintenanceNeed,
  applyMaintenanceYear,
  canStartProject,
  computeUrbanWaterSystem,
  culturalHygieneProfile,
  evaluateWaterDemandSignals,
  initialTier,
  projectForUpgrade,
  projectMaterialNeeds,
  projectTreasuryCost,
  readBurgWaterGeography,
  sanitationScoreFromSystem,
  settleBurgWaterInvestment,
  UrbanWater,
  WATER_PROJECT_URGENCY_THRESHOLD,
  waterSecurityScoreFromSystem
} from "./urbanWaterSystem";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

function baseGeography(overrides: Partial<BurgWaterGeography> = {}): BurgWaterGeography {
  return {
    hasRiver: false,
    riverFlux: 0,
    isWetland: false,
    isDry: false,
    isCoastal: false,
    precipitation: 45,
    slopeAdvantage: 0.4,
    naturalFloodRisk: 0.2,
    irrigationPotential: 0.3,
    ...overrides
  };
}

function burg(overrides: Partial<Burg> = {}): Burg {
  return {
    i: 1,
    cell: 0,
    x: 0,
    y: 0,
    population: 2,
    type: "Generic",
    treasury: 500,
    product: 40,
    ...overrides
  };
}

function baseSystem(overrides: Partial<UrbanWaterSystem> = {}): UrbanWaterSystem {
  return {
    burgId: 1,
    tier: 0,
    drinkingWaterSecurity: 0.5,
    serviceWaterCapacity: 0.3,
    irrigationCapacity: 0.2,
    stormwaterDrainageCapacity: 0.2,
    wastewaterCapacity: 0.15,
    maintenanceCondition: 0.75,
    sanitationBurden: 0.45,
    waterContamination: 0.35,
    floodExposure: 0.4,
    muddiness: 0.4,
    odor: 0.4,
    hasUpstreamIntake: false,
    hasDownstreamOutfall: true,
    basinKind: "openBasin",
    thermalRegime: "temperate",
    effluentDestination: "riverOutfall",
    hasSeparateWastewaterRoute: false,
    stormwaterDemand: 0.55,
    wastewaterDemand: 0.5,
    clogging: 0.1,
    upgradeProgress: 0,
    activeProject: null,
    primaryDemandSignal: "floodMud",
    demandUrgency: 0.6,
    lastMaintenanceCoverage: 1,
    lastMaintenanceSpend: 0,
    lastConstructionSpend: 0,
    sourceProtection: 0,
    drinkingTreatmentUpgradeProgress: 0,
    wastewaterTreatmentUpgradeProgress: 0,
    treatmentOperationsFunding: 0,
    wastewaterOperationsFunding: 0,
    chemicalTestCoverage: 0,
    chlorineStockCoverage: 0,
    sludgeBacklog: 0,
    effluentTestCoverage: 0,
    lastModernConstructionSpend: 0,
    connectionPermitCoverage: 0,
    cleaningTaxRate: 0,
    dischargeRegulation: 0,
    lastCleaningTaxRevenue: 0,
    organicStreetLoad: 0.4,
    compostingEfficiency: 0.1,
    pigToiletPractice: 0,
    upstreamPollutionImport: 0,
    downstreamPollutionExport: 0.2,
    healthPressure: 0.35,
    localMixedIntakeOutfall: true,
    waterLifting: 0,
    municipalSanitation: 0,
    sanitaryEngineering: 0,
    lastPollutionCompensationPaid: 0,
    lastPollutionCompensationReceived: 0,
    pollutionDiplomaticStrain: 0,
    ...overrides
  };
}

describe("culturalHygieneProfile", () => {
  it("normalizes weights to sum to 1 for every culture type", () => {
    for (const type of ["Generic", "River", "Naval", "Nomadic", "Highland", "Hunting", "Lake"]) {
      const profile = culturalHygieneProfile(type);
      const cleansingSum = Object.values(profile.cleansing).reduce((a, b) => a + b, 0);
      const wasteSum = Object.values(profile.organicWaste).reduce((a, b) => a + b, 0);
      expect(cleansingSum).toBeCloseTo(1, 5);
      expect(wasteSum).toBeCloseTo(1, 5);
    }
  });

  it("gives Nomadic more open disposal and less water washing than River", () => {
    const nomadic = culturalHygieneProfile("Nomadic");
    const river = culturalHygieneProfile("River");
    expect(nomadic.organicWaste.openDisposal).toBeGreaterThan(river.organicWaste.openDisposal);
    expect(nomadic.cleansing.water).toBeLessThan(river.cleansing.water);
  });
});

describe("readBurgWaterGeography", () => {
  it("flags wetland biomes and river cells", () => {
    const geography = readBurgWaterGeography({
      cellId: 0,
      isPort: false,
      cells: {
        h: [25],
        r: [3],
        fl: [40],
        c: [[1]],
        biomeCode: [12],
        g: [0]
      },
      biomesTags: Array.from({ length: 13 }, (_, i) => (i === 12 ? ["wetland"] : ["grassland"])),
      gridPrec: [70]
    });
    expect(geography.hasRiver).toBe(true);
    expect(geography.isWetland).toBe(true);
    expect(geography.naturalFloodRisk).toBeGreaterThan(0.3);
  });

  it("marks dry biomes without rivers as low irrigation potential", () => {
    const geography = readBurgWaterGeography({
      cellId: 0,
      isPort: false,
      cells: {
        h: [40],
        r: [0],
        fl: [0],
        c: [[]],
        biomeCode: [1],
        g: [0]
      },
      biomesTags: [[], ["dry", "desert"]],
      gridPrec: [5]
    });
    expect(geography.isDry).toBe(true);
    expect(geography.irrigationPotential).toBeLessThan(0.2);
  });
});

describe("initialTier", () => {
  it("starts small dry inland burgs at tier 0", () => {
    expect(
      initialTier({
        people: 200,
        geography: baseGeography({ isDry: true, naturalFloodRisk: 0.1, slopeAdvantage: 0.1 }),
        isCapital: false,
        hasMarket: false
      })
    ).toBe(0);
  });

  it("starts large river capitals toward tier 2", () => {
    expect(
      initialTier({
        people: 20000,
        geography: baseGeography({ hasRiver: true, naturalFloodRisk: 0.5 }),
        isCapital: true,
        hasMarket: true
      })
    ).toBe(2);
  });

  it("gives wetland towns at least open ditches when large enough", () => {
    const tier = initialTier({
      people: 3000,
      geography: baseGeography({ isWetland: true, naturalFloodRisk: 0.55 }),
      isCapital: false,
      hasMarket: true
    });
    expect(tier).toBeGreaterThanOrEqual(1);
  });

  describe("civic-waterworks bonus (docs/plan/modern-urban-water-treatment-and-governance.md §18.1)", () => {
    const capital = {
      people: 20000,
      geography: baseGeography({ hasRiver: true, naturalFloodRisk: 0.5 }),
      isCapital: true,
      hasMarket: true
    };

    it("leaves tier unchanged without historicalPeriod/modernizationAffinity (defaults preserve pre-existing behavior)", () => {
      expect(initialTier(capital)).toBe(2);
    });

    it("leaves tier unchanged at earlyMedieval/highMedieval, even with a high modernizationAffinity", () => {
      expect(initialTier({ ...capital, historicalPeriod: "earlyMedieval", modernizationAffinity: 0.85 })).toBe(2);
      expect(initialTier({ ...capital, historicalPeriod: "highMedieval", modernizationAffinity: 0.85 })).toBe(2);
    });

    it("gives no bonus at lateMedieval itself, even with a high modernizationAffinity (the era is the catalyst's starting line, not already developed)", () => {
      expect(initialTier({ ...capital, historicalPeriod: "lateMedieval", modernizationAffinity: 0.85 })).toBe(2);
    });

    it("raises a high-affinity capital's tier toward the absolute max at rocketryEra", () => {
      // readiness = 1 (rocketryEra) * 0.85 (Industrial-like affinity) -> bonus round(3*0.85) = 3
      expect(initialTier({ ...capital, historicalPeriod: "rocketryEra", modernizationAffinity: 0.85 })).toBe(5);
    });

    it("gives a low-affinity culture essentially none of the rocketryEra bonus (the culture never settled into it)", () => {
      // readiness = 1 * 0.08 (Nomadic-like affinity) -> bonus round(3*0.08) = 0
      expect(initialTier({ ...capital, historicalPeriod: "rocketryEra", modernizationAffinity: 0.08 })).toBe(2);
    });

    it("scales gradually at an intermediate era/affinity combination", () => {
      // techLevelProgress(steamEra) = (5-2)/6 = 0.5; readiness = 0.5*0.85 = 0.425 -> bonus round(1.275) = 1
      expect(initialTier({ ...capital, historicalPeriod: "steamEra", modernizationAffinity: 0.85 })).toBe(3);
    });

    it("never grants the bonus below MODERN_WATER_MIN_POPULATION, regardless of era/culture", () => {
      const hamlet = {
        people: 200,
        geography: baseGeography({ isDry: true, naturalFloodRisk: 0.1, slopeAdvantage: 0.1 }),
        isCapital: false,
        hasMarket: false
      };
      expect(initialTier({ ...hamlet, historicalPeriod: "rocketryEra", modernizationAffinity: 0.85 })).toBe(0);
    });

    it("regression: raises an ordinary, geography-plain (no river/wetland/capital) town's tier once population/culture/era all qualify, even though it scores 0 on the geography-only baseline (reported: petroleumEra + Industrial produced no visible development on such towns)", () => {
      const ordinaryTown = {
        people: 1000, // above MODERN_WATER_MIN_POPULATION, but below baseTier's own 4,000/15,000 breaks
        geography: baseGeography(), // no river, no wetland, low flood risk, gentle slope — baseTier 0
        isCapital: false,
        hasMarket: false
      };
      expect(initialTier(ordinaryTown)).toBe(0); // unmodified baseline: no era/culture supplied

      // petroleumEra (techLevelProgress = (7-2)/6 ≈ 0.833) + a high, Industrial-like affinity
      // (0.85): readiness ≈ 0.708, populationBand 1 (1,000 people) -> bonus round(1*0.708) = 1.
      expect(
        initialTier({ ...ordinaryTown, historicalPeriod: "petroleumEra", modernizationAffinity: 0.85 })
      ).toBeGreaterThan(0);
    });
  });
});

describe("Phase 2 demand signals and projects", () => {
  it("maps upgrade projects tier 0→1→2→3 and stops at default max without late tech", () => {
    expect(projectForUpgrade(0)).toBe("openDitches");
    expect(projectForUpgrade(1)).toBe("stoneDrains");
    expect(projectForUpgrade(2)).toBe("coveredCulverts");
    expect(projectForUpgrade(3)).toBe(null);
    expect(projectForUpgrade(3, 4)).toBe("managedSewers");
    expect(projectForUpgrade(4, 5)).toBe("sanitarySeparation");
  });

  it("allows open ditches without masonry or special tech", () => {
    expect(
      canStartProject({
        project: "openDitches",
        geography: baseGeography({ slopeAdvantage: 0.1 }),
        masonryStock: 0,
        people: 200
      })
    ).toBe(true);
  });

  it("requires masonry stock and outfall for covered culverts", () => {
    expect(
      canStartProject({
        project: "coveredCulverts",
        geography: baseGeography({ hasRiver: true, slopeAdvantage: 0.2 }),
        masonryStock: 0,
        people: 5000
      })
    ).toBe(false);
    expect(
      canStartProject({
        project: "coveredCulverts",
        geography: baseGeography({ hasRiver: true, slopeAdvantage: 0.2 }),
        masonryStock: 0.2,
        people: 5000
      })
    ).toBe(true);
  });

  it("raises floodMud urgency when flood and mud are high", () => {
    const calm = evaluateWaterDemandSignals({
      geography: baseGeography({ naturalFloodRisk: 0.05, precipitation: 20 }),
      people: 500,
      workshops: 0.1,
      floodExposure: 0.1,
      muddiness: 0.1,
      odor: 0.1,
      waterContamination: 0.1,
      sanitationBurden: 0.2,
      stormDeficit: 0.05,
      wasteDeficit: 0.05,
      irrigationCapacity: 0.3,
      serviceWaterCapacity: 0.4,
      hasMarket: false
    });
    const flooded = evaluateWaterDemandSignals({
      geography: baseGeography({ naturalFloodRisk: 0.7, isWetland: true, precipitation: 90 }),
      people: 8000,
      workshops: 0.4,
      floodExposure: 0.8,
      muddiness: 0.75,
      odor: 0.3,
      waterContamination: 0.2,
      sanitationBurden: 0.4,
      stormDeficit: 0.5,
      wasteDeficit: 0.2,
      irrigationCapacity: 0.2,
      serviceWaterCapacity: 0.4,
      hasMarket: true
    });
    const calmFlood = calm.find(s => s.id === "floodMud")!.strength;
    const floodedFlood = flooded.find(s => s.id === "floodMud")!.strength;
    expect(floodedFlood).toBeGreaterThan(calmFlood);
    expect(floodedFlood).toBeGreaterThan(WATER_PROJECT_URGENCY_THRESHOLD);
  });

  it("scales project costs with population", () => {
    expect(projectTreasuryCost("openDitches", 20000)).toBeGreaterThan(projectTreasuryCost("openDitches", 500));
    expect(projectMaterialNeeds("coveredCulverts", 10000).stone).toBeGreaterThan(
      projectMaterialNeeds("openDitches", 10000).stone
    );
  });
});

describe("Phase 2 maintenance and clogging", () => {
  it("decays condition and raises clogging when coverage is low", () => {
    const neglected = applyMaintenanceYear({
      maintenanceCondition: 0.8,
      clogging: 0.1,
      coverage: 0.1,
      stormDeficit: 0.4,
      wasteDeficit: 0.3,
      tier: 2
    });
    const funded = applyMaintenanceYear({
      maintenanceCondition: 0.8,
      clogging: 0.1,
      coverage: 1,
      stormDeficit: 0.1,
      wasteDeficit: 0.05,
      tier: 2
    });
    expect(neglected.maintenanceCondition).toBeLessThan(funded.maintenanceCondition);
    expect(neglected.clogging).toBeGreaterThan(funded.clogging);
  });

  it("needs more maintenance cash at higher tiers and clogging", () => {
    const low = annualMaintenanceNeed({ tier: 0, people: 5000, clogging: 0, product: 20 });
    const high = annualMaintenanceNeed({ tier: 3, people: 5000, clogging: 0.5, product: 20 });
    expect(high).toBeGreaterThan(low);
  });
});

describe("computeUrbanWaterSystem", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
  });

  afterEach(() => clearEconomyContext());

  it("returns capacities and burden in unit interval", () => {
    const system = computeUrbanWaterSystem({
      burg: burg({ population: 5, market: 1, capital: 1 }),
      geography: baseGeography({ hasRiver: true, naturalFloodRisk: 0.4 }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12
    });
    expect(system.tier).toBeGreaterThanOrEqual(0);
    expect(system.tier).toBeLessThanOrEqual(2);
    for (const key of [
      "drinkingWaterSecurity",
      "stormwaterDrainageCapacity",
      "wastewaterCapacity",
      "sanitationBurden",
      "waterContamination",
      "floodExposure",
      "muddiness",
      "odor",
      "maintenanceCondition",
      "clogging",
      "healthPressure",
      "organicStreetLoad"
    ] as const) {
      expect(system[key]).toBeGreaterThanOrEqual(0);
      expect(system[key]).toBeLessThanOrEqual(1);
    }
    expect(system.hasDownstreamOutfall).toBe(true);
    expect(system.hasSeparateWastewaterRoute).toBe(false);
    expect(system.pigToiletPractice).toBe(0);
  });

  it("does not grant drinking security from tier alone when intake mixes with outfall", () => {
    const mixed = computeUrbanWaterSystem({
      burg: burg({ population: 8 }),
      geography: baseGeography({ hasRiver: true }),
      people: 8000,
      cultureType: "River",
      ambientTemperature: 12,
      tier: 3,
      maintenanceCondition: 0.9,
      clogging: 0,
      dischargeRegulation: 0.1
    });
    const regulated = computeUrbanWaterSystem({
      burg: burg({ population: 8 }),
      geography: baseGeography({ hasRiver: true }),
      people: 8000,
      cultureType: "River",
      ambientTemperature: 12,
      tier: 3,
      maintenanceCondition: 0.9,
      clogging: 0,
      dischargeRegulation: 0.7
    });
    expect(mixed.localMixedIntakeOutfall).toBe(true);
    expect(regulated.drinkingWaterSecurity).toBeGreaterThan(mixed.drinkingWaterSecurity);
  });

  it("worsens contamination when upstream pollution is imported", () => {
    const clean = computeUrbanWaterSystem({
      burg: burg({ population: 5 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "Generic",
      ambientTemperature: 12,
      upstreamPollutionImport: 0
    });
    const polluted = computeUrbanWaterSystem({
      burg: burg({ population: 5 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "Generic",
      ambientTemperature: 12,
      upstreamPollutionImport: 0.6
    });
    expect(polluted.waterContamination).toBeGreaterThan(clean.waterContamination);
    expect(polluted.irrigationCapacity).toBeLessThanOrEqual(clean.irrigationCapacity);
  });

  it("raises flood exposure when stormwater demand exceeds capacity", () => {
    const dry = computeUrbanWaterSystem({
      burg: burg({ population: 0.2 }),
      geography: baseGeography({ precipitation: 10, naturalFloodRisk: 0.05 }),
      people: 200,
      cultureType: "Generic",
      ambientTemperature: 12
    });
    const soaked = computeUrbanWaterSystem({
      burg: burg({ population: 20, market: 1 }),
      geography: baseGeography({
        precipitation: 100,
        naturalFloodRisk: 0.7,
        isWetland: true,
        slopeAdvantage: 0.05
      }),
      people: 20000,
      cultureType: "Generic",
      ambientTemperature: 12,
      previous: { ...dry, tier: 0, maintenanceCondition: 0.5 }
    });
    expect(soaked.floodExposure).toBeGreaterThan(dry.floodExposure);
    expect(soaked.muddiness).toBeGreaterThan(dry.muddiness);
  });

  it("reduces capacity when clogging is high at the same tier", () => {
    const clear = computeUrbanWaterSystem({
      burg: burg({ population: 5 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "Generic",
      ambientTemperature: 12,
      tier: 2,
      maintenanceCondition: 0.9,
      clogging: 0
    });
    const clogged = computeUrbanWaterSystem({
      burg: burg({ population: 5 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "Generic",
      ambientTemperature: 12,
      tier: 2,
      maintenanceCondition: 0.9,
      clogging: 0.8
    });
    expect(clogged.stormwaterDrainageCapacity).toBeLessThan(clear.stormwaterDrainageCapacity);
    expect(clogged.wastewaterCapacity).toBeLessThan(clear.wastewaterCapacity);
  });

  it("maps systems to civic sanitation scores between 0 and 100", () => {
    const system = computeUrbanWaterSystem({
      burg: burg({ population: 3 }),
      geography: baseGeography({ hasRiver: true }),
      people: 3000,
      cultureType: "Generic",
      ambientTemperature: 12
    });
    const score = sanitationScoreFromSystem(system);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("computes waterSecurityScoreFromSystem independently of sanitationBurden/floodExposure/odor", () => {
    const base = { drinkingWaterSecurity: 0.8, waterContamination: 0.1 } as UrbanWaterSystem;
    const goodWater = waterSecurityScoreFromSystem(base);
    expect(goodWater).toBeCloseTo(0.8 * 60 + (1 - 0.1) * 40, 4); // 84

    // Changing sanitationBurden/floodExposure/odor (sanitationScoreFromSystem's other inputs)
    // must not move waterSecurityScoreFromSystem at all.
    const worseElsewhere = {
      ...base,
      sanitationBurden: 1,
      floodExposure: 1,
      odor: 1,
      healthPressure: 1
    } as UrbanWaterSystem;
    expect(waterSecurityScoreFromSystem(worseElsewhere)).toBe(goodWater);
  });

  it("keeps waterSecurityScoreFromSystem within 0-100", () => {
    const worst = { drinkingWaterSecurity: 0, waterContamination: 1 } as UrbanWaterSystem;
    const best = { drinkingWaterSecurity: 1, waterContamination: 0 } as UrbanWaterSystem;
    expect(waterSecurityScoreFromSystem(worst)).toBe(0);
    expect(waterSecurityScoreFromSystem(best)).toBe(100);
  });

  it("preserves tier when previous is provided", () => {
    const first = computeUrbanWaterSystem({
      burg: burg({ population: 10, capital: 1, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 12000,
      cultureType: "River",
      ambientTemperature: 12
    });
    const second = computeUrbanWaterSystem({
      burg: burg({ population: 1 }),
      geography: baseGeography(),
      people: 500,
      cultureType: "Generic",
      ambientTemperature: 12,
      previous: first
    });
    expect(second.tier).toBe(first.tier);
  });

  it("does not credit a downstream outfall for a river that vanishes inland (closedBasin)", () => {
    worldContext.pack = {
      cells: {
        r: new Uint16Array([1, 1]),
        f: new Uint16Array([1, 1]),
        h: new Uint16Array([50, 25])
      },
      rivers: [{ i: 1, source: 0, mouth: 1 }]
    } as unknown as PackedGraph;

    const system = computeUrbanWaterSystem({
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12
    });

    expect(system.basinKind).toBe("closedBasin");
    expect(system.hasDownstreamOutfall).toBe(false);
    expect(system.effluentDestination).toBe("sealedStorageAndInfiltration");
  });

  it("credits a downstream outfall for a river that reaches the open sea (openBasin)", () => {
    worldContext.pack = {
      cells: {
        r: new Uint16Array([1, 1]),
        f: new Uint16Array([1, 2]),
        h: new Uint16Array([50, 5])
      },
      rivers: [{ i: 1, source: 0, mouth: 1 }],
      features: [{ i: 2, type: "ocean" }]
    } as unknown as PackedGraph;

    const system = computeUrbanWaterSystem({
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12
    });

    expect(system.basinKind).toBe("openBasin");
    expect(system.hasDownstreamOutfall).toBe(true);
    expect(system.effluentDestination).toBe("riverOutfall");
  });

  it("an operating RegionalWaterScheme grants a landlocked burg the same imported-water credit a Giant's inherited aqueduct gets (docs/plan/modern-urban-water-treatment-and-governance.md §9, §14 Phase 3)", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: false, isCoastal: false }),
      people: 5000,
      cultureType: "Generic",
      ambientTemperature: 12
    };
    const unconnected = computeUrbanWaterSystem(base);
    const connected = computeUrbanWaterSystem({ ...base, hasRegionalSchemeConnection: true });

    expect(unconnected.hasUpstreamIntake).toBe(false);
    expect(connected.hasUpstreamIntake).toBe(true);
    expect(connected.drinkingWaterSecurity).toBeGreaterThanOrEqual(unconnected.drinkingWaterSecurity);
  });

  it("a funded modern drinkingTreatmentTier lowers waterContamination and raises drinkingWaterSecurity", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12
    };
    const untreated = computeUrbanWaterSystem(base);
    const treated = computeUrbanWaterSystem({
      ...base,
      drinkingTreatmentTier: 1,
      sourceProtection: 1,
      treatmentOperationsFunding: 1
    });

    expect(treated.waterContamination).toBeLessThan(untreated.waterContamination);
    expect(treated.drinkingWaterSecurity).toBeGreaterThan(untreated.drinkingWaterSecurity);
  });

  it("an unfunded modern drinkingTreatmentTier gives little of the funded benefit (construction without operations)", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12
    };
    const unfunded = computeUrbanWaterSystem({
      ...base,
      drinkingTreatmentTier: 1,
      sourceProtection: 1,
      treatmentOperationsFunding: 0
    });
    const funded = computeUrbanWaterSystem({
      ...base,
      drinkingTreatmentTier: 1,
      sourceProtection: 1,
      treatmentOperationsFunding: 1
    });

    expect(funded.drinkingWaterSecurity).toBeGreaterThan(unfunded.drinkingWaterSecurity);
  });

  it("a funded modern drinkingTreatmentTier 2 (rapid filtration/coagulation) lowers waterContamination and raises drinkingWaterSecurity further than Tier 1 alone (docs/plan/modern-urban-water-treatment-and-governance.md §8, §15)", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12
    };
    const tier1 = computeUrbanWaterSystem({
      ...base,
      drinkingTreatmentTier: 1,
      sourceProtection: 1,
      treatmentOperationsFunding: 1
    });
    const tier2 = computeUrbanWaterSystem({
      ...base,
      drinkingTreatmentTier: 2,
      sourceProtection: 1,
      treatmentOperationsFunding: 1,
      chemicalTestCoverage: 1,
      coagulantStockCoverage: 1
    });

    expect(tier2.waterContamination).toBeLessThan(tier1.waterContamination);
    expect(tier2.drinkingWaterSecurity).toBeGreaterThan(tier1.drinkingWaterSecurity);
  });

  it("a funded Tier 2 without chemicalTestCoverage gives little of Tier 2's benefit (untested dosing is not trusted)", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      drinkingTreatmentTier: 2 as const,
      sourceProtection: 1,
      treatmentOperationsFunding: 1,
      coagulantStockCoverage: 1
    };
    const untested = computeUrbanWaterSystem({ ...base, chemicalTestCoverage: 0 });
    const tested = computeUrbanWaterSystem({ ...base, chemicalTestCoverage: 1 });

    expect(tested.drinkingWaterSecurity).toBeGreaterThan(untested.drinkingWaterSecurity);
  });

  it("a funded Tier 2 without coagulantStockCoverage gives little of Tier 2's benefit (no Alum in the local market)", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      drinkingTreatmentTier: 2 as const,
      sourceProtection: 1,
      treatmentOperationsFunding: 1,
      chemicalTestCoverage: 1
    };
    const unstocked = computeUrbanWaterSystem({ ...base, coagulantStockCoverage: 0 });
    const stocked = computeUrbanWaterSystem({ ...base, coagulantStockCoverage: 1 });

    expect(stocked.drinkingWaterSecurity).toBeGreaterThan(unstocked.drinkingWaterSecurity);
  });

  it("Lime adds a small independent top-up to Tier 2's benefit on top of fully-funded Alum coagulation (docs/plan/modern-urban-water-treatment-and-governance.md §17.2) — Lime is an extra, not another required factor on the Alum-gated term", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      drinkingTreatmentTier: 2 as const,
      sourceProtection: 1,
      treatmentOperationsFunding: 1,
      chemicalTestCoverage: 1,
      coagulantStockCoverage: 1
    };
    const withoutLime = computeUrbanWaterSystem({ ...base, limeStockCoverage: 0 });
    const withLime = computeUrbanWaterSystem({ ...base, limeStockCoverage: 1 });

    // A burg with Alum but no Lime still gets the full Alum-gated benefit above — this is a smaller
    // top-up on top of it, not a fourth required multiplicative factor.
    expect(withLime.drinkingWaterSecurity).toBeGreaterThan(withoutLime.drinkingWaterSecurity);
    expect(withLime.waterContamination).toBeLessThan(withoutLime.waterContamination);
  });

  it("a funded modern drinkingTreatmentTier 3 (controlled chlorination) lowers waterContamination and raises drinkingWaterSecurity further than Tier 2 alone", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      sourceProtection: 1,
      treatmentOperationsFunding: 1,
      chemicalTestCoverage: 1,
      coagulantStockCoverage: 1
    };
    const tier2 = computeUrbanWaterSystem({ ...base, drinkingTreatmentTier: 2 });
    const tier3 = computeUrbanWaterSystem({ ...base, drinkingTreatmentTier: 3, chlorineStockCoverage: 1 });

    expect(tier3.waterContamination).toBeLessThan(tier2.waterContamination);
    expect(tier3.drinkingWaterSecurity).toBeGreaterThan(tier2.drinkingWaterSecurity);
  });

  it("a funded Tier 3 without chlorineStockCoverage gives little of Tier 3's benefit (no Chlorine in the local market)", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      drinkingTreatmentTier: 3 as const,
      sourceProtection: 1,
      treatmentOperationsFunding: 1,
      chemicalTestCoverage: 1,
      coagulantStockCoverage: 1
    };
    const unstocked = computeUrbanWaterSystem({ ...base, chlorineStockCoverage: 0 });
    const stocked = computeUrbanWaterSystem({ ...base, chlorineStockCoverage: 1 });

    expect(stocked.drinkingWaterSecurity).toBeGreaterThan(unstocked.drinkingWaterSecurity);
  });

  it("a funded modern wastewaterTreatmentTier lowers downstreamPollutionExport", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12
    };
    const untreated = computeUrbanWaterSystem(base);
    const treated = computeUrbanWaterSystem({
      ...base,
      wastewaterTreatmentTier: 1,
      wastewaterOperationsFunding: 1
    });

    expect(treated.downstreamPollutionExport).toBeLessThanOrEqual(untreated.downstreamPollutionExport);
  });

  it("a funded modern wastewaterTreatmentTier 2 (trickling filter / biological treatment) lowers downstreamPollutionExport further than Tier 1 alone (docs/plan/modern-urban-water-treatment-and-governance.md §8, §16)", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      wastewaterOperationsFunding: 1
    };
    const tier1 = computeUrbanWaterSystem({ ...base, wastewaterTreatmentTier: 1 });
    const tier2 = computeUrbanWaterSystem({
      ...base,
      wastewaterTreatmentTier: 2,
      effluentTestCoverage: 1,
      sludgeBacklog: 0
    });

    expect(tier2.downstreamPollutionExport).toBeLessThan(tier1.downstreamPollutionExport);
  });

  it("a funded Tier 2 without effluentTestCoverage gives little of Tier 2's benefit (unverified biological process)", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      wastewaterTreatmentTier: 2 as const,
      wastewaterOperationsFunding: 1,
      sludgeBacklog: 0
    };
    const untested = computeUrbanWaterSystem({ ...base, effluentTestCoverage: 0 });
    const tested = computeUrbanWaterSystem({ ...base, effluentTestCoverage: 1 });

    expect(tested.downstreamPollutionExport).toBeLessThan(untested.downstreamPollutionExport);
  });

  it("a high sludgeBacklog erodes Tier 2's export reduction and raises local odor", () => {
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      wastewaterTreatmentTier: 2 as const,
      wastewaterOperationsFunding: 1,
      effluentTestCoverage: 1
    };
    const clean = computeUrbanWaterSystem({ ...base, sludgeBacklog: 0 });
    const backlogged = computeUrbanWaterSystem({ ...base, sludgeBacklog: 1 });

    expect(backlogged.downstreamPollutionExport).toBeGreaterThan(clean.downstreamPollutionExport);
    expect(backlogged.odor).toBeGreaterThan(clean.odor);
  });

  it("a funded modern wastewaterTreatmentTier 3 (activated sludge) with local electricity lowers downstreamPollutionExport further than Tier 2 alone", () => {
    worldContext.pack = {
      markets: [{ i: 1, centerBurgId: 1, color: "#000", electricityStock: 1, goods: {} }]
    } as unknown as PackedGraph;
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      wastewaterOperationsFunding: 1,
      effluentTestCoverage: 1,
      sludgeBacklog: 0
    };
    const tier2 = computeUrbanWaterSystem({ ...base, wastewaterTreatmentTier: 2 });
    const tier3 = computeUrbanWaterSystem({ ...base, wastewaterTreatmentTier: 3 });

    expect(tier3.downstreamPollutionExport).toBeLessThan(tier2.downstreamPollutionExport);
  });

  it("a funded Tier 3 without local electricity gives little of Tier 3's benefit", () => {
    worldContext.pack = { markets: [] } as unknown as PackedGraph;
    const base = {
      burg: burg({ population: 10, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      wastewaterTreatmentTier: 3 as const,
      wastewaterOperationsFunding: 1,
      effluentTestCoverage: 1,
      sludgeBacklog: 0
    };
    const noPower = computeUrbanWaterSystem(base);
    worldContext.pack = {
      markets: [{ i: 1, centerBurgId: 1, color: "#000", electricityStock: 1, goods: {} }]
    } as unknown as PackedGraph;
    const powered = computeUrbanWaterSystem(base);

    expect(powered.downstreamPollutionExport).toBeLessThan(noPower.downstreamPollutionExport);
  });

  it("Giant burgs get full source protection and operations funding regardless of investment args", () => {
    worldContext.pack = {
      states: [undefined, { i: 1, culture: 1 }],
      cultures: [
        { i: 0, type: "Generic" },
        { i: 1, type: "River", race: 1 }
      ],
      races: [
        { i: 0, key: "unknown", name: "Unknown" },
        { i: 1, key: "giant", name: "Giant" }
      ]
    } as unknown as PackedGraph;
    const system = computeUrbanWaterSystem({
      burg: burg({ population: 10, market: 1, state: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000,
      cultureType: "River",
      ambientTemperature: 12,
      // Even an explicit "no investment yet" override is overridden by the Giant seed.
      sourceProtection: 0,
      treatmentOperationsFunding: 0,
      // ...and an explicit attempt to force Phase 4 chemistry is ignored too — Giants stay at
      // Roman-grade Tier 1, with no chemical dosing or chlorination regime to represent.
      chemicalTestCoverage: 1,
      chlorineStockCoverage: 1,
      // ...and Phase 5 biological treatment is ignored the same way — Giants stay at
      // wastewaterTreatmentTier 1, with no trickling filter/activated sludge to represent.
      sludgeBacklog: 1,
      effluentTestCoverage: 1
    });
    expect(system.drinkingTreatmentTier).toBe(1);
    expect(system.wastewaterTreatmentTier).toBe(1);
    expect(system.sourceProtection).toBe(1);
    expect(system.treatmentOperationsFunding).toBe(0.9);
    expect(system.chemicalTestCoverage).toBe(0);
    expect(system.chlorineStockCoverage).toBe(0);
    expect(system.sludgeBacklog).toBe(0);
    expect(system.effluentTestCoverage).toBe(0);
  });
});

describe("settleBurgWaterInvestment", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    setGoods([
      { i: 1, name: "Stone", value: 2 } as Good,
      { i: 2, name: "Tools", value: 5 } as Good,
      { i: 3, name: "Brick", value: 3 } as Good
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#000",
        goods: {
          1: { stock: 100, price: 2 },
          2: { stock: 100, price: 5 },
          3: { stock: 100, price: 3 }
        }
      } as Market
    ]);
    setGuildKnowledgeStocks([]);
  });

  afterEach(() => clearEconomyContext());

  it("spends maintenance from burg treasury without using construction budget alone", () => {
    const settlement = burg({ treasury: 200, product: 50, market: 1, population: 5 });
    const before = settlement.treasury!;
    const result = settleBurgWaterInvestment({
      burg: settlement,
      system: baseSystem({
        tier: 1,
        stormwaterDemand: 0.3,
        stormwaterDrainageCapacity: 0.35,
        wastewaterDemand: 0.25,
        wastewaterCapacity: 0.3,
        floodExposure: 0.15,
        muddiness: 0.1,
        demandUrgency: 0.1,
        primaryDemandSignal: null
      }),
      geography: baseGeography({ hasRiver: true }),
      people: 5000
    });
    expect(result.lastMaintenanceSpend).toBeGreaterThan(0);
    expect(settlement.treasury!).toBeLessThan(before);
    expect(result.lastMaintenanceCoverage).toBeGreaterThan(0);
  });

  it("collects cleaning tax into burg treasury before maintenance at organised tiers", () => {
    const settlement = burg({ treasury: 10, product: 200, market: 1, population: 10 });
    const result = settleBurgWaterInvestment({
      burg: settlement,
      system: baseSystem({
        tier: 2,
        waterContamination: 0.7,
        sanitationBurden: 0.6,
        floodExposure: 0.5,
        muddiness: 0.4,
        stormwaterDemand: 0.5,
        stormwaterDrainageCapacity: 0.35,
        wastewaterDemand: 0.45,
        wastewaterCapacity: 0.3,
        cleaningTaxRate: 0.02
      }),
      geography: baseGeography({ hasRiver: true }),
      people: 10000
    });
    expect(result.cleaningTaxRate).toBeGreaterThan(0);
    expect(result.lastCleaningTaxRevenue).toBeGreaterThan(0);
  });

  it("starts open ditches under flood demand and advances progress", () => {
    const settlement = burg({ treasury: 500, product: 80, market: 1, population: 8 });
    const result = settleBurgWaterInvestment({
      burg: settlement,
      system: baseSystem({
        tier: 0,
        floodExposure: 0.85,
        muddiness: 0.8,
        stormwaterDemand: 0.7,
        stormwaterDrainageCapacity: 0.15,
        wastewaterDemand: 0.4,
        wastewaterCapacity: 0.12,
        odor: 0.5,
        sanitationBurden: 0.6
      }),
      geography: baseGeography({ hasRiver: true, naturalFloodRisk: 0.6, slopeAdvantage: 0.3 }),
      people: 8000
    });
    expect(result.demandUrgency).toBeGreaterThanOrEqual(WATER_PROJECT_URGENCY_THRESHOLD);
    expect(result.activeProject).toBe("openDitches");
    expect(result.upgradeProgress).toBeGreaterThan(0);
    expect(result.lastConstructionSpend).toBeGreaterThan(0);
  });

  it("completes a nearly finished project and raises tier", () => {
    const settlement = burg({ treasury: 5000, product: 100, market: 1, population: 10 });
    const result = settleBurgWaterInvestment({
      burg: settlement,
      system: baseSystem({
        tier: 0,
        activeProject: "openDitches",
        upgradeProgress: 0.92,
        floodExposure: 0.8,
        muddiness: 0.75,
        stormwaterDemand: 0.65,
        stormwaterDrainageCapacity: 0.15,
        wastewaterDemand: 0.4,
        wastewaterCapacity: 0.12
      }),
      geography: baseGeography({ hasRiver: true, slopeAdvantage: 0.3, naturalFloodRisk: 0.55 }),
      people: 10000
    });
    expect(result.tier).toBe(1);
    expect(result.activeProject).toBe(null);
    expect(result.upgradeProgress).toBe(0);
  });

  it("does not start covered culverts without masonry guild stock", () => {
    const settlement = burg({ treasury: 5000, product: 100, market: 1, population: 12 });
    const result = settleBurgWaterInvestment({
      burg: settlement,
      system: baseSystem({
        tier: 2,
        floodExposure: 0.7,
        muddiness: 0.6,
        stormwaterDemand: 0.7,
        stormwaterDrainageCapacity: 0.4,
        wastewaterDemand: 0.55,
        wastewaterCapacity: 0.3,
        sanitationBurden: 0.55,
        odor: 0.5
      }),
      geography: baseGeography({ hasRiver: true, slopeAdvantage: 0.25, isWetland: true }),
      people: 12000
    });
    expect(result.activeProject).toBe(null);
  });

  it("can start covered culverts when masonry stock and outfall exist", () => {
    setGuildKnowledgeStocks([{ burgId: 1, domain: "masonry", stock: 0.4, treasury: 0 }]);
    const settlement = burg({ treasury: 2000, product: 120, market: 1, population: 15 });
    const result = settleBurgWaterInvestment({
      burg: settlement,
      system: baseSystem({
        tier: 2,
        floodExposure: 0.75,
        muddiness: 0.65,
        stormwaterDemand: 0.75,
        stormwaterDrainageCapacity: 0.45,
        wastewaterDemand: 0.6,
        wastewaterCapacity: 0.35,
        sanitationBurden: 0.55,
        odor: 0.5
      }),
      geography: baseGeography({ hasRiver: true, slopeAdvantage: 0.25, isWetland: true }),
      people: 15000
    });
    expect(result.activeProject).toBe("coveredCulverts");
  });
});

describe("UrbanWater module", () => {
  beforeEach(() => {
    initEconomyContext({
      worldContext,
      simulationContext: { currentYear: 1000, extensions: {} }
    } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
    worldContext.urbanization = 1;
    worldContext.biomesData = {
      tags: Array.from({ length: 13 }, (_, i) => (i === 12 ? ["wetland"] : i === 1 ? ["dry", "desert"] : ["grassland"]))
    } as typeof worldContext.biomesData;
    worldContext.grid = {
      cells: { temp: [12, 12, 12], prec: [50, 20, 80] }
    } as typeof worldContext.grid;
    worldContext.pack = {
      burgs: [
        undefined,
        {
          i: 1,
          cell: 0,
          x: 0,
          y: 0,
          population: 15,
          capital: 1,
          market: 1,
          type: "River",
          state: 1,
          province: 1,
          sanitation: 50,
          treasury: 2000,
          product: 80
        },
        {
          i: 2,
          cell: 1,
          x: 1,
          y: 1,
          population: 0.3,
          type: "Nomadic",
          state: 1,
          province: 1,
          sanitation: 50,
          treasury: 20,
          product: 2
        },
        {
          i: 3,
          cell: 2,
          x: 2,
          y: 2,
          population: 4,
          type: "Generic",
          group: "fort",
          state: 1,
          sanitation: 50
        }
      ],
      cells: {
        h: [30, 45, 22],
        r: [2, 0, 0],
        fl: [30, 0, 0],
        c: [[1], [0], [0]],
        biomeCode: [0, 1, 12],
        g: [0, 1, 2],
        haven: [0, 0, 0]
      },
      cultures: [{ i: 0, type: "Generic" }],
      provinces: [{ i: 1, removed: false, sanitation: 50 }],
      states: [{ i: 1, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Stone", value: 2 } as Good,
      { i: 2, name: "Tools", value: 5 } as Good,
      { i: 3, name: "Brick", value: 3 } as Good,
      { i: 4, name: "Chlorine", value: 20 } as Good
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#000",
        goods: {
          1: { stock: 200, price: 2 },
          2: { stock: 200, price: 5 },
          3: { stock: 200, price: 3 },
          4: { stock: 50, price: 20 }
        }
      } as Market
    ]);
    setGuildKnowledgeStocks([]);
    setUrbanWaterSystems([]);
    setUrbanWaterLastSettledYear(-1);
    setTechnologyProgressForTests([]);
  });

  afterEach(() => {
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  it("generate assigns systems, skips forts, and writes burg.sanitation", () => {
    UrbanWater.generate();
    const systems = getUrbanWaterSystems();
    expect(systems.some(s => s.burgId === 1)).toBe(true);
    expect(systems.some(s => s.burgId === 2)).toBe(true);
    expect(systems.some(s => s.burgId === 3)).toBe(false);

    const riverCity = systems.find(s => s.burgId === 1)!;
    const hamlet = systems.find(s => s.burgId === 2)!;
    expect(riverCity.tier).toBeGreaterThanOrEqual(hamlet.tier);

    const burgs = worldContext.pack.burgs;
    expect(burgs[1]!.sanitation).not.toBe(50);
    expect(burgs[1]!.sanitation).toBe(sanitationScoreFromSystem(riverCity));
    expect(worldContext.pack.provinces![0].sanitation).not.toBe(50);
    expect(worldContext.pack.states![0].sanitation).not.toBe(50);

    // Same civic-score rollup, independent water-specific channel (§3.1).
    expect(burgs[1]!.waterSecurity).toBe(waterSecurityScoreFromSystem(riverCity));
    expect(typeof worldContext.pack.provinces![0].waterSecurity).toBe("number");
    expect(typeof worldContext.pack.states![0].waterSecurity).toBe("number");
  });

  it("raises a qualifying burg's generation-time tier further when historicalPeriod is lateMedieval or later, scaled by the burg's own culture (docs/plan/modern-urban-water-treatment-and-governance.md §18.1)", () => {
    worldContext.options = { historicalPeriod: undefined } as typeof worldContext.options;
    UrbanWater.generate();
    const withoutEra = getUrbanWaterSystems().find(s => s.burgId === 1)!.tier;

    worldContext.options = { historicalPeriod: "rocketryEra" } as typeof worldContext.options;
    UrbanWater.generate();
    const withEra = getUrbanWaterSystems().find(s => s.burgId === 1)!.tier;

    // Burg 1's culture (index 0, "Generic") is unchanged between the two runs — only the
    // historicalPeriod option differs, isolating initialTier()'s new bonus as the cause.
    expect(withEra).toBeGreaterThan(withoutEra);
  });

  it("settleAnnual is once-per-year and can invest under demand", () => {
    UrbanWater.generate();
    const tierBefore = getUrbanWaterSystems().find(s => s.burgId === 1)!.tier;
    expect(UrbanWater.settleAnnual()).toBe(false);
    setUrbanWaterLastSettledYear(999);
    const treasuryBefore = worldContext.pack.burgs[1]!.treasury!;
    expect(UrbanWater.settleAnnual()).toBe(true);
    const after = getUrbanWaterSystems().find(s => s.burgId === 1)!;
    // Tier is preserved or upgraded, never reduced by annual settle.
    expect(after.tier).toBeGreaterThanOrEqual(tierBefore);
    expect(after.lastMaintenanceSpend + after.lastConstructionSpend).toBeGreaterThanOrEqual(0);
    // With treasury and demand, some spend is expected for the river capital.
    expect(worldContext.pack.burgs[1]!.treasury!).toBeLessThanOrEqual(treasuryBefore);
  });

  it("multi-year neglect worsens clogging versus funded maintenance", () => {
    UrbanWater.generate();
    // Starve the capital.
    worldContext.pack.burgs[1]!.treasury = 0;
    setUrbanWaterLastSettledYear(999);
    UrbanWater.settleAnnual();
    setUrbanWaterLastSettledYear(998);
    UrbanWater.settleAnnual();
    setUrbanWaterLastSettledYear(997);
    UrbanWater.settleAnnual();
    const starved = getUrbanWaterSystems().find(s => s.burgId === 1)!;

    // Re-fund and settle a few years.
    worldContext.pack.burgs[1]!.treasury = 5000;
    setUrbanWaterLastSettledYear(996);
    UrbanWater.settleAnnual();
    setUrbanWaterLastSettledYear(995);
    UrbanWater.settleAnnual();
    const recovered = getUrbanWaterSystems().find(s => s.burgId === 1)!;

    expect(starved.lastMaintenanceCoverage).toBeLessThan(0.2);
    expect(recovered.lastMaintenanceCoverage).toBeGreaterThan(starved.lastMaintenanceCoverage);
  });

  it("progresses drinkingTreatmentTier/wastewaterTreatmentTier toward 1 for a well-funded river capital in the modern era (docs/plan/modern-urban-water-treatment-and-governance.md §8 Phase 2)", () => {
    worldContext.options = { historicalPeriod: "steamEra" } as typeof worldContext.options;
    UrbanWater.generate();
    let year = 999;
    for (let i = 0; i < 8; i++) {
      // Re-fund generously each year so this new, secondary initiative isn't starved by whatever
      // the legacy tier ladder spends first out of the same treasury (settleModernWaterTreatment-
      // Investment intentionally runs after settleBurgWaterInvestment — see urbanWaterSystem.ts).
      worldContext.pack.burgs[1]!.treasury = 20000;
      setUrbanWaterLastSettledYear(year--);
      UrbanWater.settleAnnual();
    }
    const system = getUrbanWaterSystems().find(s => s.burgId === 1)!;
    expect(system.drinkingTreatmentTier).toBe(1);
    expect(system.wastewaterTreatmentTier).toBe(1);
    expect(system.sourceProtection).toBeGreaterThan(0);
  });

  it("never reaches a modern treatment tier before the modern water era, however well-funded", () => {
    worldContext.options = { historicalPeriod: "earlyMedieval" } as typeof worldContext.options;
    UrbanWater.generate();
    let year = 999;
    for (let i = 0; i < 8; i++) {
      worldContext.pack.burgs[1]!.treasury = 20000;
      setUrbanWaterLastSettledYear(year--);
      UrbanWater.settleAnnual();
    }
    const system = getUrbanWaterSystems().find(s => s.burgId === 1)!;
    expect(system.drinkingTreatmentTier ?? 0).toBe(0);
    expect(system.wastewaterTreatmentTier ?? 0).toBe(0);
    expect(system.sourceProtection).toBe(0);
  });

  it("progresses drinkingTreatmentTier to 3 once analyticalChemistry and catalyticChemistry both reach demonstrated for the burg's State, given a Chlorine-stocked market (docs/plan/modern-urban-water-treatment-and-governance.md §8, §15 Phase 4)", () => {
    worldContext.options = { historicalPeriod: "steamEra" } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "analyticalChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 },
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    UrbanWater.generate();
    let year = 999;
    for (let i = 0; i < 40; i++) {
      worldContext.pack.burgs[1]!.treasury = 20000;
      // Chlorine is a real, finite market stock (unlike the cash-only steps) — replenish it too,
      // or the very first Tier 3 year would exhaust it and every later year would starve.
      setMarkets([
        {
          i: 1,
          centerBurgId: 1,
          color: "#000",
          goods: {
            1: { stock: 200, price: 2 },
            2: { stock: 200, price: 5 },
            3: { stock: 200, price: 3 },
            4: { stock: 50, price: 20 }
          }
        } as Market
      ]);
      Markets.sync();
      setUrbanWaterLastSettledYear(year--);
      UrbanWater.settleAnnual();
    }
    const system = getUrbanWaterSystems().find(s => s.burgId === 1)!;
    expect(system.drinkingTreatmentTier).toBe(3);
    expect(system.chemicalTestCoverage).toBeGreaterThan(0);
    expect(system.chlorineStockCoverage).toBeGreaterThan(0);
  });

  it("stops drinkingTreatmentTier at 1 without analyticalChemistry/catalyticChemistry, however well-funded", () => {
    worldContext.options = { historicalPeriod: "steamEra" } as typeof worldContext.options;
    UrbanWater.generate();
    let year = 999;
    for (let i = 0; i < 20; i++) {
      worldContext.pack.burgs[1]!.treasury = 20000;
      setUrbanWaterLastSettledYear(year--);
      UrbanWater.settleAnnual();
    }
    const system = getUrbanWaterSystems().find(s => s.burgId === 1)!;
    expect(system.drinkingTreatmentTier).toBe(1);
  });

  it("progresses wastewaterTreatmentTier to 3 once sanitaryEngineering and generatorAndMotor are both ready, given a powered market (docs/plan/modern-urban-water-treatment-and-governance.md §8, §16 Phase 5)", () => {
    worldContext.options = { historicalPeriod: "steamEra" } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "generatorAndMotor", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    UrbanWater.generate();
    let year = 999;
    for (let i = 0; i < 40; i++) {
      worldContext.pack.burgs[1]!.treasury = 20000;
      setMarkets([
        {
          i: 1,
          centerBurgId: 1,
          color: "#000",
          electricityStock: 1,
          goods: {
            1: { stock: 200, price: 2 },
            2: { stock: 200, price: 5 },
            3: { stock: 200, price: 3 }
          }
        } as Market
      ]);
      Markets.sync();
      // sanitaryEngineering is a slow-evolving legacy stock (urbanWaterTech.ts) gated on the
      // legacy tier ladder separately reaching 3+ and administration exceeding 0.95 — neither of
      // which this fixture drives. Force it directly each year (same idea as forcing treasury
      // above) so this test isolates the Phase 5 gate/wiring, not the legacy ladder's own pace.
      const systems = getUrbanWaterSystems();
      const index = systems.findIndex(s => s.burgId === 1);
      if (index >= 0) systems[index] = { ...systems[index]!, sanitaryEngineering: 0.9 };
      setUrbanWaterSystems(systems);
      setUrbanWaterLastSettledYear(year--);
      UrbanWater.settleAnnual();
    }
    const system = getUrbanWaterSystems().find(s => s.burgId === 1)!;
    expect(system.wastewaterTreatmentTier).toBe(3);
    expect(system.effluentTestCoverage).toBeGreaterThan(0);
  });

  it("stops wastewaterTreatmentTier at 1 without sanitaryEngineering/generatorAndMotor, however well-funded", () => {
    worldContext.options = { historicalPeriod: "steamEra" } as typeof worldContext.options;
    UrbanWater.generate();
    let year = 999;
    for (let i = 0; i < 20; i++) {
      worldContext.pack.burgs[1]!.treasury = 20000;
      setUrbanWaterLastSettledYear(year--);
      UrbanWater.settleAnnual();
    }
    const system = getUrbanWaterSystems().find(s => s.burgId === 1)!;
    expect(system.wastewaterTreatmentTier).toBe(1);
  });

  describe("race water tech bias (Giant on Fantasy culture sets)", () => {
    beforeEach(() => {
      // Make State 1 Giant. The capital itself intentionally keeps its generic local culture:
      // generation heritage follows the owning country, not a burg culture left behind by conquest.
      worldContext.pack.cultures = [
        { i: 0, type: "Generic" },
        { i: 1, type: "River", race: 1 }
      ] as typeof worldContext.pack.cultures;
      worldContext.pack.races = [
        { i: 0, key: "unknown", name: "Unknown" },
        { i: 1, key: "giant", name: "Giant" }
      ] as typeof worldContext.pack.races;
      worldContext.pack.states![0]!.culture = 1;
      worldContext.options = { historicalPeriod: "earlyMedieval" } as typeof worldContext.options;
      setGuildKnowledgeStocks([{ burgId: 1, domain: "masonry", stock: 0.5, treasury: 0 }]);
    });

    afterEach(() => useOptionsState.setState({ culturesSet: "world" }));

    function settleYears(count: number): void {
      for (let i = 0; i < count; i++) {
        setUrbanWaterLastSettledYear(999 - i);
        UrbanWater.settleAnnual();
      }
    }

    // Outside Fantasy culture sets, the older bias remains only a fast-track. In a Giant Fantasy
    // state, by contrast, every capital/city is seeded at Roman tier 4 during map generation.
    const YEARS = 15;

    it("seeds every Giant-state capital/city with Roman works, including a city without a local river", () => {
      useOptionsState.setState({ culturesSet: "highFantasy" });
      // The capital's river is the high gravity source; the inland city sits below it and its
      // lower river cell is the trunk-sewer outfall.
      worldContext.pack.cells.h[0] = 60;
      worldContext.pack.cells.r[2] = 2;
      worldContext.pack.burgs[2]!.group = "city";
      UrbanWater.generate();

      const giantCapital = getUrbanWaterSystems().find(s => s.burgId === 1)!;
      const giantInlandCity = getUrbanWaterSystems().find(s => s.burgId === 2)!;
      expect(giantCapital.tier).toBe(4);
      expect(giantInlandCity.tier).toBe(4);
      expect(giantCapital.drinkingTreatmentTier).toBe(1);
      expect(giantCapital.wastewaterTreatmentTier).toBe(1);
      expect(giantInlandCity.drinkingTreatmentTier).toBe(1);
      expect(giantInlandCity.wastewaterTreatmentTier).toBe(1);
      expect(giantInlandCity.hasInheritedRomanWaterworks).toBe(true);
      expect(giantInlandCity.hasInheritedRomanSewer).toBe(true);
      expect(giantInlandCity.hasUpstreamIntake).toBe(true);
      expect(giantInlandCity.hasDownstreamOutfall).toBe(true);
      expect(giantCapital.sanitaryEngineering).toBe(0);

      settleYears(YEARS);
      const maintainedCapital = getUrbanWaterSystems().find(s => s.burgId === 1)!;
      expect(maintainedCapital.tier).toBeGreaterThanOrEqual(4);
      expect(maintainedCapital.drinkingTreatmentTier).toBe(1);
      expect(maintainedCapital.wastewaterTreatmentTier).toBe(1);
      expect(maintainedCapital.hasInheritedRomanWaterworks).toBe(true);
    });

    it("never spends Giant burg treasury on Modern Phase 2/4/5 construction, even when analyticalChemistry/catalyticChemistry/generatorAndMotor are all ready for the Giant State (regression: computeUrbanWaterSystem always overrides a Giant's tiers back to 1, so any such spend would be silently wasted — §15.2)", () => {
      useOptionsState.setState({ culturesSet: "highFantasy" });
      worldContext.options = { historicalPeriod: "steamEra" } as typeof worldContext.options;
      setTechnologyProgressForTests([
        { technologyId: "analyticalChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 },
        { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 },
        { technologyId: "generatorAndMotor", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
      ]);
      UrbanWater.generate();
      // Force high sanitaryEngineering too, same trick the Phase 5 progression test uses — a Giant
      // that already met every other Phase 5 gate should still never spend on wastewater Tier 2/3.
      const seeded = getUrbanWaterSystems();
      const giantIndex = seeded.findIndex(s => s.burgId === 1);
      if (giantIndex >= 0) seeded[giantIndex] = { ...seeded[giantIndex]!, sanitaryEngineering: 0.9 };
      setUrbanWaterSystems(seeded);

      let year = 999;
      for (let i = 0; i < 10; i++) {
        worldContext.pack.burgs[1]!.treasury = 20000;
        setUrbanWaterLastSettledYear(year--);
        UrbanWater.settleAnnual();
      }
      const giantCapital = getUrbanWaterSystems().find(s => s.burgId === 1)!;
      expect(giantCapital.drinkingTreatmentTier).toBe(1);
      expect(giantCapital.wastewaterTreatmentTier).toBe(1);
      expect(giantCapital.lastModernConstructionSpend).toBe(0);
      // The 20000 refund minus this year's legacy-ladder spend should still be sitting there —
      // nothing was silently drawn down by a discarded Tier 2/3 attempt.
      expect(worldContext.pack.burgs[1]!.treasury).toBeGreaterThan(15000);
    });

    it("extends the inherited aqueduct and trunk sewer to Giant-state villages and forts", () => {
      useOptionsState.setState({ culturesSet: "highFantasy" });
      worldContext.pack.burgs[2]!.group = "fort";
      UrbanWater.generate();

      const giantFort = getUrbanWaterSystems().find(s => s.burgId === 2)!;
      expect(giantFort.tier).toBe(4);
      expect(giantFort.hasInheritedRomanWaterworks).toBe(true);
      expect(giantFort.hasInheritedRomanSewer).toBe(true);
    });

    it("does not seed Roman works outside Fantasy culture sets, even for the same Giant state", () => {
      useOptionsState.setState({ culturesSet: "world" });
      UrbanWater.generate();
      settleYears(YEARS);

      // Same geography/masonry/population as the seeded test: without the Fantasy-culture-set
      // gate, this burg remains on the normal, gradual development path.
      const sameCity = getUrbanWaterSystems().find(s => s.burgId === 1)!;
      expect(sameCity.tier).toBeLessThan(4);
      expect(sameCity.waterLifting).toBeLessThanOrEqual(0.35 + 0.0001);
    });

    it("uses the Giant State's engineering tradition to maintain its inherited works", () => {
      worldContext.pack.cultures!.push({ i: 2, type: "Local", race: 2 });
      worldContext.pack.races!.push({ i: 2, key: "human", name: "Human" });
      worldContext.pack.burgs[1]!.culture = 2;

      const giantStateWaterworks = raceKeyForBurgWaterworks(worldContext.pack.burgs[1], true);
      const ordinaryLocalWaterworks = raceKeyForBurgWaterworks(worldContext.pack.burgs[1], false);

      expect(giantStateWaterworks).toBe("giant");
      expect(ordinaryLocalWaterworks).toBe("human");
    });
  });

  describe("modern-ladder generation seed (docs/plan/modern-urban-water-treatment-and-governance.md §11/§19, formerly Industrial-culture rocketryEra-only)", () => {
    beforeEach(() => {
      worldContext.pack.cultures = [
        { i: 0, type: "Generic" },
        { i: 1, type: "Industrial" }
      ] as typeof worldContext.pack.cultures;
      // Gated at the BURG's own local culture (modernizationAffinityForBurg), not the owning
      // State's — see modernWaterworksGenerationSeed()'s doc comment. burg 1 defaults to population
      // 15 (15,000 people); burg 2 to population 0.3 (300 people, below MODERN_WATER_MIN_POPULATION).
      worldContext.pack.burgs[1]!.culture = 1;
      worldContext.options = { historicalPeriod: "rocketryEra" } as typeof worldContext.options;
    });

    it("seeds a large industrial city (population >= 15000) at drinkingTreatmentTier/wastewaterTreatmentTier 3 at rocketryEra", () => {
      // readiness = techLevelProgress(rocketryEra) 1 * affinity(Industrial prior) 0.85 = 0.85;
      // populationBand 3 (15,000 people) -> tier round(3*0.85) = 3.
      UrbanWater.generate();
      const capital = getUrbanWaterSystems().find(s => s.burgId === 1)!;
      expect(capital.drinkingTreatmentTier).toBe(3);
      expect(capital.wastewaterTreatmentTier).toBe(3);
      expect(capital.sourceProtection).toBe(1);
    });

    it("seeds a mid-size town (4,000-14,999 people) at tier 2 at rocketryEra", () => {
      worldContext.pack.burgs[1]!.population = 5; // 5,000 people
      UrbanWater.generate();
      const town = getUrbanWaterSystems().find(s => s.burgId === 1)!;
      expect(town.drinkingTreatmentTier).toBe(2);
      expect(town.wastewaterTreatmentTier).toBe(2);
    });

    it("seeds a small town just above the population floor at tier 1 at rocketryEra", () => {
      worldContext.pack.burgs[1]!.population = 1; // 1,000 people
      UrbanWater.generate();
      const town = getUrbanWaterSystems().find(s => s.burgId === 1)!;
      expect(town.drinkingTreatmentTier).toBe(1);
      expect(town.wastewaterTreatmentTier).toBe(1);
    });

    it("regression: seeds a large industrial city at petroleumEra too, not just rocketryEra (reported: petroleumEra + Industrial produced no water/sewer at all)", () => {
      worldContext.options = { historicalPeriod: "petroleumEra" } as typeof worldContext.options;
      // techLevelProgress(petroleumEra) = (7-5)/3 = 0.667; readiness = 0.667*0.85 = 0.567;
      // populationBand 3 -> tier round(3*0.567) = round(1.7) = 2.
      UrbanWater.generate();
      const capital = getUrbanWaterSystems().find(s => s.burgId === 1)!;
      expect(capital.drinkingTreatmentTier).toBeGreaterThanOrEqual(1);
      expect(capital.wastewaterTreatmentTier).toBeGreaterThanOrEqual(1);
    });

    it("gives no head start below MODERN_WATER_MIN_POPULATION, even for an Industrial-culture burg", () => {
      worldContext.pack.burgs[2]!.culture = 1;
      UrbanWater.generate();
      const hamlet = getUrbanWaterSystems().find(s => s.burgId === 2)!;
      expect(hamlet.drinkingTreatmentTier).toBe(0);
      expect(hamlet.wastewaterTreatmentTier).toBe(0);
    });

    it("does not seed before steamEra, even for an Industrial-culture burg (§10: no retroactive modern treatment plant)", () => {
      worldContext.options = { historicalPeriod: "preIndustrialEra" } as typeof worldContext.options;
      UrbanWater.generate();
      const capital = getUrbanWaterSystems().find(s => s.burgId === 1)!;
      expect(capital.drinkingTreatmentTier).toBe(0);
      expect(capital.wastewaterTreatmentTier).toBe(0);
    });

    it("gives a low-affinity culture essentially none of the rocketryEra bonus, unlike Industrial", () => {
      worldContext.pack.cultures!.push({ i: 2, type: "Nomadic" } as (typeof worldContext.pack.cultures)[number]);
      worldContext.pack.burgs[1]!.culture = 2; // Nomadic prior 0.08, not the Industrial fixture above
      UrbanWater.generate();
      const capital = getUrbanWaterSystems().find(s => s.burgId === 1)!;
      expect(capital.drinkingTreatmentTier).toBe(0);
      expect(capital.wastewaterTreatmentTier).toBe(0);
    });
  });
});
