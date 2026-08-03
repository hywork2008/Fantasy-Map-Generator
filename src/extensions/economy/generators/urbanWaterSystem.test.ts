import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getUrbanWaterSystems,
  initEconomyContext,
  setUrbanWaterLastSettledYear,
  setUrbanWaterSystems
} from "../economyContext";
import type { BurgWaterGeography } from "./urbanWaterSystem";
import {
  computeUrbanWaterSystem,
  culturalHygieneProfile,
  initialTier,
  readBurgWaterGeography,
  sanitationScoreFromSystem,
  UrbanWater
} from "./urbanWaterSystem";

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
      cultureType: "River"
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
      "maintenanceCondition"
    ] as const) {
      expect(system[key]).toBeGreaterThanOrEqual(0);
      expect(system[key]).toBeLessThanOrEqual(1);
    }
    expect(system.hasDownstreamOutfall).toBe(true);
    expect(system.hasSeparateWastewaterRoute).toBe(false);
  });

  it("raises flood exposure when stormwater demand exceeds capacity", () => {
    const dry = computeUrbanWaterSystem({
      burg: burg({ population: 0.2 }),
      geography: baseGeography({ precipitation: 10, naturalFloodRisk: 0.05 }),
      people: 200,
      cultureType: "Generic"
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
      previous: { ...dry, tier: 0, maintenanceCondition: 0.5 }
    });
    expect(soaked.floodExposure).toBeGreaterThan(dry.floodExposure);
    expect(soaked.muddiness).toBeGreaterThan(dry.muddiness);
  });

  it("maps systems to civic sanitation scores between 0 and 100", () => {
    const system = computeUrbanWaterSystem({
      burg: burg({ population: 3 }),
      geography: baseGeography({ hasRiver: true }),
      people: 3000,
      cultureType: "Generic"
    });
    const score = sanitationScoreFromSystem(system);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("preserves tier when previous is provided", () => {
    const first = computeUrbanWaterSystem({
      burg: burg({ population: 10, capital: 1, market: 1 }),
      geography: baseGeography({ hasRiver: true }),
      people: 12000,
      cultureType: "River"
    });
    const second = computeUrbanWaterSystem({
      burg: burg({ population: 1 }),
      geography: baseGeography(),
      people: 500,
      cultureType: "Generic",
      previous: first
    });
    expect(second.tier).toBe(first.tier);
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
          sanitation: 50
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
          sanitation: 50
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
  });

  it("settleAnnual is once-per-year and preserves tier", () => {
    UrbanWater.generate();
    const tierBefore = getUrbanWaterSystems().find(s => s.burgId === 1)!.tier;
    expect(UrbanWater.settleAnnual()).toBe(false);
    setUrbanWaterLastSettledYear(999);
    expect(UrbanWater.settleAnnual()).toBe(true);
    expect(getUrbanWaterSystems().find(s => s.burgId === 1)!.tier).toBe(tierBefore);
  });
});
