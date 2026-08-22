import { describe, expect, it } from "vitest";
import { buildInheritedSewerRoutes } from "./urbanSewerage";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

const inheritedSewer = (burgId: number) => ({ burgId, hasInheritedRomanSewer: true }) as UrbanWaterSystem;

describe("buildInheritedSewerRoutes", () => {
  it("joins a lower river on the same landmass, never at its source cell", () => {
    const routes = buildInheritedSewerRoutes({
      burgs: [undefined, { i: 1, cell: 0, x: 10, y: 10, state: 1, type: "Generic" }],
      cells: {
        i: new Uint16Array([0, 1, 2, 3]),
        p: [
          [10, 10],
          [16, 10],
          [20, 10],
          [30, 10]
        ],
        f: new Uint16Array([1, 1, 1, 2]),
        h: new Uint16Array([70, 50, 30, 20]),
        r: new Uint16Array([0, 1, 1, 1]),
        haven: new Uint16Array([0, 0, 0, 0]),
        state: new Uint16Array([1, 1, 1, 2])
      },
      rivers: [{ i: 1, source: 1 }],
      systems: [inheritedSewer(1)]
    });

    expect(routes).toEqual([expect.objectContaining({ burgId: 1, outfallCell: 2, outfallKind: "river" })]);
  });

  it("can drain to a lower coast but never to another island", () => {
    const routes = buildInheritedSewerRoutes({
      burgs: [undefined, { i: 1, cell: 0, x: 10, y: 10, state: 1, type: "Generic" }],
      cells: {
        i: new Uint16Array([0, 1, 2]),
        p: [
          [10, 10],
          [14, 10],
          [30, 10]
        ],
        f: new Uint16Array([1, 1, 2]),
        h: new Uint16Array([60, 10, 5]),
        r: new Uint16Array([0, 0, 1]),
        haven: new Uint16Array([0, 4, 0]),
        state: new Uint16Array([1, 1, 2])
      },
      systems: [inheritedSewer(1)]
    });

    expect(routes).toEqual([expect.objectContaining({ outfallCell: 1, outfallKind: "coast" })]);
  });

  it("chooses the nearby coast instead of extending a trunk sewer to a distant river", () => {
    const routes = buildInheritedSewerRoutes({
      burgs: [undefined, { i: 1, cell: 0, x: 0, y: 0, state: 1, type: "Generic" }],
      cells: {
        i: new Uint16Array([0, 1, 2]),
        p: [
          [0, 0],
          [100, 0],
          [10, 0]
        ],
        f: new Uint16Array([1, 1, 1]),
        h: new Uint16Array([60, 10, 10]),
        r: new Uint16Array([0, 1, 0]),
        haven: new Uint16Array([0, 0, 4]),
        state: new Uint16Array([1, 1, 1])
      },
      systems: [inheritedSewer(1)]
    });

    expect(routes).toEqual([expect.objectContaining({ outfallCell: 2, outfallKind: "coast" })]);
  });

  it("merges nearby parallel drains into one downstream river trunk", () => {
    const routes = buildInheritedSewerRoutes({
      burgs: [
        undefined,
        { i: 1, cell: 0, x: 0, y: 0, state: 1, type: "Generic" },
        { i: 2, cell: 1, x: 0, y: 8, state: 1, type: "Generic" }
      ],
      cells: {
        i: new Uint16Array([0, 1, 2, 3, 4]),
        p: [
          [0, 0],
          [0, 8],
          [100, 0],
          [100, 8],
          [200, 0]
        ],
        f: new Uint16Array([1, 1, 1, 1, 1]),
        h: new Uint16Array([60, 60, 10, 10, 100]),
        r: new Uint16Array([0, 0, 1, 1, 1]),
        haven: new Uint16Array([0, 0, 0, 0, 0]),
        state: new Uint16Array([1, 1, 1, 1, 1])
      },
      rivers: [{ i: 1, source: 4 }],
      systems: [inheritedSewer(1), inheritedSewer(2)]
    });

    expect(routes).toEqual([
      expect.objectContaining({ burgId: 1, outfallCell: 2 }),
      expect.objectContaining({ burgId: 2, joinsRouteId: "roman-sewer-1", outfallCell: 2, destination: [50, 0] })
    ]);
  });

  it("turns crossing drains for the same river into a junction", () => {
    const routes = buildInheritedSewerRoutes({
      burgs: [
        undefined,
        { i: 1, cell: 0, x: 0, y: 0, state: 1, type: "Generic" },
        { i: 2, cell: 1, x: 0, y: 100, state: 1, type: "Generic" }
      ],
      cells: {
        i: new Uint16Array([0, 1, 2, 3, 4]),
        p: [
          [0, 0],
          [0, 100],
          [100, 0],
          [100, -100],
          [200, 0]
        ],
        f: new Uint16Array([1, 1, 1, 1, 1]),
        h: new Uint16Array([70, 50, 60, 10, 100]),
        r: new Uint16Array([0, 0, 1, 1, 1]),
        haven: new Uint16Array([0, 0, 0, 0, 0]),
        state: new Uint16Array([1, 1, 1, 1, 1])
      },
      rivers: [{ i: 1, source: 4 }],
      systems: [inheritedSewer(1), inheritedSewer(2)]
    });

    expect(routes[0]).toEqual(
      expect.objectContaining({ joinsRouteId: "roman-sewer-2", outfallCell: 3, destination: [50, 0] })
    );
  });
});
