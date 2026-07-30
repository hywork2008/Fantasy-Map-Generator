import { afterEach, describe, expect, it } from "vitest";
import { getDeathsByState, resetPopulationLossTracker, useOptionsState } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import {
  clearEconomyContext,
  getBanditCohorts,
  getFrontierAdultCohorts,
  getMobileAdultCohorts,
  getUrbanLaborIntakes,
  initEconomyContext,
  setBanditCohorts,
  setBasicEmploymentSummary,
  setFrontierAdultCohorts,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import {
  calculateAnnualUrbanLaborIntake,
  calculateAnnualUrbanLaborIntakeFromEmploymentDemand,
  UrbanLaborIntakeModule
} from "./urbanLaborIntake";

const DEFAULT_RURAL_URBAN_MIGRATION = useOptionsState.getState().ruralUrbanMigration;

afterEach(() => {
  clearEconomyContext();
  resetPopulationLossTracker();
  useOptionsState.setState({ ruralUrbanMigration: DEFAULT_RURAL_URBAN_MIGRATION });
});

describe("annual urban labour intake", () => {
  it("uses population growth capacity but never exceeds food-supported remaining capacity", () => {
    const burg = {
      population: 100,
      demographics: { capacity: 110, effectiveCapacity: 101, children: 0, maleAdults: 0, femaleAdults: 0, elders: 0 }
    };

    expect(calculateAnnualUrbanLaborIntake(burg, 1.5, 1.15)).toBeCloseTo(1);
  });

  it("uses the base capacity when imported-food capacity is absent", () => {
    const burg = {
      population: 100,
      demographics: { capacity: 110, children: 0, maleAdults: 0, femaleAdults: 0, elders: 0 }
    };

    expect(calculateAnnualUrbanLaborIntake(burg, 0.5, 1)).toBeCloseTo(1);
  });

  it("settles only adults covered by nearby yearly intake and turns repeat failures into bandits", () => {
    const world = {
      graphWidth: 100,
      graphHeight: 100,
      pack: {
        cells: { p: [[0, 0]] },
        burgs: [
          { cell: 0 },
          {
            i: 1,
            cell: 0,
            state: 1,
            x: 10,
            y: 0,
            population: 100,
            demographics: {
              capacity: 101,
              effectiveCapacity: 101,
              children: 0,
              maleAdults: 50,
              femaleAdults: 50,
              elders: 0
            }
          }
        ]
      }
    };
    initEconomyContext({
      worldContext: world,
      simulationContext: { currentYear: 100, extensions: {} }
    } as unknown as ExtensionAPI);
    const module = new UrbanLaborIntakeModule();
    const neutralRandom = { rand: () => 0.5 };

    module.generateAnnualIntakes(world as never, neutralRandom);
    module.enqueueRuralDisplacement({
      originCell: 0,
      originState: 1,
      maleAdults: 1,
      femaleAdults: 1,
      yearsSearching: 0
    });
    const firstYear = module.resolveMobileAdults(world as never, neutralRandom);

    expect(firstYear.settledAdults).toBeCloseTo(1);
    expect(getMobileAdultCohorts()).toHaveLength(1);

    module.generateAnnualIntakes(world as never, neutralRandom);
    module.resolveMobileAdults(world as never, { rand: () => 0.4 });

    expect(getMobileAdultCohorts()).toHaveLength(0);
    expect(getBanditCohorts()).toHaveLength(1);
  });

  it("aggregates a frontier-bound cohort into the host's applicant pool instead of an ever-growing list", () => {
    const fakeSimulation = {
      currentYear: 100,
      extensions: {},
      frontier: { applicantPoolByState: {} as Record<number, unknown> }
    };
    const world = { graphWidth: 100, graphHeight: 100, pack: { cells: { p: [[0, 0]] }, burgs: [{ cell: 0 }] } };
    initEconomyContext({ worldContext: world, simulationContext: fakeSimulation } as unknown as ExtensionAPI);
    const module = new UrbanLaborIntakeModule();

    module.enqueueRuralDisplacement({
      originCell: 0,
      originState: 3,
      maleAdults: 2,
      femaleAdults: 2,
      yearsSearching: 1
    });
    module.resolveMobileAdults(world as never, { rand: () => 0.1 }); // 0.1 < 0.35 -> frontier

    expect(fakeSimulation.frontier.applicantPoolByState[3]).toEqual({ maleAdults: 2, femaleAdults: 2 });
    expect(getFrontierAdultCohorts()).toHaveLength(0);
  });

  it("sweeps any pre-existing frontierAdultCohorts (from before this change) into the pool once", () => {
    const fakeSimulation = {
      currentYear: 100,
      extensions: {},
      frontier: { applicantPoolByState: {} as Record<number, unknown> }
    };
    const world = { graphWidth: 100, graphHeight: 100, pack: { cells: { p: [[0, 0]] }, burgs: [{ cell: 0 }] } };
    initEconomyContext({ worldContext: world, simulationContext: fakeSimulation } as unknown as ExtensionAPI);
    setFrontierAdultCohorts([{ originCell: 5, originState: 2, maleAdults: 3, femaleAdults: 1, yearsSearching: 0 }]);

    new UrbanLaborIntakeModule().resolveMobileAdults(world as never, { rand: () => 0.9 });

    expect(fakeSimulation.frontier.applicantPoolByState[2]).toEqual({ maleAdults: 3, femaleAdults: 1 });
    expect(getFrontierAdultCohorts()).toHaveLength(0);
  });

  it("records the death/emigration outcome via recordDeaths, scaled by populationRate", () => {
    const world = {
      populationRate: 1000,
      graphWidth: 100,
      graphHeight: 100,
      pack: { cells: { p: [[0, 0]] }, burgs: [{ cell: 0 }] }
    };
    initEconomyContext({
      worldContext: world,
      simulationContext: { currentYear: 100, extensions: {}, frontier: { applicantPoolByState: {} } }
    } as unknown as ExtensionAPI);
    const module = new UrbanLaborIntakeModule();
    module.enqueueRuralDisplacement({
      originCell: 0,
      originState: 5,
      maleAdults: 1,
      femaleAdults: 1,
      yearsSearching: 1
    });

    module.resolveMobileAdults(world as never, { rand: () => 0.9 }); // 0.9 >= 0.6 -> death/emigration

    expect(getDeathsByState("day").get(5)?.other).toBeCloseTo(2000);
  });
});

describe("employment-demand-driven intake (Phase 4, §5.1 decision 4)", () => {
  function buildWorld() {
    return {
      graphWidth: 100,
      graphHeight: 100,
      pack: {
        cells: { p: [[0, 0]] },
        burgs: [
          { cell: 0 },
          {
            i: 1,
            cell: 0,
            state: 1,
            x: 10,
            y: 0,
            population: 100,
            demographics: {
              capacity: 200,
              effectiveCapacity: 200,
              children: 0,
              maleAdults: 50,
              femaleAdults: 50,
              elders: 0
            }
          }
        ]
      }
    };
  }

  it("calculateAnnualUrbanLaborIntakeFromEmploymentDemand offers only the unfilled-jobs gap, bounded by capacity", () => {
    const burg = {
      population: 100,
      demographics: { capacity: 200, effectiveCapacity: 200, children: 0, maleAdults: 50, femaleAdults: 50, elders: 0 }
    };

    // employmentDemand 120 vs 100 current adults -> gap 20, at neutral cycle/variation.
    expect(calculateAnnualUrbanLaborIntakeFromEmploymentDemand(burg, 120, 1, 1)).toBeCloseTo(20);
    // employmentDemand already covered by current adults -> no intake, never negative.
    expect(calculateAnnualUrbanLaborIntakeFromEmploymentDemand(burg, 80, 1, 1)).toBe(0);
  });

  it("ignores basicEmploymentSummary in 'independent' mode — the classic population-rate formula runs unchanged (§6 invariant)", () => {
    useOptionsState.setState({ ruralUrbanMigration: "independent" });
    const world = buildWorld();
    initEconomyContext({
      worldContext: world,
      simulationContext: { currentYear: 100, extensions: {} }
    } as unknown as ExtensionAPI);
    setBasicEmploymentSummary([{ burgId: 1, basicEmploymentDemand: 80, serviceEmploymentDemand: 40 }]);
    const neutralRandom = { rand: () => 0.5 };

    new UrbanLaborIntakeModule().generateAnnualIntakes(world as never, neutralRandom);

    // population(100) * 0.02 * businessCycle(1) * localVariation(1) = 2, regardless of the
    // (much larger) employmentDemand set above.
    expect(getUrbanLaborIntakes()[0].offeredAdults).toBeCloseTo(2);
  });

  it("drives intake from employmentDemand in 'megacity' mode", () => {
    useOptionsState.setState({ ruralUrbanMigration: "megacity" });
    const world = buildWorld();
    initEconomyContext({
      worldContext: world,
      simulationContext: { currentYear: 100, extensions: {} }
    } as unknown as ExtensionAPI);
    setBasicEmploymentSummary([{ burgId: 1, basicEmploymentDemand: 80, serviceEmploymentDemand: 40 }]);
    const neutralRandom = { rand: () => 0.5 };

    new UrbanLaborIntakeModule().generateAnnualIntakes(world as never, neutralRandom);

    // employmentDemand(120) - currentAdults(100) = 20 unfilled jobs.
    expect(getUrbanLaborIntakes()[0].offeredAdults).toBeCloseTo(20);
  });

  it("offers nothing in 'megacity' mode to a Burg with no recorded employment demand", () => {
    useOptionsState.setState({ ruralUrbanMigration: "megacity" });
    const world = buildWorld();
    initEconomyContext({
      worldContext: world,
      simulationContext: { currentYear: 100, extensions: {} }
    } as unknown as ExtensionAPI);
    // No setBasicEmploymentSummary call — this Burg has no basic/service industry yet.
    const neutralRandom = { rand: () => 0.5 };

    new UrbanLaborIntakeModule().generateAnnualIntakes(world as never, neutralRandom);

    expect(getUrbanLaborIntakes()[0].offeredAdults).toBe(0);
  });
});

describe("raidBanditFood", () => {
  it("raids a randomly chosen non-empty age bucket at the cohort's origin Market", () => {
    initEconomyContext({
      worldContext: {},
      simulationContext: { currentYear: 100, extensions: {} }
    } as unknown as ExtensionAPI);
    setMarketCellColumn(new Uint16Array([1]));
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        goods: {},
        foodLedger: {
          foodProduced: 0,
          ruralNeed: 0,
          urbanNeed: 0,
          exportable: 0,
          importNeed: 0,
          targetStock: 0,
          satisfiedImport: 0,
          importCapacityBonus: 0,
          foodStockAge0: 0,
          foodStockAge1: 100,
          foodStockAge2: 0,
          foodStockAge0UnitCost: 0,
          foodStockAge1UnitCost: 1,
          foodStockAge2UnitCost: 0,
          storageOverflow: 0,
          ruralFoodStressQuarters: 0,
          urbanFoodStressQuarters: 0,
          ruralSevereDeficitQuarters: 0,
          urbanSevereDeficitQuarters: 0
        }
      }
    ]);
    setBanditCohorts([{ originCell: 0, targetState: 9, maleAdults: 5, femaleAdults: 5 }]);

    // Only foodStockAge1 is non-empty, so it must be the one picked regardless of rng draw.
    const result = new UrbanLaborIntakeModule().raidBanditFood({ populationRate: 1000 } as never, { rand: () => 0.99 });

    expect(result.totalRaided).toBeCloseTo(1.075); // raidCapacity = 10 * 0.43 / 4
    expect(result.weakenedCohorts).toBe(0);
    expect(result.shrunkCohorts).toBe(0);
    expect(getBanditCohorts()[0]).toMatchObject({ consecutiveShortfallQuarters: 0 });
  });

  it("marks a cohort weakened when its origin Market can't fully cover the raid, without shrinking it yet", () => {
    initEconomyContext({
      worldContext: {},
      simulationContext: { currentYear: 100, extensions: {} }
    } as unknown as ExtensionAPI);
    setMarketCellColumn(new Uint16Array([1]));
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        goods: {},
        foodLedger: {
          foodProduced: 0,
          ruralNeed: 0,
          urbanNeed: 0,
          exportable: 0,
          importNeed: 0,
          targetStock: 0,
          satisfiedImport: 0,
          importCapacityBonus: 0,
          foodStockAge0: 0.5, // raidCapacity is 1.075; this covers only ~47% (a ~53% shortfall)
          foodStockAge1: 0,
          foodStockAge2: 0,
          foodStockAge0UnitCost: 1,
          foodStockAge1UnitCost: 0,
          foodStockAge2UnitCost: 0,
          storageOverflow: 0,
          ruralFoodStressQuarters: 0,
          urbanFoodStressQuarters: 0,
          ruralSevereDeficitQuarters: 0,
          urbanSevereDeficitQuarters: 0
        }
      }
    ]);
    setBanditCohorts([{ originCell: 0, targetState: 9, maleAdults: 5, femaleAdults: 5 }]);

    const result = new UrbanLaborIntakeModule().raidBanditFood({ populationRate: 1000 } as never, { rand: () => 0 });

    expect(result.totalRaided).toBeCloseTo(0.5);
    expect(result.weakenedCohorts).toBe(1);
    expect(result.shrunkCohorts).toBe(0);
    expect(getBanditCohorts()[0]).toMatchObject({ maleAdults: 5, femaleAdults: 5, consecutiveShortfallQuarters: 1 });
  });

  it("shrinks a cohort (and records the loss) after two consecutive severe-shortfall quarters, never returning it to population", () => {
    initEconomyContext({
      worldContext: {},
      simulationContext: { currentYear: 100, extensions: {} }
    } as unknown as ExtensionAPI);
    setMarketCellColumn(new Uint16Array([1]));
    setMarkets([{ i: 1, centerBurgId: 1, color: "#fff", goods: {} }]); // no foodLedger at all -> total shortfall
    setBanditCohorts([
      { originCell: 0, targetState: 9, maleAdults: 5, femaleAdults: 5, consecutiveShortfallQuarters: 1 }
    ]);
    const module = new UrbanLaborIntakeModule();

    const result = module.raidBanditFood({ populationRate: 1000 } as never, { rand: () => 0 });

    // shortfallRate = 1 (nothing raided); survivingRatio = 1 - 1 * 0.10 = 0.9
    expect(result.shrunkCohorts).toBe(1);
    const survivor = getBanditCohorts()[0];
    expect(survivor.maleAdults).toBeCloseTo(4.5);
    expect(survivor.femaleAdults).toBeCloseTo(4.5);
    expect(survivor.consecutiveShortfallQuarters).toBe(2);
    expect(getDeathsByState("day").get(9)?.other).toBeCloseTo(1000); // 1 population point lost * 1000 rate
  });
});
