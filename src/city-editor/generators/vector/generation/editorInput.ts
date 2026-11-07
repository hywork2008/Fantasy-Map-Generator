import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import type { CityDocument } from "../../../types/document";
import type { GenerationSettings } from "../../../types/generation";
import { supportsBuildingHeightVariation } from "../../buildingHeightPolicy";
import { planPopulation } from "../../populationPlan";
import { synthSite } from "../../site/synthSite";
import { seedVectorCivicCentre } from "./civic";
import { syntheticVectorInput, vectorInputFromDescriptor } from "./input";

export interface VectorEditorGenerationInput {
  seed: string;
  settings: GenerationSettings;
  frame: CityDocument["frame"];
}

/** The standalone default uses native input geometry, never a mesh or a legacy city conversion. */
export function vectorInputFromEditor(input: VectorEditorGenerationInput) {
  const { settings, seed } = input;
  const period = settings.historicalPeriod ?? settings.descriptor?.historicalPeriod ?? "ageOfExploration";
  const frame = settings.population
    ? planPopulation(
        settings.population,
        period,
        input.frame.extentMeters,
        settings.buildingHeightPolicy?.version === 1 &&
          supportsBuildingHeightVariation(period, settings.descriptor?.civilization?.tradition)
          ? 1
          : undefined,
        settings.housingAreaScale ?? 1
      )
    : input.frame;
  const native =
    !settings.descriptor &&
    settings.config.coast === "none" &&
    !settings.config.relief &&
    settings.config.rivers.length <= 1 &&
    settings.config.rivers.every(r => r === "through" || r === "straight");
  const descriptor = native
    ? undefined
    : structuredClone(settings.descriptor ?? synthSite("largeTown", settings.config, seed, frame));
  if (descriptor) {
    descriptor.historicalPeriod = period;
    if (settings.population) {
      descriptor.burg.population = settings.population.targetPopulation;
      descriptor.burg.dwellings = getUrbanDwellings(descriptor.burg.population);
    }
  }
  const doc = descriptor
    ? vectorInputFromDescriptor(descriptor)
    : syntheticVectorInput(
        seed,
        Math.max(30, frame.cityRadiusMeters - ("cellWidthMeters" in frame ? frame.cellWidthMeters / 3 : 0)),
        settings.config.rivers.length > 0
      );
  doc.recipe.seed = seed;
  doc.context.historicalPeriod = period;
  doc.context.targetPopulation = settings.population?.targetPopulation ?? descriptor?.burg.population ?? 5000;
  if (native) {
    // Whole-cell admission leaves a partial-cell rim in mesh first. The continuous
    // site reserves one third of the same street-cell width as its boundary margin.
    doc.frame.extentMeters = Math.max(input.frame.extentMeters, frame.extentMeters, doc.frame.extentMeters);
    doc.site!.id = "standalone-ce-site";
    seedVectorCivicCentre(doc, settings.config.features);
  }
  return doc;
}
