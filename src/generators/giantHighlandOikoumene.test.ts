import { describe, expect, it } from "vitest";
import { seedGiantHighlandOikoumene } from "./giantHighlandOikoumene";

describe("seedGiantHighlandOikoumene", () => {
  it("keeps a cold, high source watershed inhabited at one tenth of human capacity", () => {
    const cells = {
      i: new Uint16Array([0, 1, 2, 3]),
      c: [[1], [0, 2], [1, 3], [2]],
      h: new Uint16Array([95, 80, 90, 30]),
      r: new Uint16Array([0, 1, 1, 0]),
      culture: new Uint16Array([2, 2, 2, 2]),
      capacity: new Float32Array([0, 0, 0, 100]),
      subsistenceCapacity: new Float32Array([0, 0, 0, 100]),
      subsistenceNonAgriculturalCapacity: new Float32Array([0, 0, 0, 100]),
      area: new Float32Array([10, 10, 10, 10]),
      s: new Int16Array([0, 0, 0, 20]),
      pop: new Float32Array(4),
      children: new Float32Array(4),
      maleAdults: new Float32Array(4),
      femaleAdults: new Float32Array(4),
      elders: new Float32Array(4)
    };
    const world = {
      pack: {
        cells,
        cultures: [{ i: 0 }, { i: 1, race: 1, type: "Generic" }, { i: 2, race: 2, type: "Generic" }],
        races: [
          { i: 0, key: "unknown" },
          { i: 1, key: "giant" },
          { i: 2, key: "human" }
        ],
        rivers: [{ i: 1, source: 2, basin: 1 }]
      }
    };

    const seeded = seedGiantHighlandOikoumene(world as any, "highFantasy", 1);

    expect(seeded).toEqual({ cultureId: 1, sourceCell: 2 });
    expect(cells.culture[0]).toBe(1);
    expect(cells.culture[2]).toBe(1);
    expect(cells.capacity[2]).toBeCloseTo(10); // 10% of the nearby human-equivalent capacity
    expect(cells.subsistenceCapacity[2]).toBeCloseTo(10);
    expect(cells.pop[2]).toBeCloseTo(6); // Giant initial saturation is capped at 60% of its own K
    expect(cells.s[2]).toBeGreaterThanOrEqual(80); // strategic capital score, not population capacity
    expect(world.pack.cultures[1]!.center).toBe(2);
    expect(world.pack.cultures[1]!.type).toBe("Highland");
  });
});
