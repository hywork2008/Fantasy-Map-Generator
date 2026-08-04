import { beforeEach, describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { Dungeons, dungeonsAsDangerSources, rollTreasureTier } from "./dungeons-generator";

function makeCells(n: number) {
  const i = Uint16Array.from({ length: n }, (_, index) => index);
  const c: number[][] = [];
  for (let cell = 0; cell < n; cell++) {
    const neighbors: number[] = [];
    if (cell > 0) neighbors.push(cell - 1);
    if (cell < n - 1) neighbors.push(cell + 1);
    c.push(neighbors);
  }
  const p = Array.from({ length: n }, (_, cell) => [cell * 10, 0] as [number, number]);
  return {
    i,
    c,
    p,
    h: new Uint8Array(n).fill(30),
    burg: new Uint16Array(n),
    state: new Uint16Array(n),
    danger: new Uint8Array(n),
    wildLand: new Uint8Array(n)
  };
}

function createWorld(cellCount = 40): WorldContext {
  const cells = makeCells(cellCount);
  // A few burgs near the start so problem_lair / lost_vault distance works.
  cells.burg[1] = 1;
  cells.burg[2] = 2;
  // Seed some danger in the wild half.
  for (let cell = 20; cell < cellCount; cell++) cells.danger[cell] = 40 + (cell % 20);

  return {
    pack: {
      cells,
      burgs: [
        { i: 1, cell: 1, name: "A", removed: false },
        { i: 2, cell: 2, name: "B", removed: false }
      ],
      monsters: [],
      markers: [],
      dungeons: [],
      states: [{ i: 0, name: "Neutrals" }]
    },
    notes: [],
    biomesData: null,
    options: {}
  } as unknown as WorldContext;
}

describe("Dungeons.generate", () => {
  beforeEach(() => {
    useOptionsState.setState({ culturesSet: "highFantasy", year: 100, threatCalculation: "max" });
  });

  it("places only on land and within maxActive for highFantasy", () => {
    const world = createWorld(60);
    const dungeons = Dungeons.generate(world, { year: 100, forceCount: 5, random: () => 0.5 });
    expect(dungeons.length).toBeGreaterThan(0);
    expect(dungeons.length).toBeLessThanOrEqual(16);
    for (const d of dungeons) {
      expect(world.pack.cells.h[d.cell]).toBeGreaterThanOrEqual(20);
      expect(d.bossRarity).toBeGreaterThanOrEqual(1);
      expect(d.bossRarity).toBeLessThanOrEqual(3);
      expect(d.treasureTier).toBeGreaterThanOrEqual(0);
      expect(d.treasureTier).toBeLessThanOrEqual(4);
      expect(d.markerId).not.toBeNull();
    }
    const sites = (world.pack.markers ?? []).filter(m => m.type === "dungeon-site");
    expect(sites.length).toBe(dungeons.length);
  });

  it("does nothing for non-fantasy culture sets", () => {
    useOptionsState.setState({ culturesSet: "world" });
    const world = createWorld();
    const dungeons = Dungeons.generate(world, { random: () => 0.5 });
    expect(dungeons).toEqual([]);
    expect(world.pack.dungeons).toEqual([]);
  });

  it("clear removes dungeon, marker, and does not claim land", () => {
    const world = createWorld(60);
    // Put danger high so placement succeeds easily.
    for (let cell = 0; cell < 60; cell++) world.pack.cells.danger[cell] = 80;
    const dungeons = Dungeons.generate(world, { year: 100, forceCount: 3, random: () => 0.5 });
    expect(dungeons.length).toBeGreaterThan(0);
    const id = dungeons[0]!.i;
    const cell = dungeons[0]!.cell;
    const stateBefore = Array.from(world.pack.cells.state);

    expect(Dungeons.clear(world, id)).toBe(true);
    expect(world.pack.dungeons?.some(d => d.i === id)).toBe(false);
    expect((world.pack.markers ?? []).some(m => m.type === "dungeon-site" && m.cell === cell)).toBe(false);
    expect(Array.from(world.pack.cells.state)).toEqual(stateBefore);
  });

  it("dungeon bosses appear as danger sources", () => {
    const sources = dungeonsAsDangerSources([
      {
        i: 0,
        cell: 3,
        x: 0,
        y: 0,
        name: "Test",
        bossRarity: 2,
        bossPower: 8,
        bossType: "Drake",
        treasureTier: 1,
        kind: "wealth_lair",
        appearedYear: 100
      }
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.power).toBe(8);
    expect(sources[0]!.cell).toBe(3);
  });
});

describe("rollTreasureTier", () => {
  it("problem_lair stays barren or minor", () => {
    for (let i = 0; i < 30; i++) {
      const tier = rollTreasureTier(3, "problem_lair", () => i / 30);
      expect(tier).toBeLessThanOrEqual(1);
    }
  });

  it("lost_vault is at least notable", () => {
    for (let i = 0; i < 30; i++) {
      const tier = rollTreasureTier(1, "lost_vault", () => i / 30);
      expect(tier).toBeGreaterThanOrEqual(2);
    }
  });
});
