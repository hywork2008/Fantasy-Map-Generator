import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initRng } from "../context/appServices";
import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { worldRuntime } from "../runtime/worldRuntime";
import { useOptionsState } from "../store/optionsState";
import { useTimeSimulationState } from "../store/timeSimulationState";
import { registerSimulationSystem, runTimeSimulation } from "./timeEngine";

function installMinimalWorld(): void {
  worldContext.seed = "runtimesim-seed";
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
  // the asynchronous chunking behavior, not demographics or manpower.
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
  initRng("runtimesim-seed");
}

/**
 * runTimeSimulation drives itself via asynchronous chunks; poll real
 * time for completion rather than fighting jsdom timer/fake-timer interplay.
 */
async function waitForSimulationToFinish(timeout = 2000): Promise<void> {
  await vi.waitFor(
    () => {
      expect(useTimeSimulationState.getState().isRunning).toBe(false);
    },
    { timeout }
  );
}

describe("runTimeSimulation chunked stepping (P2-5 perf: fewer redraws per bulk advance)", () => {
  beforeEach(() => {
    installMinimalWorld();
    useTimeSimulationState.setState({ isRunning: false, progress: 0, totalDays: 0, stopRequested: false });
  });

  afterEach(() => {
    useTimeSimulationState.setState({ isRunning: false, progress: 0, totalDays: 0, stopRequested: false });
  });

  it("completes a bulk run with the correct total tick/day count", async () => {
    runTimeSimulation(0, 0, 10);
    await waitForSimulationToFinish();

    expect(simulationContext.tickCount).toBe(10);
    expect(simulationContext.currentDay).toBe(11);
  });

  it("aggregates many days into far fewer fmg:time-advanced notifications than the day count", async () => {
    const timeAdvancedEvents: CustomEvent[] = [];
    const listener = (event: Event) => timeAdvancedEvents.push(event as CustomEvent);
    document.addEventListener("fmg:time-advanced", listener);

    try {
      runTimeSimulation(0, 0, 10);
      await waitForSimulationToFinish();

      expect(simulationContext.tickCount).toBe(10);
      // Before per-frame chunking this was exactly 1 dispatch per day (10).
      // A trivial fixture easily fits all 10 days inside one frame's time
      // budget, so notifications should collapse to far fewer than 10 —
      // this is what lets Trade animation / Military icons / WebGL
      // projection redraw once per chunk instead of once per day.
      expect(timeAdvancedEvents.length).toBeGreaterThan(0);
      expect(timeAdvancedEvents.length).toBeLessThan(10);

      // Aggregate deltaDays across all dispatches must still total 10 days —
      // chunking must not silently drop or double-count days.
      const totalReportedDays = timeAdvancedEvents.reduce((sum, event) => sum + event.detail.deltaDays, 0);
      expect(totalReportedDays).toBe(10);
    } finally {
      document.removeEventListener("fmg:time-advanced", listener);
    }
  });

  it("stops promptly when stopSimulation is requested mid-run", async () => {
    // A trivial fixture can step hundreds of days within one frame's time
    // budget, so a small request could finish in a single frame regardless
    // of machine speed (nothing "mid-run" to observe). Request enough days
    // that the per-frame day cap (independent of machine speed) guarantees
    // at least one chunk boundary before completion.
    const totalDays = 10_000;
    runTimeSimulation(0, 0, totalDays);
    // First chunk is capped well under totalDays, so this is reliably observable.
    await vi.waitFor(() => {
      expect(useTimeSimulationState.getState().progress).toBeGreaterThan(0);
    });
    expect(useTimeSimulationState.getState().progress).toBeLessThan(totalDays);
    useTimeSimulationState.getState().stopSimulation();

    await waitForSimulationToFinish();

    // Stopped well short of the full request.
    expect(simulationContext.tickCount).toBeLessThan(totalDays);
    expect(simulationContext.tickCount).toBeGreaterThan(0);
  });

  it("publishes a catch-up commit with extension topics once the run finishes (P2-5 案B)", async () => {
    // Nothing in this trivial fixture writes `extension.testExt` while
    // stepping days, so the only source of that topic is the finish-time
    // catch-up commit that lets suppressed decorative draw hooks (e.g.
    // economy's Trade animation) resume once useTimeSimulationState.isRunning
    // goes false.
    simulationContext.extensions = { testExt: {} };
    const topicsPerCommit: string[][] = [];
    const unsubscribe = worldRuntime.subscribe(commit => {
      topicsPerCommit.push(commit.changes.changes.map(change => change.topic));
    });

    try {
      runTimeSimulation(0, 0, 5);
      await waitForSimulationToFinish();

      expect(simulationContext.tickCount).toBe(5);
      expect(topicsPerCommit.some(topics => topics.includes("extension.testExt"))).toBe(true);
    } finally {
      unsubscribe();
      simulationContext.extensions = {};
    }
  });

  it("clears isRunning and still publishes a catch-up commit after a mid-run system failure", async () => {
    simulationContext.extensions = { testExt: {} };
    let calls = 0;
    const unregister = registerSimulationSystem({
      id: "test-runtimesim-boom",
      phase: "finalize",
      reads: [],
      writes: ["simulation.clock"],
      cadence: { every: 1 },
      run: () => {
        calls++;
        if (calls === 3) throw new Error("boom in runTimeSimulation");
      }
    });

    const topicsPerCommit: string[][] = [];
    const unsubscribe = worldRuntime.subscribe(commit => {
      topicsPerCommit.push(commit.changes.changes.map(change => change.topic));
    });

    const tickBefore = simulationContext.tickCount;
    // The throw inside the scheduled callback is uncaught by design (matches
    // the pre-existing single-day behavior) and surfaces as a Node
    // uncaughtException via jsdom's timer callback rather than a browser
    // window.onerror event. State (isRunning, rollback, catch-up commit) is
    // already updated synchronously before the throw, so it is safe to remove
    // this listener right after waitFor observes that.
    const swallowExpectedError = (error: Error) => {
      if (error.message !== "boom in runTimeSimulation") throw error;
    };
    process.on("uncaughtException", swallowExpectedError);

    try {
      runTimeSimulation(0, 0, 10);

      await vi.waitFor(
        () => {
          expect(useTimeSimulationState.getState().isRunning).toBe(false);
        },
        { timeout: 2000 }
      );

      // Rolled back to the pre-run state, and isRunning did not get stuck true.
      expect(simulationContext.tickCount).toBe(tickBefore);
      expect(useTimeSimulationState.getState().isRunning).toBe(false);
      expect(topicsPerCommit.some(topics => topics.includes("extension.testExt"))).toBe(true);
    } finally {
      unregister();
      unsubscribe();
      simulationContext.extensions = {};
      process.off("uncaughtException", swallowExpectedError);
    }
  });
});
