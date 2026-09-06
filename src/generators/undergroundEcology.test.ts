import { beforeEach, describe, expect, it } from "vitest";
import { DEEP_WORM_TYPE } from "./deepWormEcology";
import { advanceUndergroundEcology, resetUndergroundEcologyGate } from "./undergroundEcology";

function makeWorld(overrides: { subterraneanVoid?: Float32Array; monsters?: unknown[] } = {}) {
  return {
    pack: {
      cells: {
        c: [[1], [0]],
        subterraneanVoid: overrides.subterraneanVoid
      },
      monsters: overrides.monsters ?? []
    }
  };
}

describe("advanceUndergroundEcology", () => {
  beforeEach(() => resetUndergroundEcologyGate());

  it("no-ops outside of Jan 1", () => {
    const world = makeWorld({ subterraneanVoid: new Float32Array([0.3, 0.3]) });
    const simulation = { currentYear: 1, currentMonth: 6, currentDay: 15 };
    const result = advanceUndergroundEcology({ world: world as never, simulation: simulation as never });
    expect(result).toEqual({ topics: [], cellsChanged: 0 });
  });

  it("no-ops on non-Fantasy maps (no subterraneanVoid column)", () => {
    const world = makeWorld({
      monsters: [{ i: 1, cell: 0, power: 8, type: DEEP_WORM_TYPE }]
    });
    const simulation = { currentYear: 1, currentMonth: 1, currentDay: 1 };
    const result = advanceUndergroundEcology({ world: world as never, simulation: simulation as never });
    expect(result).toEqual({ topics: [], cellsChanged: 0 });
  });

  it("no-ops when there are no monsters at all", () => {
    const world = makeWorld({ subterraneanVoid: new Float32Array([0.3, 0.3]) });
    const simulation = { currentYear: 1, currentMonth: 1, currentDay: 1 };
    const result = advanceUndergroundEcology({ world: world as never, simulation: simulation as never });
    expect(result).toEqual({ topics: [], cellsChanged: 0 });
  });

  it("grows void and reports the changed topic when a Deep Worm is present", () => {
    const world = makeWorld({
      subterraneanVoid: new Float32Array([0.3, 0.3]),
      monsters: [{ i: 1, cell: 0, power: 8, type: DEEP_WORM_TYPE }]
    });
    const simulation = { currentYear: 1, currentMonth: 1, currentDay: 1 };
    const result = advanceUndergroundEcology({ world: world as never, simulation: simulation as never });
    expect(result.topics).toEqual(["simulation.cells"]);
    expect(result.cellsChanged).toBeGreaterThan(0);
    expect(world.pack.cells.subterraneanVoid![0]).toBeGreaterThan(0.3);
  });

  it("only evaluates once per calendar year", () => {
    const world = makeWorld({
      subterraneanVoid: new Float32Array([0.3, 0.3]),
      monsters: [{ i: 1, cell: 0, power: 8, type: DEEP_WORM_TYPE }]
    });
    const simulation = { currentYear: 5, currentMonth: 1, currentDay: 1 };
    const first = advanceUndergroundEcology({ world: world as never, simulation: simulation as never });
    const second = advanceUndergroundEcology({ world: world as never, simulation: simulation as never });
    expect(first.cellsChanged).toBeGreaterThan(0);
    expect(second).toEqual({ topics: [], cellsChanged: 0 });
  });
});
