import { describe, expect, it } from "vitest";
import { MIN_CITY_EXTERNAL_ROADS } from "../settlementExtent";
import { DEFAULT_SITE_CONFIG } from "./siteConfig";
import { synthSite } from "./synthSite";

describe("synthSite approach roads", () => {
  it("emits at least two land roads for city sites", () => {
    const configs = [
      { ...DEFAULT_SITE_CONFIG, coast: "none" as const, rivers: [] },
      { ...DEFAULT_SITE_CONFIG, coast: "none" as const, rivers: ["through" as const] },
      { ...DEFAULT_SITE_CONFIG, coast: "straight" as const, rivers: ["toCoast" as const] },
      { ...DEFAULT_SITE_CONFIG, coast: "bay" as const, rivers: [] }
    ];
    for (const config of configs) {
      const site = synthSite("smallCity", config, "roads-two", { extentMeters: 1200, cityRadiusMeters: 396 });
      const roads = site.roads.filter(road => road.group !== "searoutes");
      expect(roads.length, JSON.stringify(config)).toBeGreaterThanOrEqual(MIN_CITY_EXTERNAL_ROADS);
    }
  });
});
