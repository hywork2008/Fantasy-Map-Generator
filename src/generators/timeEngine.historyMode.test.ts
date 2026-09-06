import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initRng } from "../context/appServices";
import { createEmptyFrontierSimulationState, simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { runDaily } from "../runtime/simulationRunner";
import { stepDaySimulation } from "../runtime/worldRuntime";
import { useFastAdvanceState } from "../store/fastAdvanceState";
import { useOptionsState } from "../store/optionsState";
import { resetHistoryModeRunForTests } from "./fastAdvance/historyModeRun";
import { registerSimulationSystem } from "./timeEngine";

/**
 * Phase H2–H4 integration (docs/plan/advance-time-history-mode.md).
 *
 * These assert the three properties the whole feature rests on, at the level where they actually
 * take effect rather than in isolation: the monthly stride still lands on every calendar gate,
 * masked systems really are skipped, and `profile: "off"` leaves ordinary advances untouched.
 */

const DAYS_IN_YEAR_1000 = 365; // 1000 is divisible by 100 but not 400 — not a leap year.

function seedMinimalWorld(seed: string): void {
  worldContext.seed = seed;
  worldContext.options = { year: 1000, month: 1, day: 1, era: "Test" } as never;
  worldContext.nameBases = [];
  worldContext.biomesData = { habitability: [0] } as never;
  worldContext.notes = [];
  worldContext.grid = {} as never;
  worldContext.mapCoordinates = { latN: 40, latS: 20 } as never;
  worldContext.populationRate = 1000;
  worldContext.urbanization = 2;
  worldContext.pack = {
    states: [
      { i: 0, diplomacy: [] },
      { i: 1, diplomacy: [], treasury: 0, removed: false }
    ],
    burgs: [],
    routes: [],
    cells: {
      i: [0, 1],
      state: [0, 1],
      province: [0, 5],
      pop: [0, 1000],
      maleAdults: new Float32Array([0, 220]),
      femaleAdults: new Float32Array([0, 230]),
      children: new Float32Array([0, 400]),
      elders: new Float32Array([0, 150]),
      capacity: [0, 5000],
      h: new Uint8Array([25, 25]),
      f: new Uint16Array([1, 1]),
      c: [[], []],
      p: [
        [0, 0],
        [1, 1]
      ]
    }
  } as never;

  simulationContext.currentYear = 1000;
  simulationContext.currentMonth = 1;
  simulationContext.currentDay = 1;
  simulationContext.tickCount = 0;
  simulationContext.frontier = createEmptyFrontierSimulationState();
  simulationContext.populationLoss = { simDay: 0, history: [] };
  simulationContext.intelligence = {};
  simulationContext.strategicGoals = {};
  simulationContext.navalTechBonus = {};
  initRng(seed);
  useOptionsState.setState({ simDemographics: false, simManpower: false, simMilitaryRecovery: false });
}

describe("Advance Time history mode", () => {
  const unsubscribers: Array<() => void> = [];

  beforeEach(() => {
    useFastAdvanceState.setState({ enabled: false, preset: "steady", historyProfile: "off" });
  });

  afterEach(() => {
    while (unsubscribers.length) {
      try {
        unsubscribers.pop()?.();
      } catch {
        // Dependent systems may block removal; tests clean in reverse dependency order.
      }
    }
    useFastAdvanceState.setState({ enabled: false, preset: "steady", historyProfile: "off" });
    resetHistoryModeRunForTests();
  });

  it("leaves an ordinary advance at one tick per day when the profile is off", () => {
    seedMinimalWorld("history-off");
    // Fast-Forward on but history mode off: the stride must stay 1, exactly as before Phase H2.
    useFastAdvanceState.setState({ enabled: true, historyProfile: "off" });

    runDaily(40, { notify: false });

    expect(simulationContext.tickCount).toBe(40);
    expect(simulationContext.currentMonth).toBe(2);
    expect(simulationContext.currentDay).toBe(10);
  });

  it("needs Fast-Forward enabled — a history profile alone changes nothing", () => {
    seedMinimalWorld("history-needs-ff");
    useFastAdvanceState.setState({ enabled: false, historyProfile: "chronicle" });

    runDaily(40, { notify: false });

    expect(simulationContext.tickCount).toBe(40);
  });

  it("walks a year in 12 monthly ticks and lands on the same calendar date", () => {
    seedMinimalWorld("history-stride");
    useFastAdvanceState.setState({ enabled: true, historyProfile: "chronicle" });

    runDaily(DAYS_IN_YEAR_1000, { notify: false });

    // 365 days of simulation for the cost of 12 system passes (§4.1).
    expect(simulationContext.tickCount).toBe(12);
    expect(simulationContext.currentYear).toBe(1001);
    expect(simulationContext.currentMonth).toBe(1);
    expect(simulationContext.currentDay).toBe(1);
  });

  it("still fires the annual calendar gate exactly once per simulated year", () => {
    seedMinimalWorld("history-annual-gate");
    let annualHits = 0;
    let monthStarts = 0;
    unsubscribers.push(
      registerSimulationSystem({
        id: "test.history-annual-gate",
        phase: "finalize",
        reads: [],
        writes: [],
        cadence: { every: 1 },
        run: () => {
          if (simulationContext.currentDay !== 1) return;
          monthStarts += 1;
          if (simulationContext.currentMonth === 1) annualHits += 1;
        }
      })
    );
    useFastAdvanceState.setState({ enabled: true, historyProfile: "chronicle" });

    // Two years. The gate is evaluated after the clock moves, so the first tick of the run lands
    // on Feb 1 and the Jan-1 hits are the two later year boundaries.
    runDaily(DAYS_IN_YEAR_1000 * 2, { notify: false });

    expect(monthStarts).toBe(24);
    expect(annualHits).toBe(2);
  });

  it("skips a masked system for the whole run and restores it afterwards", () => {
    seedMinimalWorld("history-mask");
    let caravanTicks = 0;
    let warIntensityTicks = 0;
    unsubscribers.push(
      registerSimulationSystem({
        id: "economy.caravans",
        phase: "economy",
        reads: [],
        writes: [],
        cadence: { every: 1 },
        run: () => {
          caravanTicks += 1;
        }
      })
    );
    unsubscribers.push(
      registerSimulationSystem({
        id: "economy.warIntensity",
        phase: "economy",
        reads: [],
        writes: [],
        cadence: { every: 1 },
        run: () => {
          warIntensityTicks += 1;
        }
      })
    );

    useFastAdvanceState.setState({ enabled: true, historyProfile: "chronicle" });
    runDaily(DAYS_IN_YEAR_1000, { notify: false });

    // chronicle masks caravans (day-cadence work a monthly stride would misapply) but keeps war
    // intensity, which feeds the rise and fall of states.
    expect(caravanTicks).toBe(0);
    expect(warIntensityTicks).toBe(12);

    useFastAdvanceState.setState({ historyProfile: "off" });
    stepDaySimulation();
    expect(caravanTicks).toBe(1);
  });

  it("funds treasuries from population while a run is active, and not otherwise", () => {
    seedMinimalWorld("history-stub-funding");
    useFastAdvanceState.setState({
      enabled: true,
      historyProfile: "custom",
      customHistoryProfile: {
        stride: "month",
        disabledSystemIds: [],
        forceAutonomousConflict: true,
        stubFunding: {
          enabled: true,
          revenuePerCapitaPerYear: 0.1,
          upkeepRatio: 0,
          warUpkeepMultiplier: 1,
          floorRatio: 0
        }
      }
    });

    runDaily(DAYS_IN_YEAR_1000, { notify: false });

    // 1000 people × 0.1/head/year, accumulated over the 12 monthly ticks. Elapsed time is
    // measured in mean Gregorian years (365.2425 days) like every other delta-driven system, so
    // a 365-day calendar year is 0.99934 simulated years — not a rounding error.
    const simulatedYears = DAYS_IN_YEAR_1000 / 365.2425;
    expect(worldContext.pack.states[1].treasury).toBeCloseTo(100 * simulatedYears, 6);

    useFastAdvanceState.setState({ historyProfile: "off" });
    const afterRun = worldContext.pack.states[1].treasury;
    stepDaySimulation();
    expect(worldContext.pack.states[1].treasury).toBe(afterRun);
  });

  it("never engages on a lone Advance Day, however it is configured", () => {
    seedMinimalWorld("history-single-day");
    useFastAdvanceState.setState({ enabled: true, historyProfile: "chronicle" });

    stepDaySimulation();

    expect(simulationContext.tickCount).toBe(1);
    expect(simulationContext.currentDay).toBe(2);
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });
});
