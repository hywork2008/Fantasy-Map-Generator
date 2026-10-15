import { expect, it } from "vitest";
import type { Point } from "../types/document";
import { nearestOnPolyline } from "./geom";
import { NearbyPolylineIndex } from "./nearbyPolylineIndex";

it("retains every reachable route in original order, including long, repeated and degenerate segments", () => {
  const routes = Array.from({ length: 200 }, (_, i) => ({
    points: [
      [i - 100, -100],
      [i - 100, 100],
      [i - 100, 100],
      [100, i]
    ] as Point[]
  }));
  routes.push({ points: [] }, { points: [[0, 0]] });
  const index = new NearbyPolylineIndex(routes);
  for (const radius of [0, 12, 45]) {
    for (const point of [
      [0, 0],
      [-100, 0],
      [112, 0],
      [0, -112],
      [300, 300]
    ] as Point[]) {
      const exact = (route: (typeof routes)[number]) => nearestOnPolyline(point, route.points).dist <= radius;
      const candidates = index.query(point, radius);
      expect(candidates.filter(exact)).toEqual(routes.filter(exact));
      expect(new Set(candidates).size).toBe(candidates.length);
    }
  }
  expect(index.query([300, 300], 12)).toEqual([]);
});
