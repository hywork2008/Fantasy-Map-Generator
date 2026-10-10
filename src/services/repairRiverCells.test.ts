import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { burgsUnplacedOnRivers, removeRepeatedRiverCells } from "./repairRiverCells";

describe("removeRepeatedRiverCells", () => {
  it("drops a repeated lake cell with its point and reports the unplaced burg", () => {
    const world = {
      pack: {
        rivers: [
          {
            i: 19,
            cells: [1, 2, 3, 3, 4],
            points: [
              [0, 0],
              [1, 0],
              [2, 0],
              [2, 0],
              [3, 0]
            ]
          },
          { i: 20, cells: [5, 6] }
        ],
        burgs: [
          {},
          { i: 1, cell: 2, riverSiteStatus: { riverId: 19, status: "unresolved", reason: "invalid-curve" } },
          { i: 2, cell: 5, riverSiteStatus: { riverId: 20, status: "unresolved", reason: "invalid-curve" } }
        ],
        cells: { r: [0, 0, 19, 0, 0, 20, 20] }
      }
    } as unknown as WorldContext;
    const repaired = removeRepeatedRiverCells(world);
    expect([...repaired]).toEqual([19]);
    expect(world.pack.rivers[0].cells).toEqual([1, 2, 3, 4]);
    expect(world.pack.rivers[0].points).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0]
    ]);
    expect(burgsUnplacedOnRivers(world, repaired)).toEqual([1]);
  });
});
