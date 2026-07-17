import { describe, expect, it } from "vitest";
import { createSimulationSystemRegistry, type SimulationSystem } from "./simulationSystem";

function system(
  id: string,
  phase: SimulationSystem["phase"],
  run: () => void,
  overrides: Partial<Omit<SimulationSystem, "id" | "phase" | "run">> = {}
): SimulationSystem {
  return { id, phase, reads: [], writes: [], cadence: { every: 1 }, run, ...overrides };
}

describe("SimulationSystemRegistry", () => {
  it("runs systems in phase order, then dependency order, then lexical id order", () => {
    const registry = createSimulationSystemRegistry();
    const calls: string[] = [];
    registry.register(system("z-clock", "clock", () => calls.push("z-clock")));
    registry.register(system("a-clock", "clock", () => calls.push("a-clock")));
    registry.register(system("after-a", "clock", () => calls.push("after-a"), { after: ["a-clock"] }));
    registry.register(system("economy", "economy", () => calls.push("economy")));

    registry.run({ tick: 1, delta: { years: 0, months: 0, days: 1 } });

    expect(calls).toEqual(["a-clock", "after-a", "z-clock", "economy"]);
  });

  it("honors cadence without coupling the registry to a calendar or DOM", () => {
    const registry = createSimulationSystemRegistry();
    const calls: number[] = [];
    registry.register(system("every-other", "population", () => calls.push(calls.length), { cadence: { every: 2 } }));

    for (let tick = 1; tick <= 5; tick++) {
      registry.run({ tick, delta: { years: 0, months: 0, days: 1 } });
    }

    expect(calls).toHaveLength(3);
  });

  it("rejects unknown, cross-phase, and cyclic dependencies before a tick can run", () => {
    const registry = createSimulationSystemRegistry();
    registry.register(system("clock", "clock", () => {}));

    expect(() => registry.register(system("missing", "clock", () => {}, { after: ["absent"] }))).toThrow(
      "unknown dependency"
    );
    expect(() => registry.register(system("other-phase", "population", () => {}, { after: ["clock"] }))).toThrow(
      "only order against"
    );

    registry.register(system("a", "clock", () => {}, { after: ["clock"] }));
    registry.register(system("b", "clock", () => {}, { after: ["a"] }));
    expect(() => registry.register(system("cycle", "clock", () => {}, { after: ["b"], before: ["a"] }))).toThrow(
      "dependency cycle"
    );
  });

  it("does not permit registry mutation during a tick", () => {
    const registry = createSimulationSystemRegistry();
    let unregister = () => {};
    unregister = registry.register(
      system("self-removing", "finalize", () => {
        expect(unregister).toThrow("cannot be removed during a tick");
      })
    );

    registry.run({ tick: 1, delta: { years: 0, months: 0, days: 1 } });
  });

  it("does not allow an ordering dependency to be removed first", () => {
    const registry = createSimulationSystemRegistry();
    const unregisterFirst = registry.register(system("first", "finalize", () => {}));
    registry.register(system("second", "finalize", () => {}, { after: ["first"] }));

    expect(unregisterFirst).toThrow("cannot be removed");
  });
});
