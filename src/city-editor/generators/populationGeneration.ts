import { getUrbanDwellings } from "../../utils/urbanDwellings";
import type { CityDocument } from "../types/document";
import type { GenerationSettings } from "../types/generation";
import { fortressFrameExtent } from "./bastionedTown/validate";
import { inheritBuildingAppearance } from "./buildingAppearance";
import { createGridDocument, sizePresetForExtent } from "./document";
import { planPopulation } from "./populationPlan";

/** No synthetic burg, state, or economy is needed to generate a standalone population. */
export function preparePopulationGeneration(document: CityDocument, settings: GenerationSettings, seed: string) {
  // An unmodified FMG population keeps the FMG-linked generator: its descriptor already
  // carries the burg's population, and only an explicit CE override switches methods.
  if (settings.population?.source === "fmg") {
    const { population: _fmgPopulation, ...legacySettings } = settings;
    settings = legacySettings;
  }
  if (!settings.population) {
    if (!document.populationPlan) return { document, settings };
    const legacy = { ...document };
    delete legacy.populationPlan;
    delete legacy.populationReport;
    delete legacy.residentialClusters;
    delete legacy.housingCapacity;
    return { document: legacy, settings };
  }
  const fortress = !!settings.townFortification;
  const period =
    settings.historicalPeriod ??
    settings.descriptor?.historicalPeriod ??
    (fortress ? "ageOfExploration" : "lateMedieval");
  const population = settings.population;
  let plan = planPopulation(population, period, document.frame.extentMeters);
  if (fortress && population.frameMode !== "manual") {
    const extent = fortressFrameExtent(plan.cityRadiusMeters, settings);
    if (extent > plan.extentMeters) plan = { ...plan, extentMeters: extent };
  }
  if (settings.descriptor && document.frame.extentMeters < 2 * plan.cityRadiusMeters * 1.3)
    throw new Error("The imported terrain does not cover the population window. Import a larger terrain frame.");
  if (settings.generationMethod === "skeleton-first" && !fortress)
    throw new Error("Population generation currently requires mesh-first.");
  if (!fortress && ["bram", "circulade", "classic"].includes(settings.layout ?? settings.config.layout ?? ""))
    throw new Error("Population generation currently requires organic layout.");
  let next = document;
  const protectedGeometry =
    Object.values(document.mesh.faces).some(f => f.properties.locked) ||
    Object.values(document.mesh.vertices).some(v => v.locked) ||
    Object.values(document.mesh.edges).some(e => e.locked) ||
    document.featureGroups.some(g => g.locked) ||
    document.elements.some(e => e.locked) ||
    !!document.landmarks?.length;
  if (protectedGeometry && document.frame.extentMeters < 2 * plan.cityRadiusMeters * 1.3)
    throw new Error("The fixed geometry is inside a frame too small for this population.");
  if (!settings.descriptor && !protectedGeometry) {
    const key = (p: typeof plan | undefined) =>
      p && JSON.stringify([p.targetAreaM2, p.cellWidthMeters, p.extentMeters, seed]);
    if (key(document.populationPlan) !== key(plan)) {
      const width = plan.cellWidthMeters;
      next = createGridDocument({
        size: sizePresetForExtent(plan.extentMeters),
        grid: document.gridKind ?? "voronoi",
        seed,
        extentMeters: plan.extentMeters,
        cityRadiusMeters: plan.cityRadiusMeters,
        blockSizeMeters: width,
        hexSizeMeters: width / Math.sqrt((3 * Math.sqrt(3)) / 2),
        patchParams: {
          nPatches: Math.max(6, Math.ceil(((0.63 * plan.extentMeters) / width) ** 2 / 8)),
          relaxCount: 4,
          relaxPasses: 3
        },
        measureBlockSize: document.gridKind === "evolution",
        biome: document.biome
      });
      next = inheritBuildingAppearance(next, document);
    }
  }
  const descriptor = settings.descriptor ? structuredClone(settings.descriptor) : undefined;
  if (descriptor) {
    descriptor.burg.population = population.targetPopulation;
    descriptor.burg.dwellings = getUrbanDwellings(population.targetPopulation);
    descriptor.frame.cityRadiusMeters = plan.cityRadiusMeters;
    if (
      population.source === "ce-override" &&
      descriptor.urbanMorphology &&
      descriptor.urbanMorphology.baselinePopulation !== population.targetPopulation
    ) {
      // The clone is a CE scenario. Retain past history and mark only its current knot explicit.
      const morphology = descriptor.urbanMorphology;
      morphology.baselinePopulation = population.targetPopulation;
      const current = morphology.populationKnots.find(k => k.year === morphology.baselineYear);
      if (current) {
        current.people = population.targetPopulation;
        current.source = "explicit";
      }
      morphology.contextRevision += `:ce-override:${population.targetPopulation}`;
    }
  }
  const resolvedSettings: GenerationSettings = {
    ...settings,
    population,
    descriptor,
    historicalPeriod: period,
    ...(fortress
      ? settings.townFortification?.streetPlan === "organic"
        ? { layout: "organic" as const }
        : { layout: undefined }
      : { layout: "organic" as const }),
    urbanCoreMode: "compact",
    urbanNPatches: undefined,
    ...(!descriptor ? { walledAreaShare: 1 } : {})
  };
  next = {
    ...next,
    populationPlan: { ...plan, extentMeters: next.frame.extentMeters },
    frame: {
      ...next.frame,
      cityRadiusMeters: plan.cityRadiusMeters,
      // Cells coarser than the 50 m street block keep that block in the fabric.
      ...(plan.cellWidthMeters > 75 ? { streetCellMeters: 50 } : {})
    }
  };
  delete next.populationReport;
  delete next.residentialClusters;
  return { document: next, settings: resolvedSettings };
}
