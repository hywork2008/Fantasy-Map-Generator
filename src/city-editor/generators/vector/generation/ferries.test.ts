import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG } from "../../site/siteConfig";
import { synthSite } from "../../site/synthSite";
import { ferryJetties, validateVectorFerries } from "../ferry";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";

describe("ferries on rivers no bridge of the period spans (feature parity P5b-4)", () => {
  it("ends each road on the town bank and crosses square to the river from a jetty", () => {
    const seed = "ferry",
      d = synthSite("smallTown", { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["through"] }, seed);
    // FMG's decision for the river: a ferry, as for a channel wider than the period's bridges.
    d.rivers[0].crossing = {
      kind: "ferry",
      widthMeters: d.rivers[0].widthMeters,
      depthMeters: 3,
      clearanceMeters: 4,
      openingMeters: 0,
      navigationRequired: true,
      reason: "tooWide"
    };
    const skeleton = generateVectorSkeleton(vectorInputFromDescriptor(d), {
        ...DEFAULT_VECTOR_GENERATION,
        seed
      }).document,
      ferries = Object.values(skeleton.environment?.ferries ?? {}),
      water = allVectorWater(skeleton);
    expect(ferries.length).toBeGreaterThan(0);
    expect(validateVectorFerries(skeleton)).toEqual([]);
    // No bridge on a ferry river, and no road runs into its water.
    expect(Object.keys(skeleton.connections.bridges)).toEqual([]);
    for (const road of Object.values(skeleton.paths).filter(p => p.role === "road"))
      expect(
        regionBoolean([pathSurface(road)], water, "intersection").reduce((n, r) => n + regionArea(r), 0)
      ).toBeLessThan(1e-3);
    for (const f of ferries) {
      // Each jetty runs from the bank out into the river.
      expect(regionBoolean(ferryJetties(f), water, "intersection").length).toBeGreaterThan(0);
    }
    const city = generateVectorUrban(skeleton, {
      ...DEFAULT_VECTOR_URBAN,
      population: d.burg.population,
      lotOccupancy: 1
    });
    expect(city.environment?.ferries).toEqual(skeleton.environment?.ferries);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});
