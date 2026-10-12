import { describe, expect, it } from "vitest";
import type { Burg, Route } from "../types/models";
import { connectRelocatedBurg, planDetouredBurgApproaches, straightenBurgApproaches } from "./relocatedBurgRoutes";

const route = (points: Route["points"]) => ({ group: "trails", points: structuredClone(points) }) as Route;
const allDry = () => true;
const noneDry = () => false;

// Poilleneuzy (Triviers burg 40): a coast promotion moved the town 10 km east
// of its river site. Both roads then ran west through the old site, so the road
// from the south-east town entered City Editor from the west.
describe("relocated town approaches", () => {
  const before = { i: 40, cell: 1461, x: 988.58, y: 394.45 } as Burg;
  const after = { ...before, x: 990.99, y: 394.0 };
  const fromSouthEast: Route["points"] = [
    [998, 399.01, 1564],
    [992.95, 399.01, 1563],
    [988.6, 394.5, 1461],
    [988.58, 394.45, 1461]
  ];
  const fromWest: Route["points"] = [
    [980.8, 394, 1460],
    [988.58, 394.45, 1461]
  ];

  it("joins a leg that would double back through the old site straight to the new one", () => {
    const southEast = route(fromSouthEast);
    connectRelocatedBurg(southEast, before, after, allDry);
    expect(southEast.points).toEqual([...fromSouthEast.slice(0, 2), [990.99, 394.0, 1461]]);
    const west = route(fromWest);
    connectRelocatedBurg(west, before, after, allDry);
    expect(west.points).toEqual([...fromWest, [990.99, 394.0, 1461]]);
  });

  it("keeps the surveyed link through the old site when the direct link is not dry", () => {
    const southEast = route(fromSouthEast);
    connectRelocatedBurg(southEast, before, after, noneDry);
    expect(southEast.points).toEqual([...fromSouthEast, [990.99, 394.0, 1461]]);
  });

  it("never returns through an abandoned site, crossing as a cell route when nothing is dry", () => {
    const southEast = route(fromSouthEast);
    connectRelocatedBurg(southEast, before, after, noneDry, true);
    expect(southEast.points).toEqual([...fromSouthEast.slice(0, 2), [990.99, 394.0, 1461]]);
  });

  it("keeps ordinary in-cell bends that hold the leg's heading", () => {
    const town = { i: 1, cell: 5, x: 0, y: 0 } as Burg;
    const bent = route([
      [-10, 0, 4],
      [-2, 0.5, 5],
      [0, 0, 5]
    ]);
    expect(straightenBurgApproaches(bent, town, allDry)).toBe(false);
  });

  it("straightens saved detours, updating convergence geometry too", () => {
    const saved = route([...fromSouthEast, [990.99, 394.0, 1461]]);
    saved.riverRoadConvergence = { originalPoints: structuredClone(saved.points), pointsKey: "", burgIds: [40] };
    const plans = planDetouredBurgApproaches([saved], [undefined, { ...after } as Burg], allDry);
    expect(plans).toHaveLength(1);
    expect(plans[0].points).toEqual([...fromSouthEast.slice(0, 2), [990.99, 394.0, 1461]]);
    expect(plans[0].originalPoints).toEqual(plans[0].points);
    expect(saved.points).toHaveLength(5);
  });
});
