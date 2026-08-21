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

  it("falls back to a cross-border river when the State has no river", () => {
    const routes = buildInheritedWaterSupplyRoutes({
      burgs: [undefined, { i: 1, cell: 0, x: 10, y: 10, state: 1, type: "Generic" }],
      cells: {
        i: new Uint16Array([0, 1]),
        p: [
          [10, 10],
          [20, 10]
        ],
        f: new Uint16Array([1, 1]),
        r: new Uint16Array([0, 1]),
        h: new Uint16Array([20, 50]),
        state: new Uint16Array([1, 2])
      },
      systems: [inheritedSystem(1)]
    });

    expect(routes[0]).toMatchObject({ sourceCell: 1, source: [20, 10] });
  });

  it("prefers a cross-border gravity source over a lower river in the same State", () => {
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
        r: new Uint16Array([0, 1, 1]),
        h: new Uint16Array([50, 30, 80]),
        state: new Uint16Array([1, 1, 2])
      },
      systems: [inheritedSystem(1)]
    });

    expect(routes[0]).toMatchObject({ sourceCell: 2, source: [30, 10] });
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
        r: new Uint16Array([0, 1]),
        h: new Uint16Array([20, 50]),
        state: new Uint16Array([1, 1])
      },
      systems: [inheritedSystem(1, false)]
    });

    expect(routes).toEqual([]);
  });
});
