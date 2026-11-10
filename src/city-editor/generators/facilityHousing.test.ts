import { expect, it } from "vitest";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import type { GenerationSample } from "../types/contracts/generationDiagnostics";
import { createGridDocument } from "./document";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { defaultPopulationSettings } from "./populationPlan";

function generate(plaza: boolean) {
  const settings = defaultGenerationSettings();
  settings.config.coast = "none";
  settings.config.rivers = [];
  settings.config.features = { walls: false, citadel: false, plaza, temple: false, port: false, shanty: false };
  settings.population = defaultPopulationSettings(5000);
  settings.historicalPeriod = "highMedieval";
  settings.layout = "organic";
  settings.buildingPattern = "medieval";
  settings.buildingHeightPolicy = undefined;
  if (plaza) settings.buildingHeightLimit = { maxStoreys: 2 };
  settings.facilityLayout = "population";
  const input = createGridDocument({ size: "small", grid: "hex", seed: "population-small" });
  const samples: GenerationSample[] = [];
  const city = generateCityOnDocument(input, settings, "population-5000", sample => {
    if (sample.phase === "fit-housing" || sample.phase === "population-facilities") samples.push(sample);
  });
  expect(city).not.toBeNull();
  return { city: city!, samples };
}

it("does not add core cells when the 5,000-person city already fits after facility placement", () => {
  const { city } = generate(false);
  expect(city.facilityReport!.required).toBe(294);
  expect(city.facilityReport!.placed).toBe(269);
  expect(city.facilityReport!.unplaced.every(r => r.reason === "river-required")).toBe(true);
  expect(city.facilityReport!.housing).toMatchObject({
    requiredDwellings: 1112,
    assignedDwellings: 1112,
    unplacedDwellings: 0,
    areaScale: 1,
    expansionPasses: 0,
    coreCells: 61,
    expansionLimited: false
  });
  expect(city.populationReport!.unplacedPopulation).toBe(0);
}, 120000);

it("adds core cells only when the final facility and housing reservations leave a shortfall", () => {
  const { city, samples } = generate(true);
  const housing = city.facilityReport!.housing!;

  expect(housing.expansionPasses).toBeGreaterThan(0);
  expect(housing.unplacedDwellings).toBe(0);
  expect(city.populationReport!.unplacedPopulation).toBe(0);
  const steps = samples.filter(s => s.phase === "population-facilities");
  expect(housing.coreCells).toBeGreaterThan(steps[0].counts!.coreCells);
  expect(city.fabric!.generation!.settings.housingAreaScale).toBe(housing.areaScale);
  expect(city.fabric!.generation!.settings.housingAreaPasses).toBe(housing.expansionPasses);
  expect(parseDocument(serializeDocument(city))?.facilityReport).toEqual(city.facilityReport);
}, 120000);
