import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
      { i: 3, name: "Brick", value: 3 } as Good
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#000",
        goods: {
          1: { stock: 200, price: 2 },
          2: { stock: 200, price: 5 },
          3: { stock: 200, price: 3 }
        }
      } as Market
    ]);
    setGuildKnowledgeStocks([]);
    setUrbanWaterSystems([]);
    setUrbanWaterLastSettledYear(-1);
  });

  afterEach(() => clearEconomyContext());

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
});
