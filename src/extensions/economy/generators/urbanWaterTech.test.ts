import { describe, expect, it } from "vitest";
import {
  buildInterstatePollutionEdges,
  canStartAdvancedProject,
  evolveWaterTechStocks,
  hasSeparateWastewaterRoute,
  maxInvestableTier,
  pollutionCompensationAmount,
  settlePollutionCompensation,
  waterLiftingCapacityBonus,
  waterTechCeilings
} from "./urbanWaterTech";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

function system(overrides: Partial<UrbanWaterSystem> & { burgId: number }): UrbanWaterSystem {
  return {
    burgId: overrides.burgId,
    tier: 3,
    drinkingWaterSecurity: 0.5,
    serviceWaterCapacity: 0.4,
    irrigationCapacity: 0.3,
    stormwaterDrainageCapacity: 0.5,
    wastewaterCapacity: 0.4,
    maintenanceCondition: 0.8,
    sanitationBurden: 0.4,
    waterContamination: 0.4,
    floodExposure: 0.3,
    muddiness: 0.3,
    odor: 0.3,
    hasUpstreamIntake: true,
    hasDownstreamOutfall: true,
    hasSeparateWastewaterRoute: false,
    stormwaterDemand: 0.5,
    wastewaterDemand: 0.45,
    clogging: 0.1,
    upgradeProgress: 0,
    activeProject: null,
    primaryDemandSignal: null,
    demandUrgency: 0.5,
    lastMaintenanceCoverage: 1,
    lastMaintenanceSpend: 0,
    lastConstructionSpend: 0,
    connectionPermitCoverage: 0.3,
    cleaningTaxRate: 0.02,
    dischargeRegulation: 0.3,
    lastCleaningTaxRevenue: 0,
    organicStreetLoad: 0.3,
    compostingEfficiency: 0.2,
    pigToiletPractice: 0,
    upstreamPollutionImport: 0.2,
    downstreamPollutionExport: 0.4,
    healthPressure: 0.3,
    localMixedIntakeOutfall: true,
    waterLifting: 0.2,
    municipalSanitation: 0.3,
    sanitaryEngineering: 0,
    lastPollutionCompensationPaid: 0,
    lastPollutionCompensationReceived: 0,
    pollutionDiplomaticStrain: 0,
    ...overrides
  };
}

