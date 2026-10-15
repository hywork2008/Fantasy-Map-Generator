import { describe, expect, it } from "vitest";
import { createUrbanMorphology, validUrbanMorphology } from "../../utils/urbanMorphology";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { buildShare, decodeShare, encodeShare } from "../services/io/incomingCity";
import { cityEditorDocument } from "../services/io/shareRequest";
import { buildBlockFabric } from "./blockInfill";
import { bridgeDecks, overSkewedBridgeDecks } from "./bridgeDeck";
import { createGridDocument } from "./document";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { polygonCentroid } from "./geom";
import { FabricCache } from "./localInfill";
import { preparePopulationGeneration } from "./populationGeneration";
import { fitPopulationHousing } from "./populationHousingFit";
import {
  defaultPopulationSettings,
  planPopulation,
  validPopulationPlan,
  validPopulationSettings
} from "./populationPlan";
import { measureHousingCapacity, residentialCapacity } from "./residentialCapacity";
import { synthSite } from "./site/synthSite";

describe("population-driven city generation", () => {
  it("plans 150,000 people at real metre scale", () => {
    const p = planPopulation(defaultPopulationSettings(150000));
    expect(p.requiredDwellings).toBe(33334);
    expect(p.estimatedBuildings).toBe(13334);
    expect(p.extentMeters).toBe(4800);
    expect(p.cellWidthMeters).toBe(50);
    expect(p.displayDwellings).toBe(20);
    expect(validPopulationPlan({ ...p, extentMeters: 3000 })).toBe(true);
    expect(validPopulationPlan({ ...p, extentMeters: 2700 })).toBe(false);
    expect(p.targetAreaM2).toBeCloseTo(3950814.815);
  });
  it("defaults to 15,000 and supports the 220,000 population limit", () => {
    expect(defaultPopulationSettings().targetPopulation).toBe(15000);
    const settings = defaultPopulationSettings(220000);
    expect(validPopulationSettings(settings)).toBe(true);
    const plan = planPopulation(settings);
    expect(plan.requiredDwellings).toBe(48889);
    expect(validPopulationPlan(plan)).toBe(true);
  });
  it("rejects malformed inputs and insufficient frames", () => {
    for (const n of [0, -1, 1.5, NaN, Infinity, 220001])
      expect(validPopulationSettings(defaultPopulationSettings(n))).toBe(false);
    expect(() =>
      planPopulation({ ...defaultPopulationSettings(150000), frameMode: "manual" }, "lateMedieval", 1200)
    ).toThrow();
    expect(() => planPopulation(defaultPopulationSettings(), "steamEra")).toThrow();
  });
  it("preserves area and resolution between display modes", () => {
    const p = planPopulation(defaultPopulationSettings(150000));
    const q = planPopulation({ ...p.settings, housingDisplay: "detailed" });
    expect(q.targetAreaM2).toBe(p.targetAreaM2);
    expect(q.cellWidthMeters).toBe(p.cellWidthMeters);
  });
  it.each([1, 4, 5, 3000])("generates a small standalone population of %i", population => {
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
    settings.population = defaultPopulationSettings(population);
    settings.layout = "organic";
    const city = generateCityOnDocument(
      createGridDocument({
        size: "small",
        grid: "hex",
        seed: "population-small"
      }),
      settings,
      `population-${population}`
    );
    expect(city).not.toBeNull();
    expect(city!.populationReport!.targetPopulation).toBe(population);
    expect(city!.populationReport!.assignedPopulation + city!.populationReport!.unplacedPopulation).toBe(population);
  });
  it.each(["hex", "evolution"] as const)("supports a Paris population on %s", grid => {
    const settings = defaultGenerationSettings();
    settings.population = defaultPopulationSettings(150000);
    settings.layout = "organic";
    settings.config.coast = "none";
    settings.config.rivers = [];
    settings.config.features = {
      walls: true,
      citadel: false,
      plaza: true,
      temple: true,
      port: false,
      shanty: false
    };
    const city = generateCityOnDocument(
      createGridDocument({ size: "small", grid, seed: "paris-grid" }),
      settings,
      "paris-grid"
    );
    expect(city).not.toBeNull();
    expect(city!.populationReport!.assignedPopulation + city!.populationReport!.unplacedPopulation).toBe(150000);
    expect(city!.populationPlan!.housingFit!.pass).toBeLessThanOrEqual(3);
    expect(parseDocument(serializeDocument(city!))).not.toBeNull();
  });
  it("keeps bridges within the shared policy for a river city", () => {
    const settings = defaultGenerationSettings();
    settings.population = defaultPopulationSettings(150000);
    settings.layout = "organic";
    settings.config.coast = "none";
    settings.config.rivers = ["through"];
    settings.config.features = {
      walls: true,
      citadel: false,
      plaza: true,
      temple: true,
      port: false,
      shanty: false
    };
    const city = generateCityOnDocument(
      createGridDocument({
        size: "small",
        grid: "voronoi",
        seed: "paris-river"
      }),
      settings,
      "paris-river"
    );
    expect(city).not.toBeNull();
    const decks = bridgeDecks(city!);
    expect(overSkewedBridgeDecks(city!, undefined, decks)).toHaveLength(0);
    expect(city!.populationReport!.assignedPopulation + city!.populationReport!.unplacedPopulation).toBe(150000);
  });
  it("keeps imported population and CE overrides separate from FMG", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    const descriptor = synthSite("smallTown", settings.config, "population-import", {
      extentMeters: 2400,
      cityRadiusMeters: 300
    });
    descriptor.burg.population = 15000;
    descriptor.burg.dwellings = 3334;
    descriptor.urbanMorphology = createUrbanMorphology({
      seed: "population-import",
      burgId: 1,
      year: 341,
      population: 15000,
      capital: false,
      walls: true,
      polityAge: 178,
      generationYears: 30.5,
      polityPower: 0.5,
      defensePressure: 0.2,
      period: "lateMedieval",
      religious: false,
      extramuralBurial: false,
      plaza: false
    });
    settings.descriptor = descriptor;
    settings.population = { ...defaultPopulationSettings(3000), source: "fmg" };
    const input = createGridDocument({
      size: "medium",
      grid: "voronoi",
      seed: "population-import"
    });
    const imported = preparePopulationGeneration(input, settings, "population-import");
    // An unmodified FMG population keeps the FMG-linked generator untouched.
    expect(imported.document.populationPlan).toBeUndefined();
    expect(imported.settings.population).toBeUndefined();
    expect(imported.settings.descriptor).toBe(descriptor);
    settings.population = {
      ...defaultPopulationSettings(12000),
      source: "ce-override"
    };
    const override = preparePopulationGeneration(input, settings, "population-import");
    expect(override.settings.descriptor!.burg.population).toBe(12000);
    expect(descriptor.burg.population).toBe(15000);
    expect(descriptor.urbanMorphology.baselinePopulation).toBe(15000);
    expect(validUrbanMorphology(override.settings.descriptor!.urbanMorphology)).toBe(true);
    const share = buildShare({
      seed: "population-import",
      grid: "voronoi",
      size: "medium",
      settings,
      descriptor
    });
    expect(decodeShare(encodeShare(share))!.settings.population).toEqual(settings.population);
  });
  it("turns population generation off without retaining its derived state", () => {
    const input = createGridDocument({
      size: "small",
      seed: "population-legacy"
    });
    input.populationPlan = planPopulation(defaultPopulationSettings());
    const legacy = preparePopulationGeneration(input, defaultGenerationSettings(), "population-legacy").document;
    expect(legacy.populationPlan).toBeUndefined();
    expect(legacy.mesh).toBe(input.mesh);
    expect(input.populationPlan).toBeDefined();
    const share = buildShare({
      seed: "paris-population",
      grid: "voronoi",
      size: "large",
      settings: {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(150000)
      }
    });
    const planned = cityEditorDocument(share);
    expect(planned.populationPlan!.cellWidthMeters).toBe(50);
    expect(Object.keys(planned.mesh.faces).length).toBeLessThan(12000);
  });
  it("reports all unplaced residents after three bounded capacity passes", () => {
    const doc = createGridDocument({
      size: "tiny",
      grid: "hex",
      seed: "population-no-land"
    });
    doc.populationPlan = planPopulation(defaultPopulationSettings(3000));
    for (const face of Object.values(doc.mesh.faces)) {
      face.properties.water = "sea";
      face.properties.buildable = false;
    }
    let passes = 0;
    fitPopulationHousing(doc, new FabricCache(), () => passes++);
    expect(passes).toBe(3);
    expect(doc.populationReport!.unplacedPopulation).toBe(3000);
    expect(doc.populationReport!.reasons).toContain("population-capacity-adjustment-exhausted");
  });
  it("generates and accounts for a Paris-sized city", () => {
    const input = createGridDocument({
      size: "small",
      seed: "paris-population",
      grid: "voronoi"
    });
    const settings = defaultGenerationSettings();
    settings.config.coast = "none";
    settings.config.rivers = [];
    settings.config.features = {
      walls: true,
      citadel: false,
      plaza: true,
      temple: true,
      port: false,
      shanty: false
    };
    settings.population = defaultPopulationSettings(150000);
    settings.layout = "organic";
    const samples: unknown[] = [];
    const started = performance.now();
    const city = generateCityOnDocument(input, settings, "paris-population", s => samples.push(s));
    expect(city, JSON.stringify(samples)).not.toBeNull();
    expect(city!.populationPlan).toBeDefined();
    expect(city!.populationReport).toBeDefined();
    const report = city!.populationReport!;
    process.stdout.write(
      `${JSON.stringify({ populationBenchmark: true, ms: performance.now() - started, report, cells: Object.keys(city!.mesh.faces).length })}\n`
    );
    expect(report.assignedPopulation + report.unplacedPopulation).toBe(150000);
    const fabric = buildBlockFabric(city!);
    const housing = measureHousingCapacity(city!, fabric.buildings, 33334);
    expect(housing.assignedInside + housing.assignedOutside + housing.unplacedDwellings).toBe(33334);
    expect(city!.residentialClusters!.reduce((n, c) => n + c.assignedPopulation, 0) + report.unplacedPopulation).toBe(
      150000
    );
    expect(report.unplacedPopulation).toBe(0);
    // One group per built parcel at most; every core parcel is built out like the FMG fabric.
    expect(report.displayGroups).toBeLessThan(12000);
    expect(report.residentialFootprintM2).toBeGreaterThan(report.coreLandAreaM2 * 0.5);
    // Capacity must occupy the city, rather than stop after filling the first side of the mesh.
    const quadrants = [0, 0, 0, 0];
    for (const c of city!.residentialClusters!) {
      const [x, y] = polygonCentroid(c.polygon);
      quadrants[Number(x >= 0) + 2 * Number(y >= 0)] += c.assignedDwellings;
    }
    expect(Math.min(...quadrants)).toBeGreaterThan(33334 * 0.1);
    expect(report.outsideDevelopedAreaM2).toBe(0);
    const recipe = city!.fabric!.generation!;
    const replay = generateCityOnDocument(recipe.input, recipe.settings, recipe.seed);
    expect(replay!.populationReport).toEqual(report);
    expect(replay!.residentialClusters).toEqual(city!.residentialClusters);
    const saved = serializeDocument(city!);
    expect(parseDocument(saved)?.populationReport).toEqual(report);
    const bad = JSON.parse(saved);
    bad.populationPlan.settings.targetPopulation = -1;
    expect(parseDocument(JSON.stringify(bad))).toBeNull();
    const modes = ["detailed", "cluster-10"] as const;
    for (const mode of modes) {
      const variant = {
        ...city!,
        populationPlan: {
          ...city!.populationPlan!,
          displayDwellings: mode === "detailed" ? (1 as const) : (10 as const),
          settings: { ...city!.populationPlan!.settings, housingDisplay: mode }
        }
      };
      const variantFabric = buildBlockFabric(variant);
      const capacity = measureHousingCapacity(variant, variantFabric.buildings, 33334);
      if (mode === "detailed")
        for (const lot of variantFabric.buildings) {
          if (lot.residentialCluster)
            expect(residentialCapacity({ ...lot, residentialCluster: undefined })).toBe(
              lot.residentialCluster.capacityDwellings
            );
        }
      // Detailed housing is the ordinary fabric; only the grouped modes share the coarse parcels.
      if (mode !== "detailed") expect(capacity.capacityInside).toBe(housing.capacityInside);
      expect(
        variantFabric.buildings
          .flatMap(b => (b.residentialCluster ? [b.residentialCluster] : []))
          .reduce((n, c) => n + c.assignedDwellings, 0)
      ).toBe(33334);
    }
  });
});
