import { describe, expect, it } from "vitest";
import { createDocument } from "../document";
import { buildPolygonalCirculadeFabric } from "./polygonalCirculadeFabric";
import { planPolygonalCirculadeLayout } from "./polygonalCirculadeLayout";

describe("buildPolygonalCirculadeFabric", () => {
  it("generates straight-edged row houses and lanes along polygonal facets", () => {
    const doc = createDocument("test-seed", 600);
    const plan = planPolygonalCirculadeLayout([0, 0], "test-seed", 120, true, 16);

    const fabric = buildPolygonalCirculadeFabric(doc, { seed: "test-seed", plan });

    expect(fabric.buildings.length).toBeGreaterThan(30);
    expect(fabric.lanes.length).toBeGreaterThan(10);

    // Each building should be a 4-point convex polygon
    for (const bldg of fabric.buildings) {
      expect(bldg.polygon).toHaveLength(4);
      expect(bldg.landmark).toBe(false);
    }
  });
});
