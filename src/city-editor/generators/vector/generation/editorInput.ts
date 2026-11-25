import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import type { CityDocument } from "../../../types/document";
import type { GenerationSettings } from "../../../types/generation";
import { monasteryCountFor, monasteryKindsFor } from "../../aerialLandmarks";
import { supportsBuildingHeightVariation } from "../../buildingHeightPolicy";
import { burgageLandFactor } from "../../burgage/profiles";
import { isCompactV2Fabric } from "../../compactBlocks";
import { planPopulation } from "../../populationPlan";
import { riverSettings } from "../../site/siteConfig";
import { synthSite } from "../../site/synthSite";
import { featureReservations } from "../environmentState";
import { regionArea, regionBoolean } from "../geometry/regions";
import { allVectorWater } from "../geometry/water";
import { settingsRelief } from "../relief";
import { seedVectorCivicCentre, vectorBurial, vectorCivicLayout } from "./civic";
import { curveSynthesizedRivers } from "./curvedRivers";
import { fortifyVectorInput } from "./fortress";
import { chosenHousingCulture, townProfileFor, vectorTownCulture, vectorTownProfile } from "./housingCulture";
import { expectedVectorHouseStoreys } from "./housingHeights";
import { syntheticVectorInput, vectorInputFromDescriptor } from "./input";
import { vectorFacilityLand } from "./suburbs";
import { bridgeSyntheticCrossings } from "./syntheticCrossings";
import { MESHLESS_SITE_RIM_METERS, meshlessCityRadius, meshlessSiteFillScale } from "./urbanSizing";
import { villageHalfExtentMeters } from "./villagePlan";
import { isVectorWallShape, vectorBastionCount, vectorWallAreaShare, vectorWallChoice } from "./wallShape";

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

