import { expect, it } from "vitest";
import { aStar, type EdgeGraph } from "./edgeGraph";

it("reports a connected partial path to the closest reachable node when the goal is blocked", () => {
  const graph: EdgeGraph = {
    points: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0]
    ],
    adjacency: [
      [{ to: 1, w: 1 }],
      [
        { to: 0, w: 1 },
        { to: 2, w: 1 }
      ],
      [
        { to: 1, w: 1 },
        { to: 3, w: 1 }
      ],
      [{ to: 2, w: 1 }]
    ]
  };
  const reports: number[][][] = [];
  const cost = (a: number, b: number, w: number) => (a === 2 && b === 3 ? Infinity : w);
  expect(aStar(graph, 0, 3, cost, (path, reached) => reports.push([path, reached]))).toBeNull();
  expect(reports).toEqual([
    [
      [0, 1, 2],
      [0, 1, 2]
    ]
  ]);
  expect(
    aStar(graph, 0, 3, undefined, () => {
      throw new Error("successful route reported as failure");
    })
  ).toEqual([0, 1, 2, 3]);
});
