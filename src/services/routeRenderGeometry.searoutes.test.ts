import { expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { routeRenderPoints } from "./routeRenderGeometry";

it("extends a sea lane from its haven anchor to a waterfront-settled port", () => {
  const pack = {
    cells: { burg: [0, 1, 0, 2] },
    burgs: [{}, { i: 1, port: 1, x: 10, y: 20 }, { i: 2, port: 0, x: 40, y: 40 }]
  };
  const world = { pack } as unknown as WorldContext;
  const points = [
    [11, 21.5, 1],
    [20, 30, 2],
    [39, 41, 3]
  ];
  expect(routeRenderPoints(world, { group: "searoutes", points }, "km")).toEqual([[10, 20, 1], ...points]);
});
