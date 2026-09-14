import { describe, expect, it } from "vitest";
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import {
  findOffRoadLandPath,
  findWarRouteCells,
  generateWarRouteSvgPath,
  getWarRouteCoordinates
} from "./warRouteFinder";

describe("warRouteFinder", () => {
  const mockPack: PackedGraph = {
    cells: {
      i: [0, 1, 2, 3],
      h: [20, 25, 25, 10], // 0, 1, 2 land; 3 ocean
      p: [
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0]
      ],
      c: [[1], [0, 2], [1, 3], [2]],
      routes: {}
    } as any,
    burgs: [
      { i: 1, name: "Burg 1", cell: 0, x: 0, y: 0 } as Burg,
      { i: 2, name: "Burg 2", cell: 2, x: 20, y: 0 } as Burg
    ]
  } as unknown as PackedGraph;

  it("finds off-road land path avoiding water", () => {
    const path = findOffRoadLandPath(mockPack, 0, 2);
    expect(path).toEqual([0, 1, 2]);
  });

  it("finds war route cells using land path fallback", () => {
    const cells = findWarRouteCells(mockPack, 1, 2);
    expect(cells).toEqual([0, 1, 2]);
  });

  it("gets war route coordinates snapped to burg positions", () => {
    const coords = getWarRouteCoordinates(mockPack, 1, 2);
    expect(coords).toHaveLength(3);
    expect(coords[0]).toEqual([0, 0]);
    expect(coords[2]).toEqual([20, 0]);
  });

  it("generates valid SVG path string", () => {
    const points: [number, number][] = [
      [0, 0],
      [10, 5],
      [20, 0]
    ];
    const path = generateWarRouteSvgPath(points);
    expect(path).toContain("M0,0");
    expect(path).toContain("C");
  });

  it("avoids high alpine mountain peaks (Alps crossing) when lower elevation pass exists", () => {
    // 0 (start) -> 1 (pass, h: 25) vs 2 (alpine peak, h: 80) -> 3 (end)
    const alpinePack: PackedGraph = {
      cells: {
        i: [0, 1, 2, 3],
        h: [25, 25, 80, 25], // Cell 2 is high alpine peak
        p: [
          [0, 0],
          [10, 5], // slightly longer pass
          [10, 0], // direct straight line over high mountain
          [20, 0]
        ],
        c: [
          [1, 2], // from 0 can go to 1 or 2
          [0, 3], // from 1 to 3
          [0, 3], // from 2 to 3
          [1, 2]
        ]
      }
    } as unknown as PackedGraph;

    const path = findOffRoadLandPath(alpinePack, 0, 3);
    // Should take pass [0, 1, 3] instead of scaling the 80-altitude mountain peak [0, 2, 3]
    expect(path).toEqual([0, 1, 3]);
  });

  it("avoids trespassing through third-party country cells", () => {
    // 0 (State 1) -> 1 (State 3 - neutral) vs 2 (State 1 corridor) -> 3 (State 2)
    const territoryPack: PackedGraph = {
      cells: {
        i: [0, 1, 2, 3],
        h: [25, 25, 25, 25],
        p: [
          [0, 0],
          [10, 0], // direct through third party
          [10, 10], // detour through own corridor
          [20, 0]
        ],
        c: [
          [1, 2],
          [0, 3],
          [0, 3],
          [1, 2]
        ],
        state: [1, 3, 1, 2] // Cell 1 is State 3 (unrelated third party)
      }
    } as unknown as PackedGraph;

    const allowed = new Set([1, 2]);
    const path = findOffRoadLandPath(territoryPack, 0, 3, allowed);
    // Should avoid State 3 (cell 1) and detour through allowed state (cell 2)
    expect(path).toEqual([0, 2, 3]);
  });

  describe("naval expedition routing", () => {
    // Layout:
    // Cell 0: Inland river port burg (h: 25, r: 1, f: 1)
    // Cell 1: River mouth land cell (h: 22, r: 1, f: 1)
    // Cell 2: Ocean water cell (h: 10, f: 1)
    // Cell 3: Ocean water cell (h: 8, f: 1)
    // Cell 4: Coastal destination port burg (h: 20, haven: 3, f: 1)
    const navalPack: PackedGraph = {
      cells: {
        i: [0, 1, 2, 3, 4],
        h: [25, 22, 10, 8, 20],
        f: [1, 1, 1, 1, 1],
        r: [1, 1, 0, 0, 0],
        haven: [0, 2, 0, 0, 3],
        p: [
          [0, 0],
          [10, 0],
          [20, 0],
          [30, 0],
          [40, 0]
        ],
        c: [
          [1], // 0 -> 1
          [0, 2], // 1 -> 0, 2
          [1, 3], // 2 -> 1, 3
          [2, 4], // 3 -> 2, 4
          [3] // 4 -> 3
        ]
      } as any,
      burgs: [
        { i: 10, name: "Inland Port", cell: 0, x: 0, y: 0, port: 1 } as Burg,
        { i: 20, name: "Coastal Port", cell: 4, x: 40, y: 0, port: 1 } as Burg
      ],
      routes: []
    } as unknown as PackedGraph;

    it("finds naval expedition route starting from inland river port navigating out to sea", () => {
      const route = findWarRouteCells(navalPack, 10, 20, "naval_expedition");
      expect(route).toEqual([0, 1, 2, 3, 4]);
    });

    it("returns null for naval expedition between disconnected water bodies without land fallback", () => {
      // Create disconnected pack where destination port is on feature 2 (lake)
      const disconnectedPack: PackedGraph = {
        ...navalPack,
        cells: {
          ...navalPack.cells,
          f: [1, 1, 1, 2, 2] // Cell 3, 4 on feature 2
        } as any
      } as unknown as PackedGraph;

      const route = findWarRouteCells(disconnectedPack, 10, 20, "naval_expedition");
      expect(route).toBeNull();
    });
  });
});
