import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import type { CityDocument } from "../../../types/document";
import type { GenerationSettings } from "../../../types/generation";
import { supportsBuildingHeightVariation } from "../../buildingHeightPolicy";
import { planPopulation } from "../../populationPlan";
import { synthSite } from "../../site/synthSite";
import { featureReservations } from "../environmentState";
import { regionArea } from "../geometry/regions";
import { seedVectorCivicCentre, vectorCivicLayout } from "./civic";
import { fortifyVectorInput } from "./fortress";
import { expectedVectorHouseStoreys } from "./housingHeights";
import { syntheticVectorInput, vectorInputFromDescriptor } from "./input";
import { MESHLESS_SITE_RIM_METERS, meshlessCityRadius } from "./urbanSizing";
import { isVectorWallShape, vectorWallAreaShare, vectorWallChoice } from "./wallShape";

export interface VectorEditorGenerationInput {
  seed: string;
  settings: GenerationSettings;
  frame: CityDocument["frame"];
  /** Meshless lot occupancy: the native site is sized so its CE lots at this occupancy hold the population. */
  lotOccupancy?: number;
}

/** Housing land lost per square metre of civic precinct, counting its setbacks and fronting streets. */
const CIVIC_LAND_FACTOR = 1.5;

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
  const build = (radius: number, civic = true) => {
    let doc = descriptor
      ? vectorInputFromDescriptor(descriptor)
      : syntheticVectorInput(
          seed,
          radius,
          settings.config.rivers.length > 0,
          true,
          civic
            ? vectorCivicLayout(settings.population?.targetPopulation ?? 5000, settings.config.features).specs.map(
                s => s.boundary.outer
              )
            : []
        );
    doc.recipe.seed = seed;
    doc.context.historicalPeriod = period;
    doc.context.targetPopulation = settings.population?.targetPopulation ?? descriptor?.burg.population ?? 5000;
    // Every requested setting is kept with the city, including those meshless cannot generate yet.
    const { descriptor: _descriptor, ...requested } = settings;
    // Saved as plain JSON: a setting cleared to undefined (uniform heights, no limit) is simply absent.
    doc.context.requestedSettings = JSON.parse(JSON.stringify(requested));
    if (native) {
      // Whole-cell admission leaves a partial-cell rim in mesh first. The continuous
      // site reserves one third of the same street-cell width as its boundary margin.
      doc.frame.extentMeters = Math.max(input.frame.extentMeters, frame.extentMeters, doc.frame.extentMeters);
      doc.site!.id = "standalone-ce-site";
      // A bastioned town replaces the approach roads with the fortress routes, so it comes before the civic
      // centre that takes its access from them (P4c).
      if (settings.townFortification) {
        const fortified = fortifyVectorInput(doc, settings, seed);
        if ("failure" in fortified) throw new Error(fortified.failure);
        doc = fortified.document;
      }
      if (civic) seedVectorCivicCentre(doc, settings.config.features);
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
  // A wall shape narrower than the round site it is drawn in would leave the houses it was sized for outside it:
  // the site grows so the walled area matches (P4a).
  const wall = vectorWallChoice(settings, seed, period),
    wallScale = isVectorWallShape(wall.wall) ? 1 / Math.sqrt(vectorWallAreaShare(seed, wall.wall, wall.wallSides)) : 1;
  const size = (reservedM2: number) =>
    wallScale *
    meshlessCityRadius(
      getUrbanDwellings(settings.population!.targetPopulation),
      expectedVectorHouseStoreys(period, settings, settings.descriptor?.civilization?.tradition),
      input.lotOccupancy,
      reservedM2
    );
  // The first pass leaves the civic centre out: on a site sized for houses alone it may not fit yet.
  const first = build(size(0), false);
  const reserved = [
    // Fortress works lie outside the built-up disc and take none of its land.
    ...featureReservations(
      first.environment ? { ...first, environment: { ...first.environment, defenses: undefined } } : first
    ),
    ...Object.values(first.regions).filter(r => r.kind === "reservation"),
    ...Object.values(first.placements).map(p => p.site)
  ].reduce((n, r) => n + regionArea({ outer: r.outer, holes: r.holes }), 0);
  const civic = vectorCivicLayout(settings.population.targetPopulation, settings.config.features);
  if (!reserved && !civic.specs.length) return build(size(0));
  // The civic centre takes its area from the houses' land, and more: lots stop short of its setbacks and the
  // streets that front it. Its farthest corner must stay inside the rim.
  return build(
    Math.max(size(reserved + civic.areaM2 * CIVIC_LAND_FACTOR), civic.radiusMeters + MESHLESS_SITE_RIM_METERS)
  );
}
