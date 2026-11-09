import { describe, expect, it } from "vitest";
import goth from "../../../data/fixtures/gothengsfeld-20261012.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import { nearestOnPolyline, polygonArea, polygonCentroid } from "../../geom";
import { cellHouseCount, cellHouseRing } from "../fabric/pack";
import { samplePath } from "../geometry/sampling";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { vectorApproachBands } from "./suburbs";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";

describe("roadside ribbon beyond the wall (feature parity P7a)", () => {
  it("keeps only modest houses along the approaches, past the glacis and within the band", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor;
    d.burg.shanty = false;
    const skeleton = generateVectorSkeleton(vectorInputFromDescriptor(d), {
        ...DEFAULT_VECTOR_GENERATION,
        seed: "p",
        wall: "ellipse"
      }).document,
      city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: d.burg.population }),
      { bands } = vectorApproachBands(city),
      wall = samplePath(city.paths["auto-wall"]).map(s => s.point);
    expect(bands.length).toBeGreaterThan(0);
    let outside = 0;
    for (const cell of Object.values(city.fabric!.cells)) {
      if (cell.inside) continue;
      for (let i = 0; i < cellHouseCount(cell); i++) {
        const ring = cellHouseRing(cell, i),
          c = polygonCentroid(ring),
          near = bands
            .map(b => ({
              b,
              d: nearestOnPolyline(c, b.points).dist,
              g: Math.hypot(c[0] - b.points[0][0], c[1] - b.points[0][1])
            }))
            .sort((x, y) => x.d - y.d)[0];
        outside++;
        expect(near.d).toBeLessThanOrEqual(20);
        expect(near.g).toBeGreaterThanOrEqual(near.b.clearance);
        expect(near.g).toBeLessThanOrEqual(near.b.clearance + near.b.length);
        expect(nearestOnPolyline(c, wall).dist).toBeGreaterThanOrEqual(near.b.clearance);
        expect(Math.abs(polygonArea(ring))).toBeLessThanOrEqual(220);
      }
    }
    expect(outside).toBeGreaterThan(0);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});
