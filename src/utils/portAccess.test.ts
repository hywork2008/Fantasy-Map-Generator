import { describe, expect, it } from "vitest";
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { getPortAnchorPosition } from "./portAccess";

function makeCoastalPack(): PackedGraph {
  return {
    cells: {
      haven: new Uint8Array([1, 0]),
      v: [
        [0, 1],
        [0, 1]
      ],
      p: [
        [0, 0],
        [0, 10]
      ]
    },
    vertices: {
      c: [
        [0, 1, -1],
        [0, 1, -1]
      ],
      p: [
        [-2, 2],
        [2, 2]
      ]
    }
  } as unknown as PackedGraph;
}

describe("getPortAnchorPosition", () => {
  it("places a coastal port anchor inside its haven cell", () => {
    const burg: Burg = { i: 1, cell: 0, x: 0, y: 1.9, port: 1 };

    expect(getPortAnchorPosition(makeCoastalPack(), burg)).toEqual([0, 2.8]);
  });

  it("keeps a river port at its burg position when it has no haven", () => {
    const pack = makeCoastalPack();
    pack.cells.haven[0] = 0;
    const burg: Burg = { i: 1, cell: 0, x: 3, y: 4, port: 1 };

    expect(getPortAnchorPosition(pack, burg)).toEqual([3, 4]);
  });
});
