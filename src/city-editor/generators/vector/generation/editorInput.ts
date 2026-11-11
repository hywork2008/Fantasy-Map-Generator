import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import type { CityDocument } from "../../../types/document";
import type { GenerationSettings } from "../../../types/generation";
import { monasteryCountFor, monasteryKindsFor } from "../../aerialLandmarks";
import { supportsBuildingHeightVariation } from "../../buildingHeightPolicy";
import { planPopulation } from "../../populationPlan";
import { synthSite } from "../../site/synthSite";
import { featureReservations } from "../environmentState";
import { regionArea, regionBoolean } from "../geometry/regions";
import { allVectorWater } from "../geometry/water";
import { seedVectorCivicCentre, vectorBurial, vectorCivicLayout } from "./civic";
import { fortifyVectorInput } from "./fortress";
import { expectedVectorHouseStoreys } from "./housingHeights";
import { syntheticVectorInput, vectorInputFromDescriptor } from "./input";
import { bridgeSyntheticCrossings } from "./syntheticCrossings";
import { MESHLESS_SITE_RIM_METERS, meshlessCityRadius, meshlessSiteFillScale } from "./urbanSizing";
import { isVectorWallShape, vectorWallAreaShare, vectorWallChoice } from "./wallShape";

export interface VectorEditorGenerationInput {
  seed: string;
  settings: GenerationSettings;
  frame: CityDocument["frame"];
  /** Meshless lot occupancy: the native site is sized so its CE lots at this occupancy hold the population. */
  lotOccupancy?: number;
}

/** Half the frame of a walled native town in site radii: the frame spans 2.5 wall diameters (about 900 m for 5,000
 * people inside a 350 m wall), as wide as the mesh editor's suburbs and outskirts facilities need. */
const WALLED_REACH = 2.5;

/** Housing land lost per square metre of civic precinct, counting its setbacks and fronting streets. */
const CIVIC_LAND_FACTOR = 1.5;

/** The standalone default uses native input geometry, never a mesh or a legacy city conversion. */
/** The land block a religious house takes: its precinct (about 4,000–5,600 m²) with its street verges. */
const MONASTERY_BLOCK_M2 = 5500;

