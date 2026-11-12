import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { buildShare, decodeShare, encodeShare } from "../services/io/incomingCity";
import { buildBlockFabric } from "./blockInfill";
import { createGridDocument } from "./document";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { landmarkDwellingCapacity } from "./landmarkDwellings";
import { populationFacilityRequests } from "./populationFacilities";
import { defaultPopulationSettings } from "./populationPlan";
import { measureHousingCapacity, residentialCapacity } from "./residentialCapacity";

describe("population facilities in normal city generation", () => {
  it("maps the 5,000-person reference to 241 workshops and 9 halls, retaining dry-workshop dwellings and explicit provisional sites", () => {
    const settings = defaultGenerationSettings();
    settings.historicalPeriod = "highMedieval";
    settings.config.features.port = false;
    const { requests } = populationFacilityRequests(5000, settings);
    expect(requests).toHaveLength(250);
    expect(requests.filter(r => r.id.includes("guild:"))).toHaveLength(9);
    expect(requests.filter(r => r.asset.residentialDwellings === 1)).toHaveLength(155);
    expect(requests.find(r => r.id.includes("workshop:baking:"))!.asset.bvModel?.id).toBe(
      "trade-workshop.dedicated-bakehouse"
    );
    for (const r of requests) {
      expect(r.asset.referenceSizeMeters.every(n => n > 0)).toBe(true);
      if (!r.asset.bvModel) expect(r.asset.dimensionSource).toContain("Provisional");
      if (r.id.includes(":tanning:")) expect(r).toMatchObject({ zone: "outskirts", riverbankMaxDistanceMeters: 50 });
    }
  });
  it("preserves the opt-in mode in a shared generation recipe", () => {
    const settings = { ...defaultGenerationSettings(), facilityLayout: "population" as const };
    const share = buildShare({ seed: "facilities", grid: "hex", size: "small", settings });
    expect(decodeShare(encodeShare(share))?.settings.facilityLayout).toBe("population");
  });
  it("generates facilities without a separate button, saves its report, reproduces reservations and returns to legacy generation", () => {
    const settings = defaultGenerationSettings();
    settings.config.coast = "none";
    settings.config.rivers = [];
    settings.config.features = {
      walls: false,
      citadel: false,
      plaza: false,
      temple: false,
      port: false,
      shanty: false
    };
    settings.population = defaultPopulationSettings(1000);
    settings.historicalPeriod = "highMedieval";
    settings.layout = "organic";
    settings.buildingPattern = "medieval";
    const input = createGridDocument({ size: "small", grid: "hex", seed: "population-small" });
    const baseline = generateCityOnDocument(input, settings, "population-1000")!;
    expect(baseline).not.toBeNull();
    expect(baseline.facilityReport).toBeUndefined();
    const opts = { ...settings, facilityLayout: "population" as const };
    const city = generateCityOnDocument(input, opts, "population-1000")!;
    expect(city).not.toBeNull();
    expect(city.facilityReport?.required).toBe(47);
    expect(city.facilityReport!.placed).toBeGreaterThan(0);
    expect(city.facilityReport!.placed + city.facilityReport!.unplaced.length).toBe(47);
    const fabric = buildBlockFabric(city);
    const mixed = landmarkDwellingCapacity(city);
    const capacity = measureHousingCapacity(city, fabric.buildings, city.populationPlan!.requiredDwellings);
    expect(capacity.capacityInside + capacity.capacityOutside).toBe(
      fabric.buildings.reduce((n, b) => n + residentialCapacity(b), 0) + mixed.inside + mixed.outside
    );
    const loaded = parseDocument(serializeDocument(city))!;
    expect(loaded?.facilityReport).toEqual(city.facilityReport);
    const recipe = city.fabric!.generation!;
    const replay = generateCityOnDocument(recipe.input, recipe.settings, recipe.seed)!;
    expect(replay?.landmarks).toEqual(city.landmarks);
    const legacy = generateCityOnDocument(loaded, settings, "population-1000")!;
    expect(legacy).not.toBeNull();
    expect(legacy.facilityReport).toBeUndefined();
    expect(legacy.landmarks?.some(l => l.id.startsWith("population-facility:")) ?? false).toBe(false);
    expect(city.facilityReport!.placed).toBe(44);
    expect(city.facilityReport!.unplaced.every(r => r.reason === "river-required")).toBe(true);
    expect(city.facilityReport!.unplaced.every(r => r.id.includes(":tanning:"))).toBe(true);
  }, 30000);
});
