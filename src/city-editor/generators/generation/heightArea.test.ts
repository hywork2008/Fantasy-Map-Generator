import { expect, it } from "vitest";
import { createUrbanMorphology } from "../../../utils/urbanMorphology";
import inputs from "../../data/fixtures/nidyia-waterfront-20261027.json";
import { cityEditorDocument, cityEditorSettings } from "../../services/analysis/housingReport";
import { parseDocument, serializeDocument } from "../../services/io/documentCodec";
import { parseIncomingPayload } from "../../services/io/incomingCity";
import { buildBlockFabric } from "../blockInfill";
import { DEFAULT_BUILDING_HEIGHT_POLICY } from "../buildingHeightPolicy";
import { createGridDocument } from "../document";
import { polygonArea } from "../geom";
import { facePoints } from "../mesh";
import { populationFabricSource } from "../populationHousing";
import { defaultPopulationSettings } from "../populationPlan";
import { synthSite } from "../site/synthSite";
import { generateCityOnDocument } from "./generateCity";
import { initialHousingAreaScale, nextHousingAreaScale } from "./heightArea";
import { defaultGenerationSettings } from "./settings";

it("reserves more core cells for low-rise houses without changing the ordinary detailed lot layout", () => {
  const seed = "height-standalone";
  const settings = defaultGenerationSettings();
  settings.historicalPeriod = "lateMedieval";
  settings.population = { ...defaultPopulationSettings(3000), housingDisplay: "detailed" };
  settings.config.coast = "none";
  settings.config.rivers = [];
  settings.config.features.citadel = false;
  settings.config.features.port = false;
  const input = createGridDocument({ size: "small", grid: "hex", seed });
  const legacy = generateCityOnDocument(input, { ...settings, buildingHeightPolicy: undefined }, seed)!;
  const city = generateCityOnDocument(input, settings, seed)!;
  expect(city).not.toBeNull();
  const core = (doc: typeof city) =>
    Object.values(doc.mesh.faces).filter(face => face.properties.settlement === "core");
  const area = (doc: typeof city) =>
    core(doc).reduce((sum, face) => sum + Math.abs(polygonArea(facePoints(doc.mesh, face))), 0);
  expect(core(city).length).toBeGreaterThan(core(legacy).length);
  expect(area(city)).toBeGreaterThan(area(legacy));
  expect(city.frame.blockSizeMeters).toBe(legacy.frame.blockSizeMeters);
  expect(city.populationReport!.unplacedPopulation).toBe(0);
  expect(city.populationPlan!.housingFit!.pass).toBe(1);
  const source = populationFabricSource(city);
  expect(source.fabric).toBe(city.fabric);
  const ordinary = buildBlockFabric(source).buildings;
  const actual = buildBlockFabric(city).buildings;
  const coreLots = (lots: typeof actual) =>
    lots.filter(lot => city.mesh.faces[lot.faceId]?.properties.settlement === "core");
  expect(coreLots(actual).map(lot => lot.polygon)).toEqual(coreLots(ordinary).map(lot => lot.polygon));
  const footprints = new Set(ordinary.map(lot => JSON.stringify(lot.polygon)));
  expect(actual.every(lot => footprints.has(JSON.stringify(lot.polygon)))).toBe(true);
  expect(new Set(actual.filter(lot => lot.residentialCluster).map(lot => lot.storeys)).size).toBeGreaterThan(1);
  expect(parseDocument(serializeDocument(city))!.populationReport).toEqual(city.populationReport);
  const recipe = city.fabric!.generation!;
  const replay = generateCityOnDocument(recipe.input, recipe.settings, recipe.seed)!;
  expect(replay.populationReport).toEqual(city.populationReport);
});