export function vectorInputFromEditor(input: VectorEditorGenerationInput) {
  const { settings, seed } = input;
  const period = settings.historicalPeriod ?? settings.descriptor?.historicalPeriod ?? "ageOfExploration";
  // The burial culture sites the cemetery: beside the church, outside the town or on a bank (P6a).
  const burial = vectorBurial(settings.burialProfile ?? settings.descriptor?.burialProfile, period),
    civicOptions = { ...settings.config.features, burial: burial.site };
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
  // A wall shape narrower than the round site it is drawn in would leave the houses it was sized for outside it:
  // the site grows so the walled area matches (P4a). A walled town is sized to fill its interior (gate-ribbon §3.6);
  // what the estimate misses goes to the roadside beyond the gates.
  const wall = vectorWallChoice(settings, seed, period, input.frame.extentMeters),
    walledScale = (dwellings: number) =>
      wall.wall === "none"
        ? 1
        : meshlessSiteFillScale(dwellings) *
          (isVectorWallShape(wall.wall) ? 1 / Math.sqrt(vectorWallAreaShare(seed, wall.wall, wall.wallSides)) : 1);
  let descriptor = native
    ? undefined
    : structuredClone(settings.descriptor ?? synthSite("largeTown", settings.config, seed, frame));
  // A synthesized coast or river takes land from the round site the population was planned on. The site is
  // synthesized again on a larger frame until its dry land holds the CE perimeter lots it needs (P5a).
  if (descriptor && !settings.descriptor && settings.population && input.lotOccupancy !== undefined) {
    const dwellings = getUrbanDwellings(settings.population.targetPopulation),
      need =
        Math.PI *
        (walledScale(dwellings) *
          meshlessCityRadius(
            dwellings,
            expectedVectorHouseStoreys(period, settings, undefined),
            input.lotOccupancy,
            0
          )) **
          2;
    let scale = 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      const probe = vectorInputFromDescriptor(descriptor),
        dry =
          probe.site!.domain.reduce((n, d) => n + regionArea(d), 0) -
          regionBoolean(probe.site!.domain, allVectorWater(probe), "intersection").reduce(
            (n, d) => n + regionArea(d),
            0
          );
      if (dry >= need) break;
      scale *= Math.min(1.6, Math.sqrt(need / Math.max(1, dry)) * 1.05);
      descriptor = synthSite("largeTown", settings.config, seed, {
        ...frame,
        cityRadiusMeters: frame.cityRadiusMeters * scale,
        extentMeters: Math.max(frame.extentMeters, frame.cityRadiusMeters * scale * 3)
      });
    }
  }
  if (descriptor) {
    descriptor.historicalPeriod = period;
    // Without relief the mesh editor's synthesized town is flat; the synthesized descriptor's gentle tilt is not
    // carried into the site, so its water and harbour stand on the flat datum (P5b). Relief is P8.
    const field = descriptor.terrain.heightfield;
    if (!settings.descriptor && !settings.config.relief && field)
      field.elevationsMeters = field.elevationsMeters.map(() => descriptor!.terrain.elevationMeters);
    if (settings.population) {
      descriptor.burg.population = settings.population.targetPopulation;
      descriptor.burg.dwellings = getUrbanDwellings(descriptor.burg.population);
    }
  }
  // Only a site sized for its own lots (meshless occupancy) takes its own frame; a mesh-sized one keeps the mesh map's.
  const ownFrame = wall.wall !== "none" && input.lotOccupancy !== undefined && !!settings.population;
  const build = (radius: number, civic = true) => {
    let doc = descriptor
      ? // A synthesized site's roads run over its rivers; an FMG city's bring their certified crossings (P5a).
        settings.descriptor
        ? vectorInputFromDescriptor(descriptor)
        : bridgeSyntheticCrossings(vectorInputFromDescriptor(descriptor))
      : syntheticVectorInput(
          seed,
          radius,
          settings.config.rivers.length > 0,
          true,
          civic
            ? vectorCivicLayout(settings.population?.targetPopulation ?? 5000, civicOptions).specs.map(
                s => s.boundary.outer
              )
            : [],
          ownFrame ? WALLED_REACH : undefined
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
      // A walled town's frame is its own: two and a half wall diameters, so the roadside beyond the gates has room to
      // grow out along the approaches without the mesh map's preset (too tight at tiny, needlessly wide at small).
      doc.frame.extentMeters = ownFrame
        ? doc.frame.extentMeters
        : Math.max(input.frame.extentMeters, frame.extentMeters, doc.frame.extentMeters);
      doc.site!.id = "standalone-ce-site";
      // A bastioned town replaces the approach roads with the fortress routes, so it comes before the civic
      // centre that takes its access from them (P4c).
      if (settings.townFortification) {
        const fortified = fortifyVectorInput(doc, settings, seed);
        if ("failure" in fortified) throw new Error(fortified.failure);
        doc = fortified.document;
      }
      if (civic) seedVectorCivicCentre(doc, civicOptions, burial.profile);
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
  // A synthetic site is at least 30 m across its radius.
  const size = (reservedM2: number) =>
    Math.max(
      30,
      walledScale(getUrbanDwellings(settings.population!.targetPopulation)) *
        meshlessCityRadius(
          getUrbanDwellings(settings.population!.targetPopulation),
          expectedVectorHouseStoreys(period, settings, settings.descriptor?.civilization?.tradition),
          input.lotOccupancy,
          reservedM2
        )
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
  const civic = vectorCivicLayout(settings.population.targetPopulation, civicOptions);
  // The religious houses the skeleton will found take whole blocks of the houses' land too (P6c); a walled town's
  // abbey stands outside the walls.
  const walled = wall.wall !== "none",
    houses = monasteryKindsFor(settings.descriptor?.civilization?.faith, period, walled)
      .slice(0, monasteryCountFor(getUrbanDwellings(settings.population.targetPopulation), period))
      .filter(kind => !(kind === "abbey" && walled)).length;
  if (!reserved && !civic.specs.length && !houses) return build(size(0));
  // The civic centre takes its area from the houses' land, and more: lots stop short of its setbacks and the
  // streets that front it. Its farthest corner must stay inside the rim.
  return build(
    Math.max(
      size(reserved + (civic.areaM2 + houses * MONASTERY_BLOCK_M2) * CIVIC_LAND_FACTOR),
      civic.radiusMeters + MESHLESS_SITE_RIM_METERS
    )
  );
}
