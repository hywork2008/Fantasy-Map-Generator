import { describe, expect, it } from "vitest";
import type { WorldContext } from "../../hostCore";
import { calculateFoodPotential, calculateSettlementDevelopmentPotential } from "./developmentPotential";

function createWorld(): WorldContext {
  return {
    populationRate: 1000,
    biomesData: { habitability: [0, 80, 80] },
    pack: {
      cells: {
        i: new Uint16Array([0, 1, 2]),
        h: new Uint8Array([10, 30, 30]),
        biomeCode: new Uint8Array([0, 1, 2]),
        area: new Float32Array([1, 1, 1]),
        r: new Uint16Array([0, 1, 0]),
        conf: new Uint16Array([0, 0, 0]),
        fl: new Uint16Array([0, 100, 0]),
        harbor: new Uint8Array([0, 0, 1]),
        routes: { 1: { 2: 1 }, 2: { 1: 1, 0: 2 } },
        capacity: new Float32Array([0, 12, 12]),
        pop: new Float32Array([0, 1, 11])
      },
      burgs: [
        { cell: 0 },
        {
          i: 1,
          cell: 2,
          port: 1,
          plaza: 1,
          population: 2,
          demographics: { capacity: 3, children: 0, maleAdults: 1, femaleAdults: 1, elders: 0 }
        }
      ]
    }
  } as unknown as WorldContext;
}

describe("development potential", () => {
  it("derives food potential from environment, not cell population or carrying capacity", () => {
    const world = createWorld();
    const before = calculateFoodPotential(world);

    world.pack.cells.pop[1] = 999;
    world.pack.cells.capacity[1] = 0;
    const after = calculateFoodPotential(world);

    expect(before[0]).toBe(0);
    expect(before[1]).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });

  it("rewards route access, ports, and mineral resources when scoring settlement development", () => {
    const potential = calculateSettlementDevelopmentPotential(createWorld(), [
      { cell: 1, richness: 6, exhausted: false },
      { cell: 2, richness: 50, exhausted: true }
    ]);

    expect(potential[0]).toBe(0);
    expect(potential[1]).toBeGreaterThan(10);
    expect(potential[2]).toBeGreaterThan(potential[1] - 6);
  });
});
