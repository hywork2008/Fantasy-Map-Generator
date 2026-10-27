import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readFmgArchive } from "../../scripts/lib/fmgArchiveReader";
import type { WorldContext } from "../context/worldContext";
import type { Route } from "../types/models";
import { routeRenderPoints } from "./routeRenderGeometry";

const road = (points: Route["points"], extra: Partial<Route> = {}) =>
  ({ i: 1, group: "trails", points, ...extra }) as Route;

function fixture(fixed: Route, branch: Route) {
  return {
    pack: {
      cells: {
        p: [
          [0, 0],
          [10, 0],
          [20, 0]
        ],
        h: [25, 25, 25],
        c: [[], [], []]
      },
      burgs: [],
      routes: [fixed, branch]
    }
  } as unknown as WorldContext;
}

describe("land junctions with engineered routes", () => {
  it.each(["fixedSettlementApproach", "riverRoadConvergence"] as const)(
    "preserves a branch joining a %s road away from the cell center",
    flag => {
      const points: Route["points"] = [
        [-10, 4, 0],
        [12, 4, 1],
        [30, 4, 2]
      ];
      const fixed = road(
        points,
        flag === "fixedSettlementApproach"
          ? { fixedSettlementApproach: true }
          : { riverRoadConvergence: { originalPoints: points, pointsKey: JSON.stringify(points), burgIds: [1] } }
      );
      const branch = road([
        [12, 4, 1],
        [24, 8, 2]
      ]);
      const world = fixture(fixed, branch);
      const before = structuredClone(world.pack.routes);
      expect(routeRenderPoints(world, branch, "km")).toEqual([
        [12, 4, 1],
        [20, 0, 2]
      ]);
      expect(routeRenderPoints(world, fixed, "km")).toBe(points);
      expect(world.pack.routes).toEqual(before);
    }
  );

  it("retains distinct shared bridge points within one cell when collapsing legacy midpoints", () => {
    const fixed = road(
      [
        [10, 4, 1],
        [11, 4, 1],
        [20, 0, 2]
      ],
      { fixedSettlementApproach: true }
    );
    const branch = road([
      [0, 0, 0],
      [10, 0, 1],
      [10, 4, 1],
      [11, 4, 1],
      [10, 0, 1]
    ]);
    const world = fixture(fixed, branch);
    expect(routeRenderPoints(world, branch, "km")).toEqual([
      [0, 0, 0],
      [10, 4, 1],
      [11, 4, 1]
    ]);
  });

  it("keeps ordinary roads snapped when only the cell, or a sea lane, is shared", () => {
    const fixed = road(
      [
        [12, 4, 1],
        [20, 0, 2]
      ],
      { fixedSettlementApproach: true }
    );
    const branch = road([
      [11, 3, 1],
      [24, 8, 2]
    ]);
    const world = fixture(fixed, branch);
    world.pack.routes.push(
      road(
        [
          [11, 3, 1],
          [24, 8, 2]
        ],
        { group: "searoutes", fixedSettlementApproach: true }
      )
    );
    expect(routeRenderPoints(world, branch, "km")).toEqual([
      [10, 0, 1],
      [20, 0, 2]
    ]);
  });
});

const archive = resolve(import.meta.dirname, "../../temp/000.savdata/Nidyia_2026-10-26-13-17.fmg");
it.skipIf(!existsSync(archive))(
  "renders all five reported Nidyia branch endpoints at their saved junctions",
  async () => {
    const saved = await readFmgArchive(archive);
    const world = saved.world as unknown as WorldContext;
    const before = JSON.stringify(world.pack.routes);
    for (const [branchId, mainId, cell] of [
      [161, 147, 653],
      [157, 147, 945],
      [337, 336, 2723],
      [186, 185, 457],
      [287, 76, 2150]
    ]) {
      const branch = world.pack.routes.find(r => r.i === branchId)!;
      const main = world.pack.routes.find(r => r.i === mainId)!;
      const junction = branch.points.find(p => p[2] === cell)!;
      expect(main.points).toContainEqual(junction);
      const rendered = routeRenderPoints(world, branch, "km");
      expect([rendered[0], rendered.at(-1)]).toContainEqual(junction);
      expect(routeRenderPoints(world, main, "km")).toContainEqual(junction);
    }
    expect(JSON.stringify(world.pack.routes)).toBe(before);
  }
);
