import { describe, expect, it } from "vitest";
import goth from "../../../data/fixtures/gothengsfeld-20261012.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { validateVectorInns } from "../inn";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";

describe("inns on the busiest approach (feature parity P6e)", () => {
  it("lays the caravanserai then the inn beside the busiest road, beyond the town and clear of it", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor;
    d.roads.forEach((r, i) => {
      r.traffic = i + 1;
    });
    d.economy!.facilities = [
      { kind: "inn", count: 1, scale: 1, stableSpaces: 12 },
      { kind: "caravanserai", count: 1, scale: 1, stableSpaces: 20 }
    ];
    const input = vectorInputFromDescriptor(d),
      town = input.site!.domain,
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed: "i1" }).document,
      inns = skeleton.environment!.inns!;
    expect(validateVectorInns(skeleton)).toEqual([]);
    // The largest yard first, as the mesh editor orders them.
    expect(inns.map(i => i.kind)).toEqual(["caravanserai", "inn"]);
    const roads = Object.values(skeleton.paths)
      .filter(p => p.role === "road")
      .map(pathSurface);
    for (const inn of inns) {
      const ring = [{ outer: inn.footprint, holes: [] }];
      expect(regionBoolean(ring, town, "intersection").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(1e-3);
      expect(regionBoolean(ring, roads, "intersection").reduce((n, r) => n + regionArea(r), 0)).toBeLessThan(1e-3);
    }
    const city = generateVectorUrban(skeleton, {
      ...DEFAULT_VECTOR_URBAN,
      population: d.burg.population,
      lotOccupancy: 1
    });
    expect(city.environment?.inns).toEqual(inns);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});
