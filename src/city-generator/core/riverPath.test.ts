import { describe, expect, it } from "vitest";
import { buildEdgeGraph } from "./edgeGraph";
import { nearestOnPolyline } from "./geom";
import { buildGrid } from "./grid";
import { makeRng } from "./prng";
import { routeRiverAlongEdges } from "./riverPath";
import type { CityParams, Point } from "./types";

const PARAMS: CityParams = {
  seed: "river-edges",
  extentMeters: 3000,
  cityRadiusMeters: 500,
  cellSizeMeters: 55,
  lloydPasses: 3
};

function fixture() {
  const cells = buildGrid(PARAMS, makeRng(PARAMS.seed)).at(-1)?.cells ?? [];
  const graph = buildEdgeGraph(cells);
  // A straight west→east centerline through the origin, endpoints outside the window.
  const centerline: Point[] = Array.from({ length: 21 }, (_, i) => [-1950 + (i * 3900) / 20, 0]);
  const widths = centerline.map(() => 14);
  return { cells, graph, centerline, widths };
}

describe("routeRiverAlongEdges", () => {
  it("routes the river as a chain of real cell edges (not the raw centerline)", () => {
    const { graph, centerline, widths } = fixture();
    const routed = routeRiverAlongEdges(graph, centerline, widths, PARAMS.cellSizeMeters);

    expect(routed.fallback).toBe(false);
    expect(routed.edgePoints.length).toBeGreaterThan(8);

    // Every routed vertex is a graph node...
    const nodeKey = new Set(graph.points.map(p => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`));
    for (const p of routed.edgePoints) {
      expect(nodeKey.has(`${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`)).toBe(true);
    }

    // ...and every consecutive pair is a real graph edge.
    const index = new Map(graph.points.map((p, i) => [`${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`, i]));
    for (let i = 0; i < routed.edgePoints.length - 1; i++) {
      const a = index.get(`${Math.round(routed.edgePoints[i][0] * 20)},${Math.round(routed.edgePoints[i][1] * 20)}`);
      const b = index.get(
        `${Math.round(routed.edgePoints[i + 1][0] * 20)},${Math.round(routed.edgePoints[i + 1][1] * 20)}`
      );
      expect(a).toBeDefined();
      expect(graph.adjacency[a as number].some(e => e.to === b)).toBe(true);
    }
  });

  it("smooths the edge chain without pulling far off it, and follows the centerline", () => {
    const { graph, centerline, widths } = fixture();
    const routed = routeRiverAlongEdges(graph, centerline, widths, PARAMS.cellSizeMeters);

    expect(routed.smoothPoints).toHaveLength(routed.edgePoints.length);
    expect(routed.smoothPoints[0]).toEqual(routed.edgePoints[0]);
    expect(routed.smoothPoints.at(-1)).toEqual(routed.edgePoints.at(-1));

    const maxDrift = Math.max(
      ...routed.smoothPoints.map((p, i) => Math.hypot(p[0] - routed.edgePoints[i][0], p[1] - routed.edgePoints[i][1]))
    );
    expect(maxDrift).toBeLessThan(PARAMS.cellSizeMeters);

    const meanToCenterline =
      routed.edgePoints.reduce((sum, p) => sum + nearestOnPolyline(p, centerline).dist, 0) / routed.edgePoints.length;
    expect(meanToCenterline).toBeLessThan(PARAMS.cellSizeMeters * 1.5);
  });

  it("is deterministic and widths are resampled onto the routed vertices", () => {
    const { graph, centerline, widths } = fixture();
    const a = routeRiverAlongEdges(graph, centerline, widths, PARAMS.cellSizeMeters);
    const b = routeRiverAlongEdges(graph, centerline, widths, PARAMS.cellSizeMeters);
    expect(a.smoothPoints).toEqual(b.smoothPoints);
    expect(a.widths).toHaveLength(a.smoothPoints.length);
    expect(a.widths.every(w => w > 0 && Number.isFinite(w))).toBe(true);
  });
});
