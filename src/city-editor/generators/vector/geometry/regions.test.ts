import polygonClipping from "polygon-clipping";
import { afterEach, expect, it, vi } from "vitest";
import { regionArea, regionBoolean } from "./regions";
import { simpleContour } from "./surfaces";

afterEach(() => vi.restoreAllMocks());
it("removes zero-area boundary reversals returned by the clipping kernel", () => {
  vi.spyOn(polygonClipping, "difference").mockReturnValueOnce([
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [5, 10],
        [6, 10],
        [0, 10],
        [0, 0]
      ]
    ]
  ]);
  const input = [
    {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10]
      ] as [number, number][],
      holes: []
    }
  ];
  const before = structuredClone(input);
  const result = regionBoolean(input, [], "difference");
  expect(simpleContour(result[0].outer, true)).toBe(true);
  expect(regionArea(result[0])).toBeCloseTo(100, 8);
  expect(input).toEqual(before);
});
