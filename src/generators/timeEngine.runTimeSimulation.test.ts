import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initRng } from "../context/appServices";
import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { useTimeSimulationState } from "../store/timeSimulationState";
import { runTimeSimulation } from "./timeEngine";

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
  // the rAF chunking behavior, not demographics or manpower.
  useOptionsState.setState({
    simDemographics: false,
    simManpower: false,
    simAgriculture: false,
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
 * runTimeSimulation drives itself via requestAnimationFrame chunks; poll real
 * time for completion rather than fighting jsdom's rAF/fake-timer interplay.
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
});
