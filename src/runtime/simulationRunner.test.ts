import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appServices, initRng } from "../context/appServices";
import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { advanceTime, registerSimulationSystem } from "../generators/timeEngine";
import { useOptionsState } from "../store/optionsState";
import { exportLiveSimulationRng, installSimulationRng } from "./simulationRng";
import {
  advance,
  advanceLegacyBulk,
  durationToCalendarDays,
  runDaily,
  runLegacyDaily,
  stepDay
} from "./simulationRunner";
import type { DataTopic } from "./worldRuntime";
import { worldRuntime } from "./worldRuntime";

function installMinimalWorld(): void {
  worldContext.seed = "runner-seed";
  worldContext.mapCoordinates = { latN: 40, latS: 20 } as never;
  worldContext.options = {
    year: 1000,
    month: 1,
    day: 1,
    era: "Test Era"
  } as never;
  worldContext.pack = {
    states: [{ i: 0, diplomacy: [] }],
    burgs: [],
    routes: [],
    cells: {
      i: new Uint16Array([0]),
      h: new Uint8Array([0]),
      f: new Uint16Array([0]),
      c: [[]] as unknown as number[][],
      state: new Uint16Array([0]),
      pop: new Float32Array([0])
    }
  } as never;

  // Disable core subsystems that need a full generated map; this suite is about
  // the runner / RNG / commit seam, not demographics or manpower.
  useOptionsState.setState({
    simDemographics: false,
    simManpower: false,
    simMilitaryRecovery: false
  });

  simulationContext.currentYear = 1000;
  simulationContext.currentMonth = 1;
  simulationContext.currentDay = 1;
  simulationContext.era = "Test Era";
  simulationContext.tickCount = 0;
  simulationContext.intelligence = {};
  simulationContext.strategicGoals = {};
  simulationContext.populationLoss = { simDay: 0, history: [] };
  simulationContext.navalTechBonus = {};
  initRng("runner-seed");
}

