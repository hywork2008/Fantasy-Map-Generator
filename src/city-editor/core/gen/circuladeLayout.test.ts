import { describe, expect, it } from "vitest";
import { planCirculadeLayout } from "./circuladeLayout";

describe("planCirculadeLayout", () => {
  it("creates a Bram circulade plan with core plaza, temple, concentric ring roads, and radial roads", () => {
    const plan = planCirculadeLayout([0, 0], 180, "test-bram-seed", true);
    expect(plan.plaza).toBeDefined();
    expect(plan.plaza.polygon.length).toBe(4);
    expect(plan.temple).toBeDefined();
    expect(plan.shapes.length).toBeGreaterThanOrEqual(2);
    expect(plan.ringRoads.length).toBeGreaterThanOrEqual(2);
    expect(plan.radialRoads.length).toBeGreaterThanOrEqual(3);
    expect(plan.throughRoad.length).toBe(3);
    expect(plan.recommendedGates.length).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic given the same seed", () => {
    const a = planCirculadeLayout([0, 0], 180, "seed-123", true);
    const b = planCirculadeLayout([0, 0], 180, "seed-123", true);
    expect(a.plaza.polygon).toEqual(b.plaza.polygon);
    expect(a.shapes).toEqual(b.shapes);
  });
});
