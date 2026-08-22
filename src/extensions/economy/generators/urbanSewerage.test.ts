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
});
