import { describe, expect, it } from "vitest";
import goth from "../../../data/fixtures/gothengsfeld-20261012.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { validateVectorGuilds } from "../guild";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";

const area = (polygon: [number, number][], regions: { outer: [number, number][]; holes: [number, number][][] }[]) =>
  regionBoolean([{ outer: polygon, holes: [] }], regions, "intersection").reduce((n, r) => n + regionArea(r), 0);

describe("guild halls and yards from an FMG town's economy (feature parity P6d)", () => {
  it("builds each chapter's hall in the town and its yards outside it, clear of the roads", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor;
    d.historicalPeriod = "lateMedieval";
    d.economy!.guilds = (["textiles", "metallurgy", "masonry", "woodworking"] as const).map(domain => ({
      domain,
      status: "chapter" as const,
      practitioners: 20,
      prestige: 0.8,
      foundedYear: null
    }));
    const input = vectorInputFromDescriptor(d),
      town = input.site!.domain,
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed: "g1" }).document,
      guilds = skeleton.environment!.guilds!;
    expect(validateVectorGuilds(skeleton)).toEqual([]);
    expect(guilds.halls.map(h => h.domain).sort()).toEqual(["masonry", "metallurgy", "textiles", "woodworking"]);
    // A prestigious cloth guild raises a belfry.
    expect(guilds.halls.find(h => h.domain === "textiles")?.tower).toBeDefined();
    expect(guilds.yards.map(y => y.kind).sort()).toEqual(["limeKiln", "smithyYard", "stoneYard", "timberYard"]);
    const roads = Object.values(skeleton.paths)
      .filter(p => p.role === "road")
      .map(pathSurface);
    for (const hall of guilds.halls) {
      expect(area(hall.footprint, town)).toBeGreaterThan(0);
      expect(area(hall.footprint, roads)).toBeLessThan(1e-3);
    }
    // Yards stand beyond the town the site was given, which grows to take them.
    for (const yard of guilds.yards) {
      expect(area(yard.polygon, town)).toBeLessThan(1e-3);
      expect(area(yard.polygon, roads)).toBeLessThan(1e-3);
    }
    const city = generateVectorUrban(skeleton, {
      ...DEFAULT_VECTOR_URBAN,
      population: d.burg.population,
      lotOccupancy: 1
    });
    expect(city.environment?.guilds).toEqual(guilds);
  });
});
