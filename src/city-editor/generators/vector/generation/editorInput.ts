import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import { residentialStoreys } from "../../../../utils/urbanMorphology";
import type { CityDocument } from "../../../types/document";
import type { GenerationSettings } from "../../../types/generation";
import { supportsBuildingHeightVariation } from "../../buildingHeightPolicy";
import { planPopulation } from "../../populationPlan";
import { synthSite } from "../../site/synthSite";
import { featureReservations } from "../environmentState";
import { regionArea } from "../geometry/regions";
import { seedVectorCivicCentre } from "./civic";
import { syntheticVectorInput, vectorInputFromDescriptor } from "./input";
import { meshlessCityRadius } from "./urbanSizing";

export interface VectorEditorGenerationInput {
  seed: string;
  settings: GenerationSettings;
  frame: CityDocument["frame"];
  /** Meshless lot occupancy: the native site is sized so its CE lots at this occupancy hold the population. */
  lotOccupancy?: number;
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
  const build = (radius: number) => {
    const doc = descriptor
      ? vectorInputFromDescriptor(descriptor)
      : syntheticVectorInput(seed, radius, settings.config.rivers.length > 0);
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
  };
  const meshRadius = Math.max(
    30,
    frame.cityRadiusMeters - ("cellWidthMeters" in frame ? frame.cellWidthMeters / 3 : 0)
  );
  if (!native || input.lotOccupancy === undefined || !settings.population) return build(meshRadius);
  // The mesh plan sizes cells for the mesh editor's lots. The native site is sized for the CE perimeter lots it
  // will actually hold at the chosen occupancy, plus the land the civic centre takes before any lot.
  const size = (reservedM2: number) =>
    meshlessCityRadius(
      getUrbanDwellings(settings.population!.targetPopulation),
      residentialStoreys(period).standard,
      input.lotOccupancy,
      reservedM2
    );
  const first = build(size(0));
  const reserved = [
    ...featureReservations(first),
    ...Object.values(first.regions).filter(r => r.kind === "reservation"),
    ...Object.values(first.placements).map(p => p.site)
  ].reduce((n, r) => n + regionArea({ outer: r.outer, holes: r.holes }), 0);
  return reserved > 0 ? build(size(reserved)) : first;
}
