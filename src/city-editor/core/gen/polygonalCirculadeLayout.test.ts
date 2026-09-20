import { describe, expect, it } from "vitest";
import { planPolygonalCirculadeLayout } from "./polygonalCirculadeLayout";

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

  it("is deterministic for identical seeds", () => {
    const a = planPolygonalCirculadeLayout([10, 20], "seed-123", 120, true, 16);
    const b = planPolygonalCirculadeLayout([10, 20], "seed-123", 120, true, 16);
    expect(a.outerBoundary).toEqual(b.outerBoundary);
    expect(a.throughRoad).toEqual(b.throughRoad);
  });
});
