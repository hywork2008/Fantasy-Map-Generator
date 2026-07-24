import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { States } from "./states-generator";

describe("States.expandStates", () => {
  it("keeps unsettled cells unclaimed for settlement-nucleus patterns", () => {
    const { initialSettlementPattern, growthRate, statesGrowthRate } = useOptionsState.getState();
    // Ensure the queue reaches cell 2 through cell 1; the assertion then
    // proves that traversal itself does not claim unpopulated wilderness.
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
            biome: new Uint8Array([0, 0, 0]),
            culture: new Uint16Array([1, 1, 1]),
            pop: new Float32Array([10, 0, 10]),
            burg: new Uint16Array([1, 0, 2]),
            s: new Uint16Array([10, 10, 10]),
            f: new Uint16Array([0, 0, 0]),
            r: new Uint16Array(3),
            fl: new Uint16Array(3),
            t: new Int8Array([2, 2, 2]),
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

      expect(worldContext.pack.cells.state).toEqual(new Uint16Array([1, 0, 1]));
      expect(worldContext.pack.burgs[2].state).toBe(1);
    } finally {
      useOptionsState.setState({ initialSettlementPattern, growthRate, statesGrowthRate });
    }
  });
});