it("bounds imported area expansion and never expands locked or manually sized cities", () => {
  const document = createGridDocument({ size: "tiny", grid: "hex", seed: "height-area-limit" });
  document.buildingHeightPolicy = DEFAULT_BUILDING_HEIGHT_POLICY;
  document.historicalPeriod = "lateMedieval";
  const face = Object.values(document.mesh.faces)[0];
  face.properties.settlement = "core";
  const descriptor = synthSite("smallTown", defaultGenerationSettings().config, "height-area-limit", {
    extentMeters: 600,
    cityRadiusMeters: 100
  });
  const settings = { ...defaultGenerationSettings(), descriptor };
  document.urbanMorphology = createUrbanMorphology({
    seed: "height-area-limit",
    burgId: 1,
    year: 1500,
    population: 1000,
    capital: false,
    walls: true,
    polityAge: 100,
    generationYears: 30,
    polityPower: 0.5,
    defensePressure: 0.2,
    period: "lateMedieval",
    religious: false,
    extramuralBurial: false,
    plaza: false
  });
  const lots = [
    {
      id: "one-house",
      faceId: face.id,
      landmark: false,
      polygon: [
        [0, 0],
        [8, 0],
        [8, 10],
        [0, 10]
      ] as [number, number][]
    }
  ];
  const scale = nextHousingAreaScale(document, document, settings, lots)!;
  expect(scale).toBeGreaterThan(1);
  expect(scale).toBeLessThanOrEqual((600 / 2.6 / 100) ** 2);
  expect(nextHousingAreaScale(document, document, { ...settings, housingAreaPasses: 3 }, lots)).toBeUndefined();
  expect(
    nextHousingAreaScale(
      document,
      document,
      { ...settings, population: { ...defaultPopulationSettings(1000), frameMode: "manual" } },
      lots
    )
  ).toBeUndefined();
  face.properties.locked = true;
  expect(nextHousingAreaScale(document, document, settings, lots)).toBeUndefined();
});

it("reserves low-rise housing before imported generation and respects explicit scales and protected geometry", () => {
  const document = createGridDocument({ size: "small", grid: "evolution", seed: "housing-reservation" });
  const settings = defaultGenerationSettings();
  const descriptor = synthSite("smallTown", settings.config, "housing-reservation", {
    extentMeters: 1200,
    cityRadiusMeters: 120
  });
  descriptor.burg.dwellings = 1000;
  descriptor.urbanMorphology = createUrbanMorphology({
    seed: "housing-reservation",
    burgId: 1,
    year: 1500,
    population: 4500,
    capital: false,
    walls: true,
    polityAge: 100,
    generationYears: 30,
    polityPower: 0.5,
    defensePressure: 0.2,
    period: "lateMedieval",
    religious: false,
    extramuralBurial: false,
    plaza: false
  });
  const input = { ...settings, descriptor };
  const scale = initialHousingAreaScale(document, input)!;
  expect(scale).toBeGreaterThan(1);
  expect(scale).toBeLessThanOrEqual((1200 / 2.6 / 120) ** 2);
  expect(initialHousingAreaScale(document, { ...input, housingAreaScale: scale })).toBeUndefined();
  expect(initialHousingAreaScale(document, { ...input, buildingHeightPolicy: undefined })).toBeUndefined();
  document.mesh.vertices[Object.keys(document.mesh.vertices)[0]].locked = true;
  expect(initialHousingAreaScale(document, input)).toBeUndefined();
});

it("reserves an inner-wall street belt only for eligible open estuary towns", () => {
  const share = parseIncomingPayload(JSON.stringify(inputs["13"]))!;
  const source = cityEditorDocument(share);
  const base = cityEditorSettings(share);
  // FMG-linked population settings are resolved away before the estimate.
  const { population: _population, ...settings } = base;
  const double = { ...settings, townWallRings: "double" as const, walledAreaShare: 0.28 };
  const single = { ...double, townWallRings: "single" as const };
  const baseline = initialHousingAreaScale(source, single)!;
  const reserved = initialHousingAreaScale(source, double)!;
  expect(reserved).toBeGreaterThan(baseline);
  expect(reserved).toBeLessThanOrEqual(
    (source.frame.extentMeters / 2.6 / share.descriptor!.frame.cityRadiusMeters) ** 2
  );
  const closed = {
    ...double,
    config: { ...double.config, wall: { ...double.config.wall, coast: "seaWall" as const } }
  };
  expect(initialHousingAreaScale(source, closed)).toBe(baseline);
  const noCitadel = structuredClone(double.descriptor!);
  noCitadel.burg.citadel = false;
  expect(initialHousingAreaScale(source, { ...double, descriptor: noCitadel })).toBe(baseline);
  const farBank = structuredClone(double.descriptor!);
  farBank.burg.riverPlacement!.bankDistanceMeters = 10000;
  expect(initialHousingAreaScale(source, { ...double, descriptor: farBank })).toBe(baseline);
  const farSea = structuredClone(double.descriptor!);
  farSea.waterbody!.shoreDistanceMeters = 10000;
  expect(initialHousingAreaScale(source, { ...double, descriptor: farSea })).toBe(baseline);
  expect(initialHousingAreaScale(source, { ...double, housingAreaScale: 2 })).toBeUndefined();
  source.mesh.vertices[Object.keys(source.mesh.vertices)[0]].locked = true;
  expect(initialHousingAreaScale(source, double)).toBeUndefined();
});
