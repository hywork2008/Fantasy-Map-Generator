import { describe, expect, it } from "vitest";
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { isTrueOceanHarborCell, isTrueOceanPortBurg } from "./oceanPort";

function packWith(partial: Partial<PackedGraph>): PackedGraph {
  return {
    cells: {
      haven: [0, 10, 11],
      f: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2, 3]
    },
    features: [
      0,
      { i: 1, type: "island", land: true, cells: 80 },
      { i: 2, type: "ocean", land: false, cells: 200 },
      { i: 3, type: "lake", land: false, cells: 8 }
    ],
    ...partial
  } as unknown as PackedGraph;
}

describe("isTrueOceanHarborCell", () => {
  it("accepts a haven on an ocean feature", () => {
    expect(isTrueOceanHarborCell(1, packWith({}))).toBe(true);
  });

  it("rejects a lake haven even when burg.port would store the ocean id", () => {
    expect(isTrueOceanHarborCell(2, packWith({}))).toBe(false);
  });

  it("rejects cells with no haven", () => {
    const pack = packWith({
      cells: { haven: [0, 0], f: [1, 1] } as PackedGraph["cells"]
    });
    expect(isTrueOceanHarborCell(1, pack)).toBe(false);
  });
});

describe("isTrueOceanPortBurg", () => {
  it("requires both a port flag and an ocean haven", () => {
    const pack = packWith({});
    const ocean: Burg = { i: 1, cell: 1, port: 2 } as Burg;
    const lake: Burg = { i: 2, cell: 2, port: 2 } as Burg;
    const inland: Burg = { i: 3, cell: 1, port: 0 } as Burg;
    expect(isTrueOceanPortBurg(ocean, pack)).toBe(true);
    expect(isTrueOceanPortBurg(lake, pack)).toBe(false);
    expect(isTrueOceanPortBurg(inland, pack)).toBe(false);
  });
});