export function vectorInputFromEditor(request: VectorEditorGenerationInput) {
  const { settings, seed } = request;
  // A roadside village is laid along its approaches, not on a round site (ce-meshless-roadside-burgage-village.md
  // §5.1): its site holds only the centre, and its map reaches as far as its roads must run.
  const village = settings.plotFabric === "burgage-village" && !settings.descriptor;
  const input =
    village && settings.population
      ? {
          ...request,
          frame: {
            ...request.frame,
            extentMeters: Math.max(
              request.frame.extentMeters,
              Math.ceil(2 * villageHalfExtentMeters(getUrbanDwellings(settings.population.targetPopulation)))
            )
          }
        }
      : request;
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
    riverSettings(settings.config).every(
      r => r.placement === "through" && (r.form === "straight" || r.form === "gentle")
    );
  // A wall shape narrower than the round site it is drawn in would leave the houses it was sized for outside it:
  // the site grows so the walled area matches (P4a). A walled town is sized to fill its interior (gate-ribbon §3.6);
  // what the estimate misses goes to the roadside beyond the gates.
  const wall = vectorWallChoice(settings, seed, period, input.frame.extentMeters),
    // A bastioned wall left to the generator takes as many bastions as its size needs, and the count sets the share
    // of the wall the bastions take: resolved on the site's radius (`fitBastions`), as the pipeline will.
    autoBastions = wall.wall === "bastioned" && wall.wallSides === undefined;
  let sides = autoBastions ? vectorBastionCount(seed, 0) : wall.wallSides;
  const wallShare = () => (isVectorWallShape(wall.wall) ? vectorWallAreaShare(seed, wall.wall, sides) : 1),
    walledScale = (dwellings: number) =>
      wall.wall === "none" ? 1 : meshlessSiteFillScale(dwellings) * (1 / Math.sqrt(wallShare()));
  /** Settle the bastion count on the radius `radius` gives for it; the count only grows, so it ends. */
  const fitBastions = (radius: () => number) => {
    if (!autoBastions) return radius();
    for (;;) {
      const r = radius(),
        n = Math.max(sides!, vectorBastionCount(seed, r));
      if (n === sides) return r;
      sides = n;
    }
  };
  // Only a site sized for its own lots (meshless occupancy) takes its own frame; a mesh-sized one keeps the mesh map's.
  const ownFrame = wall.wall !== "none" && input.lotOccupancy !== undefined && !!settings.population;
  // A synthesized site's meandering rivers are laid as smooth curves through the town (curvedRivers.ts). Its frame
  // follows the native site's: two and a half wall diameters for a walled town, otherwise at least the editor's map,
  // so the coast, rivers and approaches are synthesized out to that edge.
  const synthesize = (siteFrame: typeof frame) => {
    const site = synthSite("largeTown", settings.config, seed, {
      ...siteFrame,
      extentMeters: ownFrame
        ? siteFrame.cityRadiusMeters * 2 * WALLED_REACH
        : Math.max(input.frame.extentMeters, siteFrame.extentMeters, siteFrame.cityRadiusMeters * 3)
    });
    curveSynthesizedRivers(site, settings.config, seed);
    return site;
  };
  const curvedRivers = !settings.descriptor;
  let descriptor = native ? undefined : structuredClone(settings.descriptor ?? synthesize(frame));
  // A synthesized coast or river takes land from the round site the population was planned on. The site is
  // synthesized again on a larger frame until its dry land holds the CE perimeter lots it needs (P5a).
  if (descriptor && !settings.descriptor && settings.population && input.lotOccupancy !== undefined) {
    const dwellings = getUrbanDwellings(settings.population.targetPopulation),
      need =
        Math.PI *
        fitBastions(
          () =>
            walledScale(dwellings) *
            meshlessCityRadius(
              dwellings,
              expectedVectorHouseStoreys(period, settings, undefined),
              input.lotOccupancy!,
              0,
              burgageLandFactor(settings)
            )
        ) **
          2;
    let scale = 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      const probe = vectorInputFromDescriptor(descriptor, { curvedRivers }),
        dry =
          probe.site!.domain.reduce((n, d) => n + regionArea(d), 0) -
          regionBoolean(probe.site!.domain, allVectorWater(probe), "intersection").reduce(
            (n, d) => n + regionArea(d),
            0
          );
      if (dry >= need) break;
      scale *= Math.min(1.6, Math.sqrt(need / Math.max(1, dry)) * 1.05);
      descriptor = synthesize({
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
  // The editor's own plain site, its river straight or a gentle meander (the approaches keep to the town's bank but
  // one, which meets the river square).
  const plainForm = riverSettings(settings.config)[0]?.form === "gentle" ? "gentle" : "straight";
  const plainSite = (radius: number, civic: boolean) => {
    const site = syntheticVectorInput(
      seed,
      radius,
      settings.config.rivers.length > 0,
      true,
      civic
        ? vectorCivicLayout(settings.population?.targetPopulation ?? 5000, civicOptions).specs.map(
            s => s.boundary.outer
          )
        : [],
      ownFrame ? WALLED_REACH : undefined,
      plainForm,
      // The map the site is laid on (`build` widens it to this), so the river and approaches reach its edge.
      ownFrame ? 0 : Math.max(input.frame.extentMeters, frame.extentMeters)
    );
    return site;
  };
  const build = (radius: number, civic = true) => {
    let doc = descriptor
      ? // A synthesized site's roads run over its rivers; an FMG city's bring their certified crossings (P5a).
        settings.descriptor
        ? vectorInputFromDescriptor(descriptor)
        : bridgeSyntheticCrossings(vectorInputFromDescriptor(descriptor, { curvedRivers }))
      : plainSite(radius, civic);
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
      if (settings.townFortification && !village) {
        const fortified = fortifyVectorInput(doc, settings, seed);
        if ("failure" in fortified) throw new Error(fortified.failure);
        doc = fortified.document;
      }
      if (civic) seedVectorCivicCentre(doc, civicOptions, burial.profile);
    }
    // A standalone town's relief comes from its settings; an FMG city keeps the map's heights (P8a).
    if (!settings.descriptor) {
      const relief = settingsRelief(doc, settings, seed, radius);
      if (relief) doc.environment = { ...(doc.environment ?? { features: {}, hidden: [] }), relief };
    }
    return doc;
  };
  const meshRadius = Math.max(
    30,
    frame.cityRadiusMeters - ("cellWidthMeters" in frame ? frame.cellWidthMeters / 3 : 0)
  );
  // An FMG town's wall is drawn on the descriptor's round site, which may hold half the houses its population needs
  // (pre-acceptance U2: 24–76% of the people lived inside). A walled FMG town's site is resized, larger or smaller, to
  // the land the native sizing gives the same population, until its dry land matches it (U3): a site larger than its
  // houses leaves lots unbuilt inside the wall, which CE never should.
  if (
    descriptor &&
    settings.descriptor &&
    wall.wall !== "none" &&
    input.lotOccupancy !== undefined &&
    settings.population
  ) {
    const dwellings = getUrbanDwellings(settings.population.targetPopulation),
      // The abbey of a walled town stands outside the walls.
      houses = monasteryKindsFor(settings.descriptor.civilization?.faith, period, true)
        .slice(0, monasteryCountFor(dwellings, period))
        .filter(kind => kind !== "abbey").length,
      facilityM2 = vectorFacilityLand(
        settings.population.targetPopulation,
        period,
        !!descriptor.burg.port,
        settings.facilityLayout,
        vectorTownCulture(townProfileFor(period, chosenHousingCulture(settings), descriptor, seed))
      ).coreM2,
      // On burgage plots a facility takes whole plots, its yard with it (plan §6).
      housingDwellings =
        isCompactV2Fabric(settings.plotFabric) && settings.facilityLayout === "population"
          ? Math.max(1, Math.round(dwellings * 0.87))
          : dwellings,
      need = fitBastions(() => {
        const housing =
          walledScale(housingDwellings) *
          meshlessCityRadius(
            housingDwellings,
            expectedVectorHouseStoreys(period, settings, settings.descriptor!.civilization?.tradition),
            input.lotOccupancy!,
            houses * MONASTERY_BLOCK_M2 * CIVIC_LAND_FACTOR,
            burgageLandFactor(settings)
          );
        return Math.sqrt(
          housing ** 2 + ((facilityM2 / wallShare()) * burgageLandFactor(settings, "facility")) / Math.PI
        );
      });
    for (let attempt = 0; attempt < 3; attempt++) {
      const probe = vectorInputFromDescriptor(descriptor),
        dry =
          probe.site!.domain.reduce((n, d) => n + regionArea(d), 0) -
          regionBoolean(probe.site!.domain, allVectorWater(probe), "intersection").reduce(
            (n, d) => n + regionArea(d),
            0
          ),
        wanted = Math.PI * need ** 2;
      if (Math.abs(dry - wanted) <= wanted * 0.03) break;
      const radius =
        descriptor.frame.cityRadiusMeters * Math.max(0.6, Math.min(1.6, Math.sqrt(wanted / Math.max(1, dry))));
      descriptor.frame.cityRadiusMeters = radius;
      descriptor.frame.extentMeters = Math.max(descriptor.frame.extentMeters, Math.ceil(radius * 2.4));
    }
  }
  if (!native || input.lotOccupancy === undefined || !settings.population) return build(meshRadius);
  // The mesh plan sizes cells for the mesh editor's lots. The native site is sized for the CE perimeter lots it
  // will actually hold at the chosen occupancy, plus the land the civic centre takes before any lot.
  // A synthetic site is at least 30 m across its radius.
  // On compact-v2 walled towns with population facilities, facilities themselves provide ~13–15% of dwellings;
  // discounting housing dwellings avoids oversizing the wall and leaving empty perimeter blocks inside.
  const compactV2WalledDwellings = (dwellings: number) =>
    isCompactV2Fabric(settings.plotFabric) && wall.wall !== "none" && settings.facilityLayout === "population"
      ? Math.max(1, Math.round(dwellings * 0.87))
      : dwellings;
  const size = (reservedM2: number, facilityLandM2 = 0) => {
    const rawDwellings = getUrbanDwellings(settings.population!.targetPopulation),
      housingDwellings = compactV2WalledDwellings(rawDwellings);
    const radius =
      walledScale(housingDwellings) *
      meshlessCityRadius(
        housingDwellings,
        expectedVectorHouseStoreys(period, settings, settings.descriptor?.civilization?.tradition),
        input.lotOccupancy,
        reservedM2,
        burgageLandFactor(settings)
      );
    // The facilities' parcels are measured land, not an estimate the fill correction trims: they are added whole,
    // widened by the wall shape as the rest is.
    const shape = 1 / wallShare();
    // On burgage plots a facility takes whole plots, its yard with it (plan §6).
    return Math.max(
      30,
      Math.sqrt(radius ** 2 + (facilityLandM2 * shape * burgageLandFactor(settings, "facility")) / Math.PI)
    );
  };
  // The village's site is its centre: the church, the plaza and the junction of its roads. It is sized for them
  // alone, with no first pass for the houses' land.
  if (village)
    return build(
      Math.max(
        40,
        vectorCivicLayout(settings.population.targetPopulation, civicOptions).radiusMeters + MESHLESS_SITE_RIM_METERS
      )
    );
  // The first pass leaves the civic centre out: on a site sized for houses alone it may not fit yet.
  const first = build(
    fitBastions(() => size(0)),
    false
  );
  const reserved = [
    // Fortress works lie outside the built-up disc and take none of its land.
    ...featureReservations(
      first.environment ? { ...first, environment: { ...first.environment, defenses: undefined } } : first
    ),
    ...Object.values(first.regions).filter(r => r.kind === "reservation"),
    ...Object.values(first.placements).map(p => p.site)
  ].reduce((n, r) => n + regionArea({ outer: r.outer, holes: r.holes }), 0);
  const civic = vectorCivicLayout(settings.population.targetPopulation, civicOptions);
  // Population facilities inside the town take its land before any house (facility mode).
  const facilityM2 = vectorFacilityLand(
    settings.population.targetPopulation,
    period,
    !!settings.config.features.port,
    settings.facilityLayout,
    vectorTownCulture(vectorTownProfile(first))
  ).coreM2;
  // The religious houses the skeleton will found take whole blocks of the houses' land too (P6c); a walled town's
  // abbey stands outside the walls.
  const walled = wall.wall !== "none",
    houses = monasteryKindsFor(settings.descriptor?.civilization?.faith, period, walled)
      .slice(0, monasteryCountFor(getUrbanDwellings(settings.population.targetPopulation), period))
      .filter(kind => !(kind === "abbey" && walled)).length;
  if (!reserved && !civic.specs.length && !houses) return build(fitBastions(() => size(0, facilityM2)));
  // The civic centre takes its area from the houses' land, and more: lots stop short of its setbacks and the
  // streets that front it. Its farthest corner must stay inside the rim.
  return build(
    fitBastions(() =>
      Math.max(
        size(reserved + (civic.areaM2 + houses * MONASTERY_BLOCK_M2) * CIVIC_LAND_FACTOR, facilityM2),
        civic.radiusMeters + MESHLESS_SITE_RIM_METERS
      )
    )
  );
}
