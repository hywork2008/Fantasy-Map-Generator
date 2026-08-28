import { describe, expect, it } from "vitest";
import { buildEdgeGraph } from "./edgeGraph";
import { nearestOnPolyline, pointInPolygon } from "./geom";
import { buildGrid } from "./grid";
import { makeRng } from "./prng";
import { walkRiver } from "./riverPath";
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
  // A rough west→east corridor through the origin.
  const corridor: Point[] = [
    [-1700, 0],
    [0, 0],
    [1700, 0]
  ];
  const widths = [8, 12, 18];
  return { cells, graph, corridor, widths };
}

const keyOf = (p: Point): string => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`;

describe("walkRiver", () => {
  it("walks the river as a chain of real cell edges", () => {
    const { graph, corridor, widths } = fixture();
    const river = walkRiver(graph, corridor, widths, null, null, PARAMS.cellSizeMeters, 1500, makeRng("w1"));

    expect(river.fallback).toBe(false);
    expect(river.edgePoints.length).toBeGreaterThan(8);

    const index = new Map(graph.points.map((p, i) => [keyOf(p), i]));
    for (let i = 0; i < river.edgePoints.length - 1; i++) {
      const a = index.get(keyOf(river.edgePoints[i]));
      const b = index.get(keyOf(river.edgePoints[i + 1]));
      expect(a).toBeDefined();
      expect(graph.adjacency[a as number].some(e => e.to === b)).toBe(true);
    }
  });

  it("smooths the chain, keeps it near the corridor, and runs it to the map edge", () => {
    const { graph, corridor, widths } = fixture();
    const river = walkRiver(graph, corridor, widths, null, null, PARAMS.cellSizeMeters, 1500, makeRng("w1"));

    // Landlocked: the drawn centreline is the smoothed graph chain, with each end
    // finalised so it reaches the map edge (within ~1 cell — the "resolved" band).
    const HALF = 1500;
    const edgeGap = (p: readonly number[]): number => Math.min(HALF - Math.abs(p[0]), HALF - Math.abs(p[1]));
    expect(edgeGap(river.smoothPoints[0])).toBeLessThan(PARAMS.cellSizeMeters * 1.6);
    expect(edgeGap(river.smoothPoints[river.smoothPoints.length - 1])).toBeLessThan(PARAMS.cellSizeMeters * 1.6);
    expect(river.smoothPoints.length).toBeGreaterThanOrEqual(river.edgePoints.length);

    // Smoothing and the edge extension never pull the centreline far off the corridor.
    const maxToCorridor = Math.max(...river.smoothPoints.map(p => nearestOnPolyline(p, corridor).dist));
    expect(maxToCorridor).toBeLessThan(PARAMS.cellSizeMeters * 3);

    const meanToCorridor =
      river.edgePoints.reduce((s, p) => s + nearestOnPolyline(p, corridor).dist, 0) / river.edgePoints.length;
    expect(meanToCorridor).toBeLessThan(PARAMS.cityRadiusMeters * 0.6);
  });

  it("branching scatters the route: different seeds diverge", () => {
    const { graph, corridor, widths } = fixture();
    const a = walkRiver(graph, corridor, widths, null, null, PARAMS.cellSizeMeters, 1500, makeRng("seed-a"));
    const b = walkRiver(graph, corridor, widths, null, null, PARAMS.cellSizeMeters, 1500, makeRng("seed-b"));
    expect(JSON.stringify(a.edgePoints)).not.toEqual(JSON.stringify(b.edgePoints));
    // ...but the same seed is reproducible
    const a2 = walkRiver(graph, corridor, widths, null, null, PARAMS.cellSizeMeters, 1500, makeRng("seed-a"));
    expect(a2.edgePoints).toEqual(a.edgePoints);
  });

  it("reaches the sea and stops at the edge (only the mouth is wet)", () => {
    const { graph, corridor, widths } = fixture();
    // Water = the eastern half of the window; shoreline = the line x = 400.
    const waterPolygon: Point[] = [
      [400, -1500],
      [1500, -1500],
      [1500, 1500],
      [400, 1500]
    ];
    const shoreline: Point[] = [
      [400, -1500],
      [400, 1500]
    ];
    const river = walkRiver(
      graph,
      corridor,
      widths,
      waterPolygon,
      shoreline,
      PARAMS.cellSizeMeters,
      1500,
      makeRng("w1")
    );
    // reaches the water — the mouth is at/just past the shoreline
    expect(river.edgePoints.at(-1)?.[0]).toBeGreaterThan(400 - PARAMS.cellSizeMeters * 2);
    // ...but only the mouth is wet; nothing runs out across the open sea
    const wet = river.edgePoints.filter(p => pointInPolygon(p, waterPolygon));
    expect(wet.length).toBeLessThanOrEqual(1);
  });

  it("widths are resampled onto the walked vertices", () => {
    const { graph, corridor, widths } = fixture();
    const river = walkRiver(graph, corridor, widths, null, null, PARAMS.cellSizeMeters, 1500, makeRng("w1"));
    expect(river.widths).toHaveLength(river.smoothPoints.length);
    expect(river.widths.every(w => w > 0 && Number.isFinite(w))).toBe(true);
  });
});
