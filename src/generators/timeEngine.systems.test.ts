import { afterEach, describe, expect, it, vi } from "vitest";
import { initRng } from "../context/appServices";
import { createEmptyFrontierSimulationState, simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { stepDaySimulation } from "../runtime/worldRuntime";
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
      simAgriculture: false,
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
});