describe("water tech ceilings and evolution", () => {
  it("blocks sanitary engineering in early medieval", () => {
    expect(waterTechCeilings("earlyMedieval").sanitaryEngineering).toBe(0);
    expect(waterTechCeilings("lateMedieval").sanitaryEngineering).toBeGreaterThan(
      waterTechCeilings("highMedieval").sanitaryEngineering
    );
  });

  it("grows water lifting under drought and river access", () => {
    const next = evolveWaterTechStocks({
      previous: { waterLifting: 0.1, municipalSanitation: 0.1, sanitaryEngineering: 0 },
      period: "highMedieval",
      tier: 2,
      hasRiver: true,
      droughtDemand: 0.8,
      contamination: 0.3,
      sanitationBurden: 0.3,
      connectionPermitCoverage: 0.1,
      dischargeRegulation: 0.1,
      cleaningTaxRate: 0.01,
      administrationBonus: 1,
      masonryStock: 0.2,
      liftingWorksProgress: 1
    });
    expect(next.waterLifting).toBeGreaterThan(0.1);
  });

  it("does not unlock tier 5 without sanitary engineering stock", () => {
    expect(
      maxInvestableTier({
        waterLifting: 0.5,
        municipalSanitation: 0.5,
        sanitaryEngineering: 0.05,
        connectionPermitCoverage: 0.5,
        dischargeRegulation: 0.5,
        administrationBonus: 1.2
      })
    ).toBe(4);
    expect(
      maxInvestableTier({
        waterLifting: 0.5,
        municipalSanitation: 0.5,
        sanitaryEngineering: 0.3,
        connectionPermitCoverage: 0.5,
        dischargeRegulation: 0.5,
        administrationBonus: 1.2
      })
    ).toBe(5);
  });

  it("requires municipal stock for managed sewers", () => {
    expect(
      canStartAdvancedProject({
        project: "managedSewers",
        masonryStock: 0.2,
        waterLifting: 0.2,
        municipalSanitation: 0.1,
        sanitaryEngineering: 0,
        connectionPermitCoverage: 0.1,
        dischargeRegulation: 0.1,
        administrationBonus: 1,
        hasRiver: true,
        hasOutfall: true,
        people: 5000
      })
    ).toBe(false);
    expect(
      canStartAdvancedProject({
        project: "managedSewers",
        masonryStock: 0.2,
        waterLifting: 0.2,
        municipalSanitation: 0.35,
        sanitaryEngineering: 0,
        connectionPermitCoverage: 0.3,
        dischargeRegulation: 0.25,
        administrationBonus: 1,
        hasRiver: true,
        hasOutfall: true,
        people: 5000
      })
    ).toBe(true);
  });

  it("marks separate wastewater routes at tier 5 or high sanitary stock", () => {
    expect(hasSeparateWastewaterRoute({ tier: 3, sanitaryEngineering: 0.1 })).toBe(false);
    expect(hasSeparateWastewaterRoute({ tier: 5, sanitaryEngineering: 0.1 })).toBe(true);
    expect(hasSeparateWastewaterRoute({ tier: 3, sanitaryEngineering: 0.5 })).toBe(true);
  });

  it("boosts supply capacities from water lifting without raising drainage", () => {
    const bonus = waterLiftingCapacityBonus(0.5);
    expect(bonus.service).toBeGreaterThan(1);
    expect(bonus.drinking).toBeGreaterThan(1);
  });
});

describe("pollution compensation diplomacy", () => {
  it("builds edges only across different states on the same river", () => {
    const systems = [
      system({ burgId: 1, downstreamPollutionExport: 0.5 }),
      system({ burgId: 2, upstreamPollutionImport: 0.4, downstreamPollutionExport: 0.2 }),
      system({ burgId: 3, upstreamPollutionImport: 0.3, downstreamPollutionExport: 0.1 })
    ];
    const edges = buildInterstatePollutionEdges({
      systems,
      burgState: new Map([
        [1, 10],
        [2, 20],
        [3, 20]
      ]),
      burgRiver: new Map([
        [1, 9],
        [2, 9],
        [3, 9]
      ]),
      burgUpstreamRank: new Map([
        [1, 100],
        [2, 50],
        [3, 10]
      ])
    });
    expect(edges.some(e => e.upstreamBurgId === 1 && e.downstreamBurgId === 2)).toBe(true);
    expect(edges.some(e => e.upstreamStateId === e.downstreamStateId)).toBe(false);
  });

  it("transfers treasury and records shortfalls", () => {
    const treasuries = new Map<number, number>([
      [10, 100],
      [20, 10]
    ]);
    const edges = [
      {
        upstreamBurgId: 1,
        downstreamBurgId: 2,
        upstreamStateId: 10,
        downstreamStateId: 20,
        importLoad: 0.5,
        exportLoad: 0.5
      }
    ];
    const amount = pollutionCompensationAmount({
      edge: edges[0]!,
      upstreamProduct: 200,
      downstreamPeople: 8000
    });
    expect(amount).toBeGreaterThan(0);

    const settlement = settlePollutionCompensation({
      edges,
      getStateTreasury: id => treasuries.get(id) ?? 0,
      setStateTreasury: (id, value) => treasuries.set(id, value),
      getBurgProduct: () => 200,
      getBurgPeople: () => 8000,
      previousStrain: new Map()
    });
    expect(treasuries.get(10)!).toBeLessThan(100);
    expect(treasuries.get(20)!).toBeGreaterThan(10);
    expect(settlement.byBurgPaid.get(1) ?? 0).toBeGreaterThan(0);
    expect(settlement.byBurgReceived.get(2) ?? 0).toBeGreaterThan(0);
  });
});
