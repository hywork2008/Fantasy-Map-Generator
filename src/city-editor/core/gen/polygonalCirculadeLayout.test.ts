import { describe, expect, it } from "vitest";
import {
  BRAM_NOMINAL_CORE_RADIUS_METERS,
  bramCoreRadiusForCity,
  bramPeripheryBufferMeters,
  bramRoadBanRadiusMeters,
  bramSpokeRadiusMeters,
  planPolygonalCirculadeLayout
} from "./polygonalCirculadeLayout";

describe("planPolygonalCirculadeLayout", () => {
  it("creates a 3-tier polygonal Bram circulade core plan", () => {
    const plan = planPolygonalCirculadeLayout([0, 0], "test-seed", 120, true, 16);

    expect(plan.numFacets).toBe(16);
    expect(plan.rings).toHaveLength(3);
    expect(plan.rings[0].vertices).toHaveLength(16);
    expect(plan.rings[2].vertices).toHaveLength(16);
    expect(plan.outerBoundary).toHaveLength(16);
    expect(plan.outerAnchorNodes).toHaveLength(16);

    // Plaza & temple
    expect(plan.plaza).toBeDefined();
    expect(plan.plaza.polygon).toHaveLength(4);
    expect(plan.temple).not.toBeNull();

    // Roads
    expect(plan.ringRoads).toHaveLength(3);
    expect(plan.throughRoad).toHaveLength(3);
    expect(plan.radialRoads).toHaveLength(4);
    expect(plan.recommendedGates).toHaveLength(2);

    // Radius checks
    const outerDist = Math.hypot(plan.outerBoundary[0][0], plan.outerBoundary[0][1]);
    expect(outerDist).toBeCloseTo(120, 0);
  });

  it("keeps the 120 m core on Tiny and larger maps and halves it on a Micro map", () => {
    expect(bramCoreRadiusForCity(600 * 0.33, true)).toBe(BRAM_NOMINAL_CORE_RADIUS_METERS);
    expect(bramCoreRadiusForCity(1200 * 0.33, true)).toBe(BRAM_NOMINAL_CORE_RADIUS_METERS);
    expect(bramCoreRadiusForCity(300 * 0.33, true)).toBeCloseTo(BRAM_NOMINAL_CORE_RADIUS_METERS / 2, 6);
    const microCore = bramCoreRadiusForCity(300 * 0.33, true);
    expect(bramRoadBanRadiusMeters(microCore)).toBeCloseTo(microCore - 2, 6);
    expect(bramSpokeRadiusMeters(BRAM_NOMINAL_CORE_RADIUS_METERS)).toBe(123);
    expect(bramPeripheryBufferMeters(BRAM_NOMINAL_CORE_RADIUS_METERS)).toBe(123.5);
    const plan = planPolygonalCirculadeLayout([0, 0], "micro-core", microCore, true, 16);
    expect(plan.rings[0].radius).toBeCloseTo((48 * microCore) / BRAM_NOMINAL_CORE_RADIUS_METERS, 5);
    expect(plan.rings[2].radius).toBeCloseTo(microCore, 5);
    expect(plan.temple?.radiusMeters).toBeCloseTo(8, 5);
    const outer = Math.hypot(plan.outerBoundary[0][0], plan.outerBoundary[0][1]);
    expect(outer).toBeCloseTo(microCore, 0);
  });

  it("is deterministic for identical seeds", () => {
    const a = planPolygonalCirculadeLayout([10, 20], "seed-123", 120, true, 16);
    const b = planPolygonalCirculadeLayout([10, 20], "seed-123", 120, true, 16);
    expect(a.outerBoundary).toEqual(b.outerBoundary);
    expect(a.throughRoad).toEqual(b.throughRoad);
  });
});