describe("SimulationRunner (headless)", () => {
  const unsubscribers: Array<() => void> = [];

  beforeEach(() => {
    installMinimalWorld();
  });

  afterEach(() => {
    while (unsubscribers.length) unsubscribers.pop()?.();
  });

  it("durationToCalendarDays matches leap-year and month length rules", () => {
    expect(durationToCalendarDays({ year: 2000, month: 1, day: 1 }, { years: 1 })).toBe(366);
    expect(durationToCalendarDays({ year: 2001, month: 1, day: 1 }, { years: 1 })).toBe(365);
    expect(durationToCalendarDays({ year: 2001, month: 1, day: 1 }, { months: 1 })).toBe(31);
    expect(durationToCalendarDays({ year: 2001, month: 2, day: 1 }, { months: 1 })).toBe(28);
    expect(durationToCalendarDays({ year: 2001, month: 1, day: 1 }, { days: 10 })).toBe(10);
  });

  it("stepDay advances the clock and tickCount without a renderer", () => {
    const commits: DataTopic[][] = [];
    unsubscribers.push(
      worldRuntime.subscribe(commit => {
        commits.push(commit.changes.changes.map(change => change.topic));
      })
    );

    expect(stepDay({ notify: false })).toBe(true);
    expect(simulationContext.currentDay).toBe(2);
    expect(simulationContext.tickCount).toBe(1);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toContain("simulation.clock");
  });

  it("runDaily issues one commit per day and can stop early", () => {
    const progress: number[] = [];
    const result = runDaily(5, {
      notify: false,
      onDayComplete: ({ day }) => progress.push(day),
      shouldStop: () => progress.length >= 2
    });

    expect(result).toEqual({ daysRequested: 5, daysCompleted: 2, stopped: true });
    expect(progress).toEqual([1, 2]);
    expect(simulationContext.tickCount).toBe(2);
    expect(simulationContext.currentDay).toBe(3);
  });

  it("P2-5: public advanceTime and headless advance share daily tickCount semantics", () => {
    installMinimalWorld();
    runDaily(3, { notify: false });
    const dailyTicks = simulationContext.tickCount;
    const dailyDay = simulationContext.currentDay;

    installMinimalWorld();
    advance({ days: 3 }, { notify: false });
    const advanceTicks = simulationContext.tickCount;
    const advanceDay = simulationContext.currentDay;

    installMinimalWorld();
    // advanceLegacyBulk is now a daily alias (compat period closed).
    advanceLegacyBulk({ days: 3 }, { notify: false });
    const legacyAliasTicks = simulationContext.tickCount;

    installMinimalWorld();
    // Public action: expand {days:3} to three stepDay commits (no multi-day bulk).
    advanceTime(0, 0, 3);
    const publicTicks = simulationContext.tickCount;
    const publicDay = simulationContext.currentDay;

    expect(dailyTicks).toBe(3);
    expect(advanceTicks).toBe(3);
    expect(legacyAliasTicks).toBe(3);
    expect(publicTicks).toBe(3);
    expect(dailyDay).toBe(publicDay);
    expect(advanceDay).toBe(publicDay);
  });

  it("public multi-month advance expands to month-length day steps", () => {
    // January has 31 days from 1000-01-01.
    advanceTime(0, 1, 0);
    expect(simulationContext.tickCount).toBe(31);
    expect(simulationContext.currentMonth).toBe(2);
    expect(simulationContext.currentDay).toBe(1);
  });

  it("restores the same RNG sequence after a headless daily run snapshot", () => {
    const draws: number[] = [];
    unsubscribers.push(
      registerSimulationSystem({
        id: "test-rng-consumer",
        phase: "politics",
        reads: [],
        writes: ["simulation.rng"],
        cadence: { every: 1 },
        run: (_context, writer) => {
          draws.push(appServices.rng.rand());
          writer.markChanged("simulation.rng");
        }
      })
    );

    runLegacyDaily(2, { notify: false });
    const snapshot = exportLiveSimulationRng();
    expect(snapshot).not.toBeNull();
    const nextAfterRun = appServices.rng.rand();

    appServices.rng = installSimulationRng(snapshot!);
    expect(appServices.rng.rand()).toBe(nextAfterRun);
    expect(draws).toHaveLength(2);
    expect(simulationContext.rng.seed).toBe(snapshot!.seed);
    expect(simulationContext.rng.state).toEqual(snapshot!.state);
    expect(simulationContext.rng.streams["test-rng-consumer"]).toBeDefined();
  });

  it("does not require a RenderCoordinator subscription to step", () => {
    const listener = vi.fn();
    unsubscribers.push(worldRuntime.subscribe(listener));
    runDaily(1, { notify: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("simulation.stepDay is one command per day with rollback on system failure", () => {
    const commits: number[] = [];
    unsubscribers.push(
      worldRuntime.subscribe(commit => {
        commits.push(commit.changes.toRevision);
      })
    );

    expect(stepDay({ notify: false })).toBe(true);
    expect(commits).toHaveLength(1);
    expect(simulationContext.tickCount).toBe(1);
    expect(simulationContext.currentDay).toBe(2);

    const dayBefore = simulationContext.currentDay;
    const tickBefore = simulationContext.tickCount;
    const yearBefore = simulationContext.currentYear;

    unsubscribers.push(
      registerSimulationSystem({
        id: "test-day-boom",
        phase: "finalize",
        reads: [],
        writes: ["simulation.clock"],
        cadence: { every: 1 },
        run: () => {
          throw new Error("boom in day step");
        }
      })
    );

    expect(() => stepDay({ notify: false })).toThrow("boom in day step");
    expect(commits).toHaveLength(1);
    expect(simulationContext.currentDay).toBe(dayBefore);
    expect(simulationContext.tickCount).toBe(tickBefore);
    expect(simulationContext.currentYear).toBe(yearBefore);
  });

  it("rejects systems that mark topics outside their declared writes", () => {
    unsubscribers.push(
      registerSimulationSystem({
        id: "test-undeclared-write",
        phase: "finalize",
        reads: [],
        writes: ["simulation.clock"],
        cadence: { every: 1 },
        run: (_context, writer) => {
          writer.markChanged("map.politics");
        }
      })
    );

    const tickBefore = simulationContext.tickCount;
    expect(() => stepDay({ notify: false })).toThrow("not in the system's declared writes");
    expect(simulationContext.tickCount).toBe(tickBefore);
  });

  it("P2-10: advance leaves options generation year/month/day unchanged", () => {
    worldContext.options.year = 1000;
    worldContext.options.month = 1;
    worldContext.options.day = 1;
    useOptionsState.setState({ year: 1000 });

    advance({ days: 40 }, { notify: false });

    expect(simulationContext.currentYear).toBe(1000);
    expect(simulationContext.currentMonth).toBe(2);
    expect(simulationContext.currentDay).toBe(10);
    expect(simulationContext.tickCount).toBe(40);
    // Generation options are not a live clock mirror.
    expect(worldContext.options.year).toBe(1000);
    expect(worldContext.options.month).toBe(1);
    expect(worldContext.options.day).toBe(1);
    expect(useOptionsState.getState().year).toBe(1000);
  });

  it("perf: a multi-day run clones the pack once for the whole batch, not once per day", () => {
    const realStructuredClone = globalThis.structuredClone;
    const packCloneCalls: unknown[] = [];
    const cloneSpy = vi.spyOn(globalThis, "structuredClone").mockImplementation((value: unknown) => {
      if (value === worldContext.pack) packCloneCalls.push(value);
      return realStructuredClone(value as never);
    });

    try {
      const result = runDaily(5, { notify: false });
      expect(result).toEqual({ daysRequested: 5, daysCompleted: 5, stopped: false });
      // Before batching this was 5 (one per day); batching amortizes it to 1 for the whole run.
      expect(packCloneCalls).toHaveLength(1);
      expect(simulationContext.tickCount).toBe(5);
    } finally {
      cloneSpy.mockRestore();
    }
  });

  it("perf: advanceTime's multi-day span also amortizes the pack clone to once", () => {
    const realStructuredClone = globalThis.structuredClone;
    const packCloneCalls: unknown[] = [];
    const cloneSpy = vi.spyOn(globalThis, "structuredClone").mockImplementation((value: unknown) => {
      if (value === worldContext.pack) packCloneCalls.push(value);
      return realStructuredClone(value as never);
    });

    try {
      advanceTime(0, 1, 0); // January: 31 stepDay commits.
      expect(simulationContext.tickCount).toBe(31);
      expect(packCloneCalls).toHaveLength(1);
    } finally {
      cloneSpy.mockRestore();
    }
  });

  it("a mid-batch system failure rolls back the whole batch and republishes a corrective commit", () => {
    const commits: number[] = [];
    unsubscribers.push(
      worldRuntime.subscribe(commit => {
        commits.push(commit.changes.toRevision);
      })
    );

    let calls = 0;
    unsubscribers.push(
      registerSimulationSystem({
        id: "test-batch-boom",
        phase: "finalize",
        reads: [],
        writes: ["simulation.clock"],
        cadence: { every: 1 },
        run: () => {
          calls++;
          if (calls === 3) throw new Error("boom on day 3");
        }
      })
    );

    const dayBefore = simulationContext.currentDay;
    const tickBefore = simulationContext.tickCount;

    expect(() => runDaily(5, { notify: false })).toThrow("boom on day 3");

    // Days 1 and 2 already committed before day 3 failed; the batch-wide
    // rollback restores pre-batch state, so a corrective commit must follow
    // those 2 day commits so subscribers don't keep caching days 1-2.
    expect(commits).toHaveLength(3);
    expect(simulationContext.currentDay).toBe(dayBefore);
    expect(simulationContext.tickCount).toBe(tickBefore);

    // Batch state is fully released (not stuck) after the failure: a later
    // single day step (calls === 4, past the boom trigger) works normally.
    expect(stepDay({ notify: false })).toBe(true);
    expect(simulationContext.tickCount).toBe(tickBefore + 1);
  });
});
