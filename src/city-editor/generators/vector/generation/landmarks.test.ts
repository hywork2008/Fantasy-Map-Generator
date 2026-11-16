import { describe, expect, it } from "vitest";
import goth from "../../../data/fixtures/gothengsfeld-20261012.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import { windmillFacingRadians } from "../../aerialLandmarks";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { validateVectorOpenLandmarks, windmillSweep } from "../landmark";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";

describe("windmills and the gallows beyond the town (feature parity P6f)", () => {
  it("raises the economy's windmills into the prevailing wind and the gallows beside an approach, clear of the town", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor;
    d.economy = { ...d.economy!, mills: { wind: 3, water: 0 } };
    d.climate = { ...d.climate, prevailingWindDeg: 90 };
    d.burg.population = Math.max(d.burg.population, 6000);
    const input = vectorInputFromDescriptor(d),
      town = input.site!.domain,
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed: "w1" }).document,
      marks = skeleton.environment!.landmarks!;
    expect(validateVectorOpenLandmarks(skeleton)).toEqual([]);
    expect(marks.windmills).toHaveLength(3);
    expect(marks.gallows).toHaveLength(1);
    for (const mill of marks.windmills) expect(mill.facing).toBeCloseTo(windmillFacingRadians(90));
    const roads = Object.values(skeleton.paths)
      .filter(p => p.role === "road")
      .map(pathSurface);
    for (const mill of marks.windmills) {
      const ring = [{ outer: windmillSweep(mill), holes: [] }];
      expect(regionBoolean(ring, town, "intersection").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(1e-3);
      expect(regionBoolean(ring, roads, "intersection").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(1e-3);
    }
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: d.burg.population });
    expect(city.environment?.landmarks).toEqual(marks);
  });
});
