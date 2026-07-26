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

  it("does not govern an isolated settlement merely because it shares a region", () => {
    const cells = createCells(5, { 0: { 1: 0 }, 1: { 0: 0 } });
    const burgs = [0, { i: 1, cell: 0, capital: 1 }, { i: 2, cell: 4, capital: 0 }] as never;

    assignInitialPolities({
      plan: {
        regions: [{ id: 0, kind: "river", center: 0, cells: [0, 1, 4] }],
        nodes: [
          { id: 0, regionId: 0, cell: 0, role: "center", score: 10 },
          { id: 1, regionId: 0, cell: 4, role: "village", score: 5 }
        ],
        links: []
      },
      cells,
      burgs,
      states: [{ i: 0 }, { i: 1, capital: 1 }]
    });

    expect(cells.state[4]).toBe(0);
    expect(burgs[2].state).toBe(0);
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

    expect(cells.state).toEqual(new Uint16Array([1, 0, 1]));
  });

  it("treats States number as a network-density cap", () => {
    const plan = {
      regions: [{ id: 0, kind: "river" as const, center: 0, cells: [0] }],
      nodes: Array.from({ length: 10 }, (_, id) => ({ id, regionId: 0, cell: id, role: "village" as const, score: 1 })),
      links: []
    };

    expect(getInitialPolityCapitalCount(plan, 3)).toBe(1);
    expect(getInitialPolityCapitalCount(plan, 15)).toBe(5);
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
