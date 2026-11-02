import { describe, expect, it } from "vitest";
import { fieldFromParts } from "./conform";
import { STEEP_BUILDING_SLOPE, UNBUILDABLE_SLOPE } from "./constants";
import { fieldPoint, sampleField } from "./sample";
import { domeBuildableShare, domeTemplateSize, templateParts } from "./templates";

describe("dome template", () => {
  it("is a spherical cap that is highest at the centre and level at the rim", () => {
    const extent = 1200;
    const size = domeTemplateSize(extent);
    const field = fieldFromParts(extent, 10, templateParts("dome", 1, extent));
    const center = sampleField(field, [0, 0]);
    const rim = sampleField(field, [size.radiusMeters, 0]);
    const outside = sampleField(field, [size.radiusMeters + 30, 0]);
    expect(center).toBeCloseTo(4 + size.heightMeters, 1);
    expect(rim).toBeCloseTo(4, 1);
    expect(outside).toBeCloseTo(4, 1);
    expect(center).toBeGreaterThan(sampleField(field, [size.radiusMeters / 2, 0]));
  });

  it("keeps the whole 1,200 m dome under the unbuildable slope, and most of it under the steep limit", () => {
    const size = domeTemplateSize(1200);
    expect(domeBuildableShare(size.radiusMeters, size.heightMeters, UNBUILDABLE_SLOPE)).toBe(1);
    const gentle = domeBuildableShare(size.radiusMeters, size.heightMeters, STEEP_BUILDING_SLOPE);
    expect(gentle).toBeGreaterThan(0.7);
    expect(gentle).toBeLessThan(0.75);
    const field = fieldFromParts(1200, 20, templateParts("dome", 1, 1200));
    let steep = 0;
    let samples = 0;
    for (let row = 0; row < field.rows; row++)
      for (let column = 0; column < field.columns; column++) {
        const point = fieldPoint(field, column, row);
        if (Math.hypot(point[0], point[1]) > size.radiusMeters) continue;
        samples++;
        const step = field.sampleMeters;
        const slope = Math.hypot(
          (sampleField(field, [point[0] + step, point[1]]) - sampleField(field, [point[0] - step, point[1]])) /
            (2 * step),
          (sampleField(field, [point[0], point[1] + step]) - sampleField(field, [point[0], point[1] - step])) /
            (2 * step)
        );
        if (slope <= STEEP_BUILDING_SLOPE) steep++;
      }
    expect(steep / samples).toBeGreaterThan(0.65);
  });
});
