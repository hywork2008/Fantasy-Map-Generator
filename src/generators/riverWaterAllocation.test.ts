import { describe, expect, it } from "vitest";
import type { PackedGraph } from "../types/PackedGraph";
import { allocateRiverWater, buildRiverDownstream, compileRiverWaterNetwork } from "./riverWaterAllocation";

function createRiverPack(): Pick<PackedGraph, "cells" | "rivers"> {
  return {
    cells: {
      i: Uint16Array.from([0, 1, 2, 3, 4]),
      c: [[1], [0, 2, 4], [1, 3], [2], [1]],
      h: Uint8Array.from([20, 20, 20, 20, 20]),
      r: Uint16Array.from([1, 1, 1, 1, 0]),
      fl: Uint16Array.from([10, 20, 30, 40, 0]),
      riverDownstream: Int32Array.from([1, 2, 3, -1, -1])
    } as unknown as PackedGraph["cells"],
    rivers: []
  };
}

describe("river water allocation", () => {
  it("carries upstream withdrawals into lower residual flow and preserves the environmental reserve", () => {
    const network = compileRiverWaterNetwork({ pack: createRiverPack(), annualWaterPerFlux: 1 });
    const allocation = allocateRiverWater(
      network,
      [
        {
          id: "upstream",
          intake: { riverCellId: 0, hops: 0 },
          beneficiaryCellId: 0,
          requestedWithdrawal: 5,
          maximumWithdrawal: 5,
          conveyanceEfficiency: 1,
          priority: 1
        },
        {
          id: "downstream",
          intake: { riverCellId: 3, hops: 0 },
          beneficiaryCellId: 3,
          requestedWithdrawal: 20,
          maximumWithdrawal: 20,
          conveyanceEfficiency: 1,
          priority: 1
        }
      ],
      { environmentalFlowReserve: 0.5 }
    );

    expect(allocation.status).toBe("complete");
    expect(allocation.allocations[0]?.withdrawnWater).toBe(5);
    expect(allocation.allocations[1]?.withdrawnWater).toBe(15);
    expect(allocation.residualFlowByCell[3]).toBe(20);
  });

  it("assigns an adjacent field to its strongest neighbouring river intake", () => {
    const network = compileRiverWaterNetwork({ pack: createRiverPack(), annualWaterPerFlux: 1 });

    expect(network.intakeByFieldCell[4]).toEqual({ riverCellId: 1, hops: 1 });
  });

  it("constructs directed land reaches from generated river paths", () => {
    const cells = createRiverPack().cells;
    const downstream = buildRiverDownstream(cells, [
      { i: 1, cells: [0, 1, 2, 3, -1] } as PackedGraph["rivers"][number]
    ]);

    expect(Array.from(downstream)).toEqual([1, 2, 3, -1, -1]);
  });
});
