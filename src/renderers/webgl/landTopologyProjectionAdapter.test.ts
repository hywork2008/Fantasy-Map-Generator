import { describe, expect, it } from "vitest";
import { inProcessLandTopologyProjectionAdapter } from "./landTopologyProjectionAdapter";

describe("InProcessLandTopologyProjectionAdapter", () => {
  it("projects cell polygons into the renderer's transferable flat topology", () => {
    const topology = inProcessLandTopologyProjectionAdapter.project([
      {
        cellId: 4,
        polygon: [
          [1, 2],
          [3, 4]
        ]
      },
      {
        cellId: 9,
        polygon: [
          [5, 6],
          [7, 8],
          [9, 10]
        ]
      }
    ]);

    expect(Array.from(topology.cellIds)).toEqual([4, 9]);
    expect(Array.from(topology.polygonOffsets)).toEqual([0, 4, 10]);
    expect(Array.from(topology.coordinates)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
