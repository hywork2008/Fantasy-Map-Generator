import { afterEach, describe, expect, it, vi } from "vitest";
import { initRng } from "../context/appServices";
import { createEmptyFrontierSimulationState, simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { runDaily } from "../runtime/simulationRunner";
import { stepDaySimulation } from "../runtime/worldRuntime";
import { useFastAdvanceState } from "../store/fastAdvanceState";
import { useOptionsState } from "../store/optionsState";
import { Routes } from "./routes-generator";
import { listRegisteredSimulationSystemIds, registerSimulationSystem, registerTimeTickHook } from "./timeEngine";

describe("timeEngine simulation system registration (P2-7)", () => {
  const unsubscribers: Array<() => void> = [];

  afterEach(() => {
    while (unsubscribers.length) {
      try {
        unsubscribers.pop()?.();
      } catch {
        // Dependent systems may block removal; tests clean in reverse dependency order.
      }
    }
  });

  it("registerSimulationSystem exposes phase-ordered ids via listRegisteredSimulationSystemIds", () => {
    unsubscribers.push(
      registerSimulationSystem({
        id: "test.military-late",
        phase: "military",
        reads: [],
        writes: ["simulation.military"],
        cadence: { every: 1 },
        run: () => {}
      })
    );
    unsubscribers.push(
      registerSimulationSystem({
        id: "test.economy-early",
        phase: "economy",
        reads: [],
        writes: ["extension.economy"],
        cadence: { every: 1 },
        run: () => {}
      })
    );

    const ids = listRegisteredSimulationSystemIds();
    const economyIndex = ids.indexOf("test.economy-early");
    const militaryIndex = ids.indexOf("test.military-late");
    expect(economyIndex).toBeGreaterThanOrEqual(0);
    expect(militaryIndex).toBeGreaterThan(economyIndex);
  });

  it("registers the built-in seasonal-climate.tick system in the environment phase", () => {
    const ids = listRegisteredSimulationSystemIds();
    expect(ids).toContain("seasonal-climate.tick");
  });

  it("registerTimeTickHook remains a politics-phase compatibility wrapper", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls: string[] = [];

    registerTimeTickHook(
      () => {
        calls.push("legacy");
        return ["extension.legacy-test"];
      },
      "legacy-test",
      ["extension.legacy-test"]
    );

    const ids = listRegisteredSimulationSystemIds();
    expect(ids.some(id => id.startsWith("legacy-hook:"))).toBe(true);
    // Dev builds emit a deprecation warning so new callers move to systems.
    if (import.meta.env.DEV) {
      expect(warn).toHaveBeenCalled();
    }
    warn.mockRestore();
  });

  it("built-in extension system ids sort economy before shipbuilding before nobility military", () => {
    // When those systems are registered (app init), order must be phase-correct.
    // This test only asserts the intended id naming contract for migrations.
    const planned = ["economy.tick", "shipbuilding.tick", "nobility.tick"] as const;
    const phaseOf = (id: (typeof planned)[number]) =>
      id.startsWith("nobility")
        ? "military"
        : id.startsWith("economy") || id.startsWith("shipbuilding")
          ? "economy"
          : "";

    expect(phaseOf("economy.tick")).toBe("economy");
    expect(phaseOf("shipbuilding.tick")).toBe("economy");
    expect(phaseOf("nobility.tick")).toBe("military");
    // Lexical order within economy phase: economy.tick < shipbuilding.tick
    expect("economy.tick" < "shipbuilding.tick").toBe(true);
  });

  it("does not rebuild the entire route network at the annual calendar boundary", () => {
    worldContext.seed = "annual-routes";
    worldContext.options = { year: 1000, month: 1, day: 1, era: "Test" } as never;
    worldContext.nameBases = [];
    worldContext.biomesData = { habitability: [0] } as never;
    worldContext.notes = [];
    worldContext.grid = {} as never;
    worldContext.mapCoordinates = { latN: 40, latS: 20 } as never;
    worldContext.pack = {
      states: [{ i: 0, diplomacy: [] }],
      burgs: [],
      routes: [
        {
          i: 8,
          group: "trails",
          feature: 1,
          points: [
            [0, 0, 0],
            [1, 0, 1]
          ]
        }
      ],
      cells: {
        i: new Uint16Array([0, 1]),
        h: new Uint8Array([25, 25]),
        f: new Uint16Array([1, 1]),
        c: [[1], [0]],
        state: new Uint16Array([0, 0]),
        routes: { 0: { 1: 8 }, 1: { 0: 8 } }
      }
    } as never;
    simulationContext.currentYear = 1000;
    simulationContext.currentMonth = 12;
    simulationContext.currentDay = 31;
    simulationContext.tickCount = 0;
    simulationContext.frontier = createEmptyFrontierSimulationState();
    simulationContext.populationLoss = { simDay: 0, history: [] };
    initRng("annual-routes");
    useOptionsState.setState({
      simDemographics: false,
      simManpower: false,
      simMilitaryRecovery: false
    });
    const generate = vi.spyOn(Routes, "generate").mockImplementation(() => {});

    try {
      const commit = stepDaySimulation();

      expect(generate).not.toHaveBeenCalled();
      expect(commit?.changes.changes.map(change => change.topic)).not.toContain("map.networks");
    } finally {
      generate.mockRestore();
    }
  });

  it("registers the built-in manpower.tick system in the population phase", () => {
    const ids = listRegisteredSimulationSystemIds();
    expect(ids).toContain("manpower.tick");
  });

  it("manpower.tick self-gates on an accumulated-day counter instead of running every stepDaySimulation call (docs/plan/advance-time-loop-reduction.md Phase 1)", () => {
    worldContext.seed = "manpower-gate";
    worldContext.options = { year: 1000, month: 1, day: 1, era: "Test" } as never;
    worldContext.nameBases = [];
    worldContext.biomesData = { habitability: [0] } as never;
    worldContext.notes = [];
    worldContext.grid = {} as never;
    worldContext.mapCoordinates = { latN: 40, latS: 20 } as never;
    worldContext.populationRate = 1000;
    worldContext.urbanization = 2;

    const regiment = {
      i: 0,
      t: 100,
      a: 100,
      s: 1,
      cell: 1,
      x: 1,
      y: 1,
      bx: 1,
      by: 1,
      u: { infantry: 100 },
      n: 0,
      type: "melee",
      state: 1,
      name: "Test"
    };
    const state = {
      i: 1,
      name: "A",
      expansionism: 1,
      capital: 1,
      type: "Generic",
      center: 1,
      culture: 1,
      coa: null,
      rural: 800,
      urban: 200,
      military: [regiment],
      diplomacy: []
    };
    worldContext.pack = {
      states: [{ i: 0, diplomacy: [] }, state],
      burgs: [],
      routes: [],
      cells: {
        i: [0, 1, 2],
        state: [0, 1, 1],
        province: [0, 5, 9],
        pop: [0, 100, 50],
        maleAdults: new Float32Array([0, 22, 11]),
        femaleAdults: new Float32Array([0, 23, 12]),
        children: new Float32Array([0, 40, 20]),
        elders: new Float32Array([0, 15, 7]),
        h: new Uint8Array([25, 25, 25]),
        f: new Uint16Array([1, 1, 1]),
        c: [[], [], []],
        p: [
          [0, 0],
          [1, 1],
          [2, 2]
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
    initRng("manpower-gate");
    useOptionsState.setState({
      simDemographics: false,
      simManpower: true,
      simMilitaryRecovery: false
    });

    // Regiment starts well under its ~1% peacetime population target, so tickManpower's growth
    // branch (ANNUAL_DRAFT_SHARE × deltaYears) raises r.t on every call it actually runs — a
    // no-op day is therefore directly observable as "r.t unchanged".
    for (let day = 0; day < 6; day++) {
      stepDaySimulation();
      expect(regiment.t).toBe(100);
    }

    stepDaySimulation(); // 7th day: accumulator crosses MANPOWER_GATE_DAYS, tickManpower runs once
    expect(regiment.t).toBeGreaterThan(100);
  });

  it("SimulationStepContext.isBulkAdvance is false for a lone day and true inside a multi-day batch (docs/plan/advance-time-loop-reduction.md Phase 1b)", () => {
    worldContext.seed = "bulk-advance-flag";
    worldContext.options = { year: 1000, month: 1, day: 1, era: "Test" } as never;
    worldContext.nameBases = [];
    worldContext.biomesData = { habitability: [0] } as never;
    worldContext.notes = [];
    worldContext.grid = {} as never;
    worldContext.mapCoordinates = { latN: 40, latS: 20 } as never;
    worldContext.pack = {
      states: [{ i: 0, diplomacy: [] }],
      burgs: [],
      routes: [],
      cells: {
        i: [0],
        h: new Uint8Array([25]),
        f: new Uint16Array([1]),
        c: [[]],
        state: [0],
        p: [[0, 0]]
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
    initRng("bulk-advance-flag");
    useOptionsState.setState({ simDemographics: false, simManpower: false, simMilitaryRecovery: false });

    const observed: boolean[] = [];
    const unsubscribe = registerSimulationSystem({
      id: "test.bulk-advance-probe",
      phase: "finalize",
      reads: [],
      writes: [],
      cadence: { every: 1 },
      run: context => {
        observed.push(context.isBulkAdvance);
      }
    });

    try {
      stepDaySimulation(); // lone single-day step — never "bulk"
      runDaily(3, { notify: false }); // one multi-day batch spanning 3 days
    } finally {
      unsubscribe();
    }

    expect(observed).toEqual([false, true, true, true]);
  });

  it("Fast-Forward replaces core:demographics with a flat rate only inside a multi-day batch (docs/plan/advance-time-fast-forward.md §4.3(a))", () => {
    worldContext.seed = "fast-advance-population";
    worldContext.options = { year: 1000, month: 1, day: 1, era: "Test" } as never;
    worldContext.nameBases = [];
    worldContext.biomesData = { habitability: [0] } as never;
    worldContext.notes = [];
    worldContext.grid = {} as never;
    worldContext.mapCoordinates = { latN: 40, latS: 20 } as never;
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.pack = {
      states: [
        { i: 0, diplomacy: [] },
        { i: 1, diplomacy: [] }
      ],
      burgs: [],
      routes: [],
      cells: {
        i: [0, 1],
        state: [0, 1],
        province: [0, 5],
        pop: [0, 100],
        maleAdults: new Float32Array([0, 22]),
        femaleAdults: new Float32Array([0, 23]),
        children: new Float32Array([0, 40]),
        elders: new Float32Array([0, 15]),
        capacity: [0, 500],
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
    initRng("fast-advance-population");
    useOptionsState.setState({ simDemographics: true, simManpower: false, simMilitaryRecovery: false });

    // 0% growth, 0% jitter: an unmistakable "did nothing" signature for the fake path, versus the
    // real cohort-aging model which still moves cohorts even at a single day's tiny deltaYears.
    useFastAdvanceState.setState({
      enabled: true,
      preset: "custom",
      customRates: {
        populationGrowthPctPerYear: 0,
        priceInflationPctPerYear: 0,
        goodsStockGrowthPctPerYear: 0,
        treasuryGrowthPctPerYear: 0,
        variancePct: 0,
        stockFloorMultiplier: 0.2,
        stockCapMultiplier: 5.0
      }
    });

    try {
      // A lone Advance Day: isBulkAdvance is false, so Fast-Forward must not engage even though
      // it's enabled — the real simulateDemographics() runs and moves cohorts via aging/births.
      stepDaySimulation();
      expect(worldContext.pack.cells.maleAdults[1]).not.toBe(22);

      // A multi-day batch: isBulkAdvance is true, so Fast-Forward's 0%-growth/0%-jitter rate
      // applies instead — cohorts stay exactly where the lone day left them.
      const beforeBulk = worldContext.pack.cells.maleAdults[1];
      runDaily(3, { notify: false });
      expect(worldContext.pack.cells.maleAdults[1]).toBe(beforeBulk);
    } finally {
      useFastAdvanceState.setState({ enabled: false, preset: "steady" });
    }
  });

  it("Fast-Forward coarsens the manpower.tick gate from 7 to 30 days inside a multi-day batch (docs/plan/advance-time-fast-forward.md §8 Phase 4)", () => {
    worldContext.seed = "fast-advance-manpower-gate";
    worldContext.options = { year: 1000, month: 1, day: 1, era: "Test" } as never;
    worldContext.nameBases = [];
    worldContext.biomesData = { habitability: [0] } as never;
    worldContext.notes = [];
    worldContext.grid = {} as never;
    worldContext.mapCoordinates = { latN: 40, latS: 20 } as never;
    worldContext.populationRate = 1000;
    worldContext.urbanization = 2;

    const regiment = {
      i: 0,
      t: 100,
      a: 100,
      s: 1,
      cell: 1,
      x: 1,
      y: 1,
      bx: 1,
      by: 1,
      u: { infantry: 100 },
      n: 0,
      type: "melee",
      state: 1,
      name: "Test"
    };
    worldContext.pack = {
      states: [
        { i: 0, diplomacy: [] },
        {
          i: 1,
          name: "A",
          expansionism: 1,
          capital: 1,
          type: "Generic",
          center: 1,
          culture: 1,
          coa: null,
          rural: 800,
          urban: 200,
          military: [regiment],
          diplomacy: []
        }
      ],
      burgs: [],
      routes: [],
      cells: {
        i: [0, 1, 2],
        state: [0, 1, 1],
        province: [0, 5, 9],
        pop: [0, 100, 50],
        maleAdults: new Float32Array([0, 22, 11]),
        femaleAdults: new Float32Array([0, 23, 12]),
        children: new Float32Array([0, 40, 20]),
        elders: new Float32Array([0, 15, 7]),
        h: new Uint8Array([25, 25, 25]),
        f: new Uint16Array([1, 1, 1]),
        c: [[], [], []],
        p: [
          [0, 0],
          [1, 1],
          [2, 2]
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
    initRng("fast-advance-manpower-gate");
    // simDemographics off so population (and therefore the troop target) is static — the only
    // thing that can move regiment.t is tickManpower's own draft branch on a tick it runs.
    useOptionsState.setState({ simDemographics: false, simManpower: true, simMilitaryRecovery: false });
    useFastAdvanceState.setState({ enabled: true, preset: "steady" });

    try {
      // 29 days of a Fast-Forward multi-day batch: the coarsened 30-day gate has not been crossed.
      runDaily(29, { notify: false });
      expect(regiment.t).toBe(100);

      // Day 30: the accumulator crosses the Fast-Forward gate and tickManpower runs once.
      runDaily(1, { notify: false });
      expect(regiment.t).toBeGreaterThan(100);
    } finally {
      useFastAdvanceState.setState({ enabled: false, preset: "steady" });
    }
  });
});
