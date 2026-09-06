import { describe, expect, it } from "vitest";
import type { Monster, SubterraneanDomain } from "../types/models";
import { DEEP_WORM_TYPE, growVoidFromWormActivity, spawnDeepWorms, wormMeatYieldFromCull } from "./deepWormEcology";

describe("spawnDeepWorms", () => {
  it("spawns no worms for a domain with no cells", () => {
    const domain: SubterraneanDomain = {
      i: 1,
      kind: "wildCavern",
      cells: [],
      entrances: [],
      depth: 1,
      voidVolume: 500
    };
    expect(spawnDeepWorms([domain], 0)).toEqual([]);
  });

  it("scales worm count with domain voidVolume, capped at MAX_WORMS_PER_DOMAIN", () => {
    const small: SubterraneanDomain = {
      i: 1,
      kind: "wildCavern",
      cells: [0],
      entrances: [0],
      depth: 1,
      voidVolume: 40
    };
    const huge: SubterraneanDomain = {
      i: 2,
      kind: "wildCavern",
      cells: [1],
      entrances: [1],
      depth: 3,
      voidVolume: 100000
    };
    expect(spawnDeepWorms([small], 0).length).toBe(0); // 40/400 rounds to 0
    expect(spawnDeepWorms([huge], 0).length).toBe(4); // capped
  });

  it("assigns unique, sequential ids starting from nextMonsterId across domains", () => {
    const a: SubterraneanDomain = {
      i: 1,
      kind: "wildCavern",
      cells: [0, 1],
      entrances: [0],
      depth: 1,
      voidVolume: 400
    };
    const b: SubterraneanDomain = {
      i: 2,
      kind: "wildCavern",
      cells: [2, 3],
      entrances: [2],
      depth: 1,
      voidVolume: 400
    };
    const worms = spawnDeepWorms([a, b], 100);
    const ids = worms.map(w => w.i);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(100);
  });

  it("places every worm at a cell belonging to its domain, and gives it type deepWorm", () => {
    const domain: SubterraneanDomain = {
      i: 1,
      kind: "dwarfHold",
      cells: [5, 6, 7],
      entrances: [5],
      depth: 2,
      voidVolume: 400
    };
    const worms = spawnDeepWorms([domain], 0);
    for (const worm of worms) {
      expect(worm.type).toBe(DEEP_WORM_TYPE);
      expect(domain.cells).toContain(worm.cell);
      expect(worm.power).toBeGreaterThan(0);
      expect(worm.basePower).toBe(worm.power);
    }
  });

  it("is deterministic given a fixed random function", () => {
    const domain: SubterraneanDomain = {
      i: 1,
      kind: "wildCavern",
      cells: [0, 1, 2],
      entrances: [0],
      depth: 1,
      voidVolume: 400
    };
    const fixedRandom = () => 0.5;
    const a = spawnDeepWorms([domain], 0, fixedRandom);
    const b = spawnDeepWorms([domain], 0, fixedRandom);
    expect(a).toEqual(b);
  });
});

describe("growVoidFromWormActivity", () => {
  it("raises void at the worm's own cell and its neighbors", () => {
    const monsters: Monster[] = [{ i: 1, cell: 1, name: "Deep Worm 1", rarity: 2, power: 8, type: DEEP_WORM_TYPE }];
    const cells = { c: [[1], [0, 2], [1]] };
    const voidFraction = new Float32Array([0.3, 0.4, 0.3]);
    const touched = growVoidFromWormActivity(monsters, cells, voidFraction, 0.05);
    expect(touched.sort()).toEqual([0, 1, 2]);
    expect(voidFraction[0]).toBeCloseTo(0.35);
    expect(voidFraction[1]).toBeCloseTo(0.45);
    expect(voidFraction[2]).toBeCloseTo(0.35);
  });

  it("ignores dead worms (power <= 0) and non-worm monsters", () => {
    const monsters: Monster[] = [
      { i: 1, cell: 0, name: "Dead worm", rarity: 2, power: 0, type: DEEP_WORM_TYPE },
      { i: 2, cell: 0, name: "Some beast", rarity: 1, power: 5, type: "beast" }
    ];
    const cells = { c: [[]] };
    const voidFraction = new Float32Array([0.3]);
    const touched = growVoidFromWormActivity(monsters, cells, voidFraction);
    expect(touched).toEqual([]);
    expect(voidFraction[0]).toBeCloseTo(0.3);
  });

  it("caps void at 1", () => {
    const monsters: Monster[] = [{ i: 1, cell: 0, name: "Deep Worm 1", rarity: 2, power: 8, type: DEEP_WORM_TYPE }];
    const cells = { c: [[]] };
    const voidFraction = new Float32Array([0.995]);
    growVoidFromWormActivity(monsters, cells, voidFraction, 0.05);
    expect(voidFraction[0]).toBe(1);
  });
});

describe("wormMeatYieldFromCull", () => {
  it("is zero for non-positive power reduction", () => {
    expect(wormMeatYieldFromCull(0, 5)).toBe(0);
    expect(wormMeatYieldFromCull(-3, 5)).toBe(0);
  });

  it("scales with both power reduced and reference density", () => {
    expect(wormMeatYieldFromCull(4, 5)).toBeCloseTo(10);
    expect(wormMeatYieldFromCull(8, 5)).toBeCloseTo(20);
    expect(wormMeatYieldFromCull(4, 10)).toBeCloseTo(20);
  });
});
