import { describe, expect, it } from "vitest";
import { createGridDocument } from "../document";
import { defaultGenerationSettings, generateStageOnDocument } from "../generate";
import { buildBlockFabric } from "./blockInfill";
import { planHarborShips } from "./harborShips";
import { DEFAULT_SITE_CONFIG } from "./site/siteConfig";
import { synthSite } from "./site/synthSite";

describe("FMG river port without clipped geometry", () => {
  it.each([40, 7000])("generates the river, harbour and piers for a %i m river without ocean berths", width => {
    const site = synthSite("smallTown", { ...DEFAULT_SITE_CONFIG, coast: "none" }, "river-port-fallback");
    site.burg.port = true;
    site.burg.walls = false;
    site.burg.waterAccess = {
      river: true,
      sea: false,
      lake: false,
      riverId: 42,
      seaFeatureIds: [],
      lakeFeatureIds: [],
      port: { river: true, sea: false, lake: false }
    };
    site.burg.riverPlacement = { riverId: 42, bank: "left", widthMeters: width };
    site.rivers = [];
    const source = createGridDocument({
      size: "small",
      grid: "evolution",
      seed: site.burg.seed,
      extentMeters: site.frame.extentMeters,
      cityRadiusMeters: site.frame.cityRadiusMeters
    });
    const settings = { ...defaultGenerationSettings(), descriptor: site };
    const city = generateStageOnDocument(source, settings, site.burg.seed, 6)!;
    expect(city).toBeTruthy();
    expect(city.featureGroups.some(g => g.kind === "river") || city.waterAreas?.some(a => a.kind === "river")).toBe(
      true
    );
    expect(city.elements.some(e => e.kind === "harbor")).toBe(true);
    city.buildingPattern = "medieval";
    const fabric = buildBlockFabric(city);
    expect(fabric.harbor?.piers.length).toBeGreaterThan(0);
    expect(fabric.harbor?.piers.every(p => p.reach! <= width / 4)).toBe(true);
    const ships = planHarborShips(city);
    expect(ships.length).toBeGreaterThan(0);
    expect(ships.every(ship => ship.shipType === "barge")).toBe(true);
  });
});
