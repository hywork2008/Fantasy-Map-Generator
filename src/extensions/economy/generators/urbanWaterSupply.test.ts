import { describe, expect, it } from "vitest";
import { buildInheritedWaterSupplyRoutes } from "./urbanWaterSupply";
import type { UrbanWaterSystem } from "./urbanWaterTypes";

const inheritedSystem = (burgId: number, hasInheritedRomanWaterworks = true) =>
  ({ burgId, hasInheritedRomanWaterworks }) as UrbanWaterSystem;

describe("buildInheritedWaterSupplyRoutes", () => {
  it("prefers a higher river intake inside the owning State", () => {
    const routes = buildInheritedWaterSupplyRoutes({
      burgs: [undefined, { i: 1, cell: 0, x: 10, y: 10, state: 1, type: "Generic" }],
      cells: {
        i: new Uint16Array([0, 1, 2, 3]),
        p: [
          [10, 10],
          [12, 10],
          [40, 10],
          [11, 10]
        ],
        f: new Uint16Array([1, 1, 1, 1]),
        haven: new Uint16Array([0, 0, 0, 0]),
        r: new Uint16Array([0, 1, 1, 1]),
        h: new Uint16Array([40, 30, 80, 70]),
        state: new Uint16Array([1, 1, 2, 1])
      },
      systems: [inheritedSystem(1)]
    });

    expect(routes).toEqual([
      expect.objectContaining({ burgId: 1, sourceCell: 3, source: [11, 10], destination: [10, 10] })
    ]);
  });

  it("does not use a foreign State's river as an unprotected intake", () => {
    const routes = buildInheritedWaterSupplyRoutes({
      burgs: [undefined, { i: 1, cell: 0, x: 10, y: 10, state: 1, type: "Generic" }],
      cells: {
        i: new Uint16Array([0, 1]),
        p: [
          [10, 10],
          [20, 10]
        ],
        f: new Uint16Array([1, 1]),
        haven: new Uint16Array([0, 0]),
        r: new Uint16Array([0, 1]),
        h: new Uint16Array([20, 50]),
        state: new Uint16Array([1, 2])
      },
      systems: [inheritedSystem(1)]
    });

    expect(routes).toEqual([]);
  });

  it("does not substitute a foreign gravity source for a lower local river", () => {
    const routes = buildInheritedWaterSupplyRoutes({
      burgs: [undefined, { i: 1, cell: 0, x: 10, y: 10, state: 1, type: "Generic" }],
      cells: {
        i: new Uint16Array([0, 1, 2]),
        p: [
          [10, 10],
          [12, 10],
          [30, 10]
        ],
        f: new Uint16Array([1, 1, 1]),
        haven: new Uint16Array([0, 0, 0]),
        r: new Uint16Array([0, 1, 1]),
        h: new Uint16Array([50, 30, 80]),
        state: new Uint16Array([1, 1, 2])
      },
      systems: [inheritedSystem(1)]
    });

    expect(routes).toEqual([]);
  });

  it("rejects a source polluted by an inherited sewer outfall upstream", () => {
    const routes = buildInheritedWaterSupplyRoutes({
      burgs: [
        undefined,
        { i: 1, cell: 3, x: 30, y: 10, state: 1, type: "Generic" },
        { i: 2, cell: 1, x: 10, y: 10, state: 1, type: "Generic" }
      ],
      cells: {
        i: new Uint16Array([0, 1, 2, 3]),
        p: [
          [0, 10],
          [10, 10],
          [20, 10],
          [30, 10]
        ],
        f: new Uint16Array([1, 1, 1, 1]),
        haven: new Uint16Array([0, 0, 0, 0]),
        r: new Uint16Array([1, 0, 1, 0]),
        h: new Uint16Array([80, 100, 70, 20]),
        state: new Uint16Array([1, 1, 1, 1])
      },
      systems: [inheritedSystem(1), inheritedSystem(2)]
    });

    expect(routes.find(route => route.burgId === 1)).toBeUndefined();
  });

  it("never crosses a sea to reach a river on another landmass", () => {
    const routes = buildInheritedWaterSupplyRoutes({
      burgs: [undefined, { i: 1, cell: 0, x: 10, y: 10, state: 1, type: "Generic" }],
      cells: {
        i: new Uint16Array([0, 1]),
        p: [
          [10, 10],
          [20, 10]
        ],
        f: new Uint16Array([1, 2]),
        haven: new Uint16Array([0, 0]),
        r: new Uint16Array([0, 1]),
        h: new Uint16Array([20, 50]),
        state: new Uint16Array([1, 2])
      },
      systems: [inheritedSystem(1)]
    });

    expect(routes).toEqual([]);
  });

  it("does not draw ordinary sewer-only systems as aqueducts", () => {
    const routes = buildInheritedWaterSupplyRoutes({
      burgs: [undefined, { i: 1, cell: 0, x: 10, y: 10, state: 1, type: "Generic" }],
      cells: {
        i: new Uint16Array([0, 1]),
        p: [
          [10, 10],
          [20, 10]
        ],
        f: new Uint16Array([1, 1]),
        haven: new Uint16Array([0, 0]),
        r: new Uint16Array([0, 1]),
        h: new Uint16Array([20, 50]),
        state: new Uint16Array([1, 1])
      },
      systems: [inheritedSystem(1, false)]
    });

    expect(routes).toEqual([]);
  });
});
