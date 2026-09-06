import { describe, expect, it } from "vitest";
import {
  classifyGeologicalProvince,
  type GeologicalProvinceCells,
  generateGeologicalProvinces,
  geologyHash,
  PROVINCE_ORDER
} from "./geologicalProvinces";

function makeCells(heights: number[], rivers: number[] = []): GeologicalProvinceCells {
  return {
    i: heights.map((_, index) => index),
    h: heights,
    r: heights.map((_, index) => (rivers.includes(index) ? 1 : 0))
  };
}

describe("geologyHash", () => {
  it("is deterministic for the same inputs", () => {
    expect(geologyHash("seed", "province", 3)).toBe(geologyHash("seed", "province", 3));
  });

  it("varies with seed", () => {
    expect(geologyHash("seedA", "province", 3)).not.toBe(geologyHash("seedB", "province", 3));
  });

  it("stays within [0, 1)", () => {
    for (let i = 0; i < 50; i++) {
      const v = geologyHash("s", "scope", i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("classifyGeologicalProvince", () => {
  it("classifies a river cell in the placer height band as placer", () => {
    const cells = makeCells([30], [0]);
    expect(classifyGeologicalProvince("seed", 0, cells, undefined)).toBe("placer");
  });

  it("classifies a high cell as granite or orogen", () => {
    const cells = makeCells([80]);
    const kind = classifyGeologicalProvince("seed", 0, cells, undefined);
    expect(["granite", "orogen"]).toContain(kind);
  });

  it("prefers volcanic when the biome carries the volcanic tag", () => {
    const cells: GeologicalProvinceCells = { i: [0], h: [80], r: [0], biomeCode: [1] };
    const biomesData = { tags: [[], ["volcanic"]] };
    expect(classifyGeologicalProvince("seed", 0, cells, biomesData)).toBe("volcanic");
  });

  it("is deterministic across repeated calls for the same seed/cell", () => {
    const cells = makeCells([60]);
    const a = classifyGeologicalProvince("seed", 0, cells, undefined);
    const b = classifyGeologicalProvince("seed", 0, cells, undefined);
    expect(a).toBe(b);
  });
});

describe("generateGeologicalProvinces", () => {
  it("skips cells below height 20", () => {
    const cells = makeCells([10, 60, 5, 70]);
    const provinces = generateGeologicalProvinces("seed", cells, undefined);
    const total = provinces.reduce((sum, p) => sum + p.cells.length, 0);
    expect(total).toBe(2);
  });

  it("returns one province entry per PROVINCE_ORDER kind, in order", () => {
    const cells = makeCells([60, 70, 40, 30]);
    const provinces = generateGeologicalProvinces("seed", cells, undefined);
    expect(provinces.map(p => p.kind)).toEqual([...PROVINCE_ORDER]);
    provinces.forEach((p, index) => {
      expect(p.i).toBe(index + 1);
    });
  });
});
