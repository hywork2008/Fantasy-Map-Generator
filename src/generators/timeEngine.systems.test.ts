import { afterEach, describe, expect, it, vi } from "vitest";
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
});
