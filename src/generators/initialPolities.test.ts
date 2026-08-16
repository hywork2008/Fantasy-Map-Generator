import { describe, expect, it } from "vitest";
import {
  assignInitialPolities,
  getInitialPolityCapitalCount,
  selectInitialPolityCapitalNodes
} from "./initialPolities";

describe("Initial Polities Module", () => {
  it("derives territory from a materialized route and compact settlement service area", () => {
    const cells = createCells(5, { 0: { 1: 0 }, 1: { 0: 0, 2: 0 }, 2: { 1: 0 } });
    const burgs = [0, { i: 1, cell: 0, capital: 1 }, { i: 2, cell: 2, capital: 0 }] as never;

    assignInitialPolities({
      plan: {
        regions: [{ id: 0, kind: "river", center: 0, cells: [0, 1, 2] }],
        nodes: [
          { id: 0, regionId: 0, cell: 0, role: "center", score: 10 },
          { id: 1, regionId: 0, cell: 2, role: "village", score: 5 }
        ],
        links: [{ fromNodeId: 0, toNodeId: 1, kind: "river" }]
      },
      cells,
      burgs,
      states: [{ i: 0 }, { i: 1, capital: 1 }]
    });

    expect(cells.state).toEqual(new Uint16Array([1, 1, 1, 0, 0]));
    expect(burgs[2].state).toBe(1);
  });

  it("grows a compact contiguous core of the requested cell count", () => {
    const cells = createCells(8, {});
    cells.burg[0] = 1;
    const burgs = [0, { i: 1, cell: 0, capital: 1 }] as never;

    assignInitialPolities({
      plan: {
        regions: [{ id: 0, kind: "river", center: 0, cells: [0, 1, 2, 3, 4, 5] }],
        nodes: [{ id: 0, regionId: 0, cell: 0, role: "center", score: 10 }],
        links: []
      },
      cells,
      burgs,
      states: [{ i: 0 }, { i: 1, capital: 1 }],
      realmSize: 3
    });

    expect(Array.from(cells.state)).toEqual([1, 1, 1, 0, 0, 0, 0, 0]);
    expect(burgs[1].state).toBe(1);
  });

  it("does not claim a burg outside the foundation region as state territory", () => {
    const cells = createCells(5, {});
    cells.burg[0] = 1;
    cells.burg[4] = 2;
    const burgs = [0, { i: 1, cell: 0, capital: 1 }, { i: 2, cell: 4, capital: 0 }] as never;

    assignInitialPolities({
      plan: {
        regions: [{ id: 0, kind: "river", center: 0, cells: [0, 1, 2] }],
        nodes: [{ id: 0, regionId: 0, cell: 0, role: "center", score: 10 }],
        links: []
      },
      cells,
      burgs,
      states: [{ i: 0 }, { i: 1, capital: 1 }]
    });

    expect(cells.state[0]).toBe(1);
    expect(cells.state[1]).toBe(1);
    expect(cells.state[2]).toBe(1);
    expect(cells.state[4]).toBe(0);
    expect(burgs[2].state).toBe(0);
  });

  it("removes rural people from unclaimed cells so a one-cell start can still expand", () => {
    const cells = createCells(5, {});
    cells.burg[0] = 1;
    const burgs = [0, { i: 1, cell: 0, capital: 1 }] as never;

    assignInitialPolities({
      plan: {
        regions: [{ id: 0, kind: "river", center: 0, cells: [0, 1, 2, 3] }],
        nodes: [{ id: 0, regionId: 0, cell: 0, role: "center", score: 10 }],
        links: []
      },
      cells,
      burgs,
      states: [{ i: 0 }, { i: 1, capital: 1 }],
      realmSize: 1
    });

    expect(Array.from(cells.state)).toEqual([1, 0, 0, 0, 0]);
    expect(cells.pop[0]).toBe(10);
    expect(Array.from(cells.pop.slice(1))).toEqual([0, 0, 0, 0]);
  });

  it("keeps people only on the compact starting realm, not the leftover oikoumene", () => {
    const cells = createCells(8, {});
    cells.burg[0] = 1;
    const burgs = [0, { i: 1, cell: 0, capital: 1 }] as never;

    assignInitialPolities({
      plan: {
        regions: [{ id: 0, kind: "river", center: 0, cells: [0, 1, 2, 3, 4, 5] }],
        nodes: [{ id: 0, regionId: 0, cell: 0, role: "center", score: 10 }],
        links: []
      },
      cells,
      burgs,
      states: [{ i: 0 }, { i: 1, capital: 1 }],
      realmSize: 3
    });

    expect(Array.from(cells.state.slice(0, 3))).toEqual([1, 1, 1]);
    expect(cells.pop[0]).toBe(10);
    expect(cells.pop[2]).toBe(10);
    expect(cells.pop[3]).toBe(0);
    expect(cells.pop[5]).toBe(0);
  });

  it("starts each State as a single capital city when scope is capital", () => {
    const cells = createCells(8, { 0: { 1: 0 }, 1: { 0: 0, 2: 0 }, 2: { 1: 0 } });
    cells.burg[0] = 1;
    cells.burg[4] = 2;
    const burgs = [0, { i: 1, cell: 0, capital: 1 }, { i: 2, cell: 4, capital: 0 }] as never;

    assignInitialPolities({
      plan: {
        regions: [{ id: 0, kind: "river", center: 0, cells: [0, 1, 2, 3, 4, 5] }],
        nodes: [
          { id: 0, regionId: 0, cell: 0, role: "center", score: 10 },
          { id: 1, regionId: 0, cell: 4, role: "village", score: 5 }
        ],
        links: [{ fromNodeId: 0, toNodeId: 1, kind: "river" }]
      },
      cells,
      burgs,
      states: [{ i: 0 }, { i: 1, capital: 1 }],
      realmSize: 1
    });

    expect(Array.from(cells.state)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(burgs[1].state).toBe(1);
    expect(burgs[2].state).toBe(0);
  });

  it("fills the foundation region when it is smaller than the realm-size cap", () => {
    // Six-cell region, default cap 30: the whole contiguous region is claimed.
    const cells = createCells(8, {});
    cells.burg[0] = 1;
    const burgs = [0, { i: 1, cell: 0, capital: 1 }] as never;

    assignInitialPolities({
      plan: {
        regions: [{ id: 0, kind: "river", center: 0, cells: [0, 1, 2, 3, 4, 5] }],
        nodes: [
          { id: 0, regionId: 0, cell: 0, role: "center", score: 10 },
          { id: 1, regionId: 0, cell: 3, role: "village", score: 5 }
        ],
        links: []
      },
      cells,
      burgs,
      states: [{ i: 0 }, { i: 1, capital: 1 }]
    });

    expect(Array.from(cells.state.slice(0, 6))).toEqual([1, 1, 1, 1, 1, 1]);
    expect(cells.state[6]).toBe(0);
    expect(cells.state[7]).toBe(0);
  });

  it("never assigns a State to a water cell used by a movement route", () => {
    const cells = createCells(3, { 0: { 1: 0 }, 1: { 0: 0, 2: 0 }, 2: { 1: 0 } });
    cells.h[1] = 19;
    const burgs = [0, { i: 1, cell: 0, capital: 1 }] as never;

    assignInitialPolities({
      plan: {
        regions: [{ id: 0, kind: "coast", center: 0, cells: [0, 1, 2] }],
        nodes: [
          { id: 0, regionId: 0, cell: 0, role: "center", score: 10 },
          { id: 1, regionId: 0, cell: 2, role: "village", score: 5 }
        ],
        links: [{ fromNodeId: 0, toNodeId: 1, kind: "coastal" }]
      },
      cells,
      burgs,
      states: [{ i: 0 }, { i: 1, capital: 1 }]
    });

    expect(cells.state).toEqual(new Uint16Array([1, 0, 0]));
  });

  it("treats States number as the capital count target (not node/2 capacity)", () => {
    const plan = {
      regions: [
        { id: 0, kind: "river" as const, center: 0, cells: [0] },
        { id: 1, kind: "river" as const, center: 1, cells: [1] },
        { id: 2, kind: "river" as const, center: 2, cells: [2] }
      ],
      nodes: Array.from({ length: 40 }, (_, id) => ({
        id,
        regionId: id % 3,
        cell: id,
        role: "village" as const,
        score: 1
      })),
      links: []
    };

    // Many village nodes must not inflate capital count past the slider.
    expect(getInitialPolityCapitalCount(plan, 3)).toBe(3);
    expect(getInitialPolityCapitalCount(plan, 15)).toBe(15);
    expect(getInitialPolityCapitalCount(plan, 50)).toBe(40);
  });

  it("spreads planned capitals between regional centers before using nearby villages", () => {
    const plan = {
      regions: [
        { id: 0, kind: "river" as const, center: 0, cells: [0, 1] },
        { id: 1, kind: "river" as const, center: 2, cells: [2, 3] },
        { id: 2, kind: "river" as const, center: 4, cells: [4] }
      ],
      nodes: [
        { id: 0, regionId: 0, cell: 0, role: "center" as const, score: 20 },
        { id: 1, regionId: 0, cell: 1, role: "village" as const, score: 19 },
        { id: 2, regionId: 1, cell: 2, role: "center" as const, score: 18 },
        { id: 3, regionId: 1, cell: 3, role: "village" as const, score: 17 },
        { id: 4, regionId: 2, cell: 4, role: "center" as const, score: 2 }
      ],
      links: []
    };
    const points: [number, number][] = [
      [0, 0],
      [1, 0],
      [20, 0],
      [21, 0],
      [200, 0]
    ];

    expect(selectInitialPolityCapitalNodes(plan, points, 3).map(node => node.cell)).toEqual([0, 4, 2]);
    expect(selectInitialPolityCapitalNodes(plan, points, 4).map(node => node.cell)).toEqual([0, 4, 2, 1]);
    expect(selectInitialPolityCapitalNodes(plan, points, 3, { maxPerRegion: 1 }).map(node => node.cell)).toEqual([
      0, 4, 2
    ]);
  });

  it("does not double a region while another homeland is still empty", () => {
    const plan = {
      regions: [
        { id: 0, kind: "river" as const, center: 0, cells: [0, 1] },
        { id: 1, kind: "river" as const, center: 2, cells: [2] }
      ],
      nodes: [
        { id: 0, regionId: 0, cell: 0, role: "center" as const, score: 20 },
        { id: 1, regionId: 0, cell: 1, role: "village" as const, score: 19 },
        { id: 2, regionId: 1, cell: 2, role: "village" as const, score: 1 }
      ],
      links: []
    };
    const points: [number, number][] = [
      [0, 0],
      [1, 0],
      [200, 0]
    ];

    expect(selectInitialPolityCapitalNodes(plan, points, 2, { maxPerRegion: 1 }).map(node => node.cell)).toEqual([
      0, 2
    ]);
  });
});

function createCells(length: number, routes: Record<number, Record<number, number>>) {
  return {
    i: new Uint16Array(Array.from({ length }, (_, index) => index)),
    c: Array.from({ length }, (_, index) => [index - 1, index + 1].filter(cell => cell >= 0 && cell < length)),
    h: new Uint8Array(Array.from({ length }, () => 25)),
    pop: new Float32Array(Array.from({ length }, () => 10)),
    burg: new Uint16Array(length),
    routes,
    p: Array.from({ length }, (_, index) => [index, 0] as [number, number]),
    state: new Uint16Array(length)
  };
}
