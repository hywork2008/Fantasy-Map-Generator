import { describe, expect, it } from "vitest";
import type { Cell, Point } from "./types";
import { assignWards, type WardInputs } from "./wards";

function makeCell(id: number, centroid: Point, neighbors: number[]): Cell {
  const [cx, cy] = centroid;
  const s = 10;
  return {
    id,
    site: centroid,
    centroid,
    polygon: [
      [cx - s, cy - s],
      [cx + s, cy - s],
      [cx + s, cy + s],
      [cx - s, cy + s]
    ],
    neighbors,
    onBorder: false
  };
}

describe("assignWards with automatic cemetery placement", () => {
  it("places a cemetery adjacent to cathedral/temple", () => {
    // Grid:
    // cell 0: plaza (market) at (0, 0)
    // cell 1: temple (cathedral) at (20, 0)
    // cell 2: south of temple at (20, -20)
    // cell 3: north of temple at (20, 20)
    // cell 4: east of temple at (40, 0)
    const cells: Cell[] = [
      makeCell(0, [0, 0], [1]),
      makeCell(1, [20, 0], [0, 2, 3, 4]),
      makeCell(2, [20, -20], [1]),
      makeCell(3, [20, 20], [1]),
      makeCell(4, [40, 0], [1])
    ];

    const input: WardInputs = {
      cells,
      urban: new Set([0, 1, 2, 3, 4]),
      outskirts: new Set(),
      sea: new Set(),
      borders: [],
      gates: [],
      precincts: [
        { kind: "plaza", cellIds: [0], anchor: [0, 0] },
        { kind: "temple", cellIds: [1], anchor: [20, 0] }
      ],
      geo: { bounds: [0, 0, 100, 100], riverCentres: [], roadPaths: [] },
      params: {
        seed: "cemetery-test-seed",
        cityRadiusMeters: 50,
        cellSizeMeters: 20,
        extentMeters: 600,
        nPatches: 1
      },
      program: {
        walls: false,
        citadel: false,
        plaza: true,
        temple: true,
        port: false,
        shanty: false,
        capital: false
      },
      shoreline: null,
      waterPolygon: null
    };

    const result = assignWards(input);
    const wardMap = new Map(result.wards.map(w => [w.cellId, w.kind]));

    expect(wardMap.get(0)).toBe("market");
    expect(wardMap.get(1)).toBe("cathedral");

    // Must have a cemetery placed
    const cemeteryCell = result.wards.find(w => w.kind === "cemetery");
    expect(cemeteryCell).toBeDefined();

    // In particular, south neighbor (cell 2) or east neighbor (cell 4) should be favored
    expect([2, 4]).toContain(cemeteryCell?.cellId);
  });
});
