import { describe, expect, it } from "vitest";
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { getBurgPorts } from "./burgPorts";

const burg: Burg = { i: 1, cell: 0, x: 0, y: 0, port: 1 };
function fixture(navigation?: "river"): PackedGraph {
  return {
    cells: { r: [7], haven: [1], f: [0, 1] },
    features: [null, { type: "ocean" }],
    routes: [
      {
        i: 0,
        group: "searoutes",
        navigation,
        cells: [0, 2],
        points: [
          [0, 0, 0],
          [2, 0, 2]
        ]
      }
    ]
  } as unknown as PackedGraph;
}
describe("burg port flags", () => {
  it("recognizes connected river and sea lanes even before a legacy port ID is assigned", () => {
    expect(getBurgPorts({ ...burg, port: 0 }, fixture("river"))).toEqual({ riverPort: true, seaPort: false });
    expect(getBurgPorts({ ...burg, port: 0 }, fixture())).toEqual({ riverPort: false, seaPort: true });
  });
  it("keeps explicit flags authoritative when routes arrive later", () => {
    expect(getBurgPorts({ ...burg, riverPort: false, seaPort: true }, fixture("river"))).toEqual({
      riverPort: false,
      seaPort: true
    });
  });
  it("supports dual ports and restores legacy ports without routes", () => {
    const pack = fixture();
    pack.routes = [];
    expect(getBurgPorts(burg, pack)).toEqual({ riverPort: true, seaPort: true });
    pack.cells.haven[0] = 0;
    expect(getBurgPorts(burg, pack)).toEqual({ riverPort: true, seaPort: false });
  });
});
