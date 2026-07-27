import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { States } from "./states-generator";

describe("States.expandStates", () => {
  it("does not create a Cold Desert administrative corridor without an initial movement route", () => {
    const { initialSettlementPattern, growthRate, statesGrowthRate } = useOptionsState.getState();
    // Without an initial route, both the distant burg and the intervening
    // Cold Desert remain unclaimed rather than forming a State-only corridor.
    useOptionsState.setState({ initialSettlementPattern: "frontier", growthRate: 1, statesGrowthRate: 1 });

    try {
      const worldContext = {
        options: { initialSettlementPattern: "frontier" },
        biomesData: { cost: new Uint16Array([10]) },
        pack: {
          cells: {
            i: new Uint16Array([0, 1, 2, 3, 4, 5, 6]),
            state: new Uint16Array(7),
            h: new Uint8Array([25, 25, 25, 25, 25, 25, 25]),
            c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5]],
            biomeCode: new Uint8Array([0, 0, 0, 0, 0, 0, 0]),
            culture: new Uint16Array([1, 1, 1, 1, 1, 1, 1]),
            pop: new Float32Array([10, 0, 0, 0, 0, 0, 10]),
            burg: new Uint16Array([1, 0, 0, 0, 0, 0, 2]),
            s: new Uint16Array([10, 10, 10, 10, 10, 10, 10]),
            f: new Uint16Array([0, 0, 0, 0, 0, 0, 0]),
            r: new Uint16Array(7),
            fl: new Uint16Array(7),
            t: new Int8Array([2, 2, 2, 2, 2, 2, 2]),
            routes: {},
            p: [
              [0, 0],
              [1, 0],
              [2, 0],
              [3, 0],
              [4, 0],
              [5, 0],
              [6, 0]
            ]
          },
          features: [{ type: "land" }],
          cultures: [0, { center: 0, type: "Generic" }],
          states: [
            { i: 0, name: "Neutrals" },
            { i: 1, name: "Aster", center: 0, capital: 1, culture: 1, expansionism: 1, type: "Generic" }
          ],
          burgs: [0, { i: 1, capital: 1, cell: 0 }, { i: 2, capital: 0, cell: 6 }]
        }
      } as unknown as WorldContext;

      States.expandStates(worldContext, {} as never, {} as never);

      expect(worldContext.pack.cells.state).toEqual(new Uint16Array([1, 0, 0, 0, 0, 0, 0]));
      expect(worldContext.pack.burgs[2].state).toBe(0);
    } finally {
      useOptionsState.setState({ initialSettlementPattern, growthRate, statesGrowthRate });
    }
  });

  it("does not infer an administrative connection from a route without a Settlement Foundation plan", () => {
    const { initialSettlementPattern, growthRate, statesGrowthRate } = useOptionsState.getState();
    useOptionsState.setState({ initialSettlementPattern: "frontier", growthRate: 100, statesGrowthRate: 1 });

    try {
      const worldContext = {
        options: { initialSettlementPattern: "frontier" },
        biomesData: { cost: new Uint16Array([10]) },
        pack: {
          cells: {
            i: new Uint16Array([0, 1, 2]),
            state: new Uint16Array(3),
            h: new Uint8Array([25, 25, 25]),
            c: [[1], [0, 2], [1]],
            biomeCode: new Uint8Array([0, 0, 0]),
            culture: new Uint16Array([1, 1, 1]),
            pop: new Float32Array([10, 0, 10]),
            burg: new Uint16Array([1, 0, 2]),
            s: new Uint16Array([10, 10, 10]),
            f: new Uint16Array([0, 0, 0]),
            r: new Uint16Array(3),
            fl: new Uint16Array(3),
            t: new Int8Array([2, 2, 2]),
            routes: { 0: { 1: 0 }, 1: { 0: 0, 2: 0 }, 2: { 1: 0 } },
            p: [
              [0, 0],
              [1, 0],
              [2, 0]
            ]
          },
          features: [{ type: "land" }],
          cultures: [0, { center: 0, type: "Generic" }],
          states: [
            { i: 0, name: "Neutrals" },
            { i: 1, name: "Aster", center: 0, capital: 1, culture: 1, expansionism: 1, type: "Generic" }
          ],
          burgs: [0, { i: 1, capital: 1, cell: 0 }, { i: 2, capital: 0, cell: 2 }]
        }
      } as unknown as WorldContext;

      States.expandStates(worldContext, {} as never, {} as never);

      expect(worldContext.pack.cells.state).toEqual(new Uint16Array([1, 0, 0]));
    } finally {
      useOptionsState.setState({ initialSettlementPattern, growthRate, statesGrowthRate });
    }
  });

  it("leaves non-foundation wilderness unclaimed outside the capital", () => {
    const { initialSettlementPattern, growthRate, statesGrowthRate } = useOptionsState.getState();
    useOptionsState.setState({ initialSettlementPattern: "frontier", growthRate: 100, statesGrowthRate: 1 });

    try {
      const worldContext = {
        options: { initialSettlementPattern: "frontier" },
        biomesData: { cost: new Uint16Array([10]) },
        pack: {
          cells: {
            i: new Uint16Array([0, 1, 2, 3]),
            state: new Uint16Array(4),
            h: new Uint8Array([25, 25, 25, 25]),
            c: [
              [1, 2, 3],
              [0, 2, 3],
              [0, 1, 3],
              [0, 1, 2]
            ],
            biomeCode: new Uint8Array(4),
            culture: new Uint16Array([1, 1, 1, 1]),
            pop: new Float32Array([10, 10, 10, 0]),
            burg: new Uint16Array([1, 2, 3, 0]),
            s: new Uint16Array([10, 10, 10, 10]),
            f: new Uint16Array(4),
            r: new Uint16Array(4),
            fl: new Uint16Array(4),
            t: new Int8Array([2, 2, 2, 2]),
            p: [
              [0, 0],
              [1, 0],
              [0, 1],
              [0.5, 0.5]
            ]
          },
          features: [{ type: "land" }],
          cultures: [0, { center: 0, type: "Generic" }],
          states: [
            { i: 0, name: "Neutrals" },
            { i: 1, name: "Aster", center: 0, capital: 1, culture: 1, expansionism: 1, type: "Generic" }
          ],
          burgs: [0, { i: 1, capital: 1, cell: 0 }, { i: 2, capital: 0, cell: 1 }, { i: 3, capital: 0, cell: 2 }]
        }
      } as unknown as WorldContext;

      States.expandStates(worldContext, {} as never, {} as never);

      expect(worldContext.pack.cells.state).toEqual(new Uint16Array([1, 0, 0, 0]));
    } finally {
      useOptionsState.setState({ initialSettlementPattern, growthRate, statesGrowthRate });
    }
  });
});
