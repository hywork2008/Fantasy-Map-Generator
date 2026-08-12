import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import {
  generateSubsistenceCapacity,
  getLivelihoodKind,
  reconcileSubsistenceCapacityFromFood
} from "./subsistenceCapacity";

function createWorld(): WorldContext {
  return {
    grid: {
      cells: {
        temp: new Int8Array([14, -10, -6, -10, 8]),
        prec: new Uint8Array([8, 8, 4, 35, 30])
      }
    },
    pack: {
      cells: {
        i: new Uint16Array([0, 1, 2, 3, 4]),
        capacity: new Float32Array([100, 100, 100, 100, 100]),
        h: new Uint8Array([25, 25, 25, 25, 25]),
        g: new Uint16Array([0, 1, 2, 3, 4]),
        biomeCode: new Uint8Array([0, 1, 2, 3, 4]),
        r: new Uint16Array(5),
        t: new Uint8Array([0, 1, 0, 0, 0]),
        harbor: new Uint8Array(5),
        fl: new Uint16Array(5)
      }
    },
    biomesData: {
      tags: [["arable"], ["cold"], ["grassland", "cold"], ["forest", "cold"], []]
    }
  } as unknown as WorldContext;
}

describe("generateSubsistenceCapacity", () => {
  it("keeps agriculture dense while retaining lower-density fishing, pastoral, and foraging livelihoods", () => {
    const world = createWorld();
    generateSubsistenceCapacity(world);
    const { subsistenceCapacity, livelihood } = world.pack.cells;

    expect(subsistenceCapacity?.[0]).toBeGreaterThan(90);
    expect(subsistenceCapacity?.[1]).toBeGreaterThan(30);
    expect(subsistenceCapacity?.[2]).toBeGreaterThan(25);
    expect(subsistenceCapacity?.[3]).toBeGreaterThan(15);
    expect(subsistenceCapacity?.[4]).toBe(0);
    expect(getLivelihoodKind(livelihood?.[0])).toBe("agriculture");
    expect(getLivelihoodKind(livelihood?.[1])).toBe("fishing");
    expect(getLivelihoodKind(livelihood?.[2])).toBe("pastoral");
    expect(getLivelihoodKind(livelihood?.[3])).toBe("foraging");
  });

  it("uses the local food capacity for initial population placement when available", async () => {
    const { applyInitialSettlementPattern } = await import("./settlementPattern");
    const cells = {
      i: new Uint16Array([0, 1]),
      s: new Int16Array([10, 10]),
      capacity: new Float32Array([100, 100]),
      subsistenceCapacity: new Float32Array([100, 20]),
      pop: new Float32Array(2),
      children: new Float32Array(2),
      maleAdults: new Float32Array(2),
      femaleAdults: new Float32Array(2),
      elders: new Float32Array(2)
    };

    applyInitialSettlementPattern(cells, "standard", 0.5);
    expect(cells.pop[0]).toBeCloseTo(50, 5);
    expect(cells.pop[1]).toBeCloseTo(10, 5);
  });

  it("adds annual agricultural food capacity without erasing non-agricultural livelihoods", () => {
    const cells = {
      capacity: new Float32Array([100, 100]),
      subsistenceCapacity: new Float32Array([20, 35]),
      subsistenceNonAgriculturalCapacity: new Float32Array([20, 35])
    };

    reconcileSubsistenceCapacityFromFood(cells, new Float32Array([70, 90]));

    expect(Array.from(cells.subsistenceCapacity)).toEqual([90, 100]);
  });
});
