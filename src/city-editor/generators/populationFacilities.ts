import type { CityDocument } from "../types/document";
import type { GenerationSettings } from "../types/generation";
import { allocateBVFacilities } from "./allocateBVFacilities";
import { buildBlockFabric } from "./blockInfill";
import { buildPopulationFacilityRequests } from "./populationFacilityRequests";

const PREFIX = "population-facility:";
/** Generated reservations are recreated from the selected mode, never treated as manual geometry. */
export function withoutGeneratedFacilities(source: CityDocument): CityDocument {
  if (!source.facilityReport && !source.landmarks?.some(l => l.id.startsWith(PREFIX))) return source;
  return {
    ...source,
    facilityReport: undefined,
    landmarks: source.landmarks?.filter(l => !l.id.startsWith(PREFIX))
  };
}

export function populationFacilityRequests(population: number, settings: GenerationSettings) {
  return buildPopulationFacilityRequests(population, {
    period: settings.historicalPeriod ?? settings.descriptor?.historicalPeriod ?? "highMedieval",
    port: settings.descriptor?.burg.port ? true : settings.config.features.port
  });
}

/** Run once on the finished street geometry, before the existing housing fit. */
export function generatePopulationFacilities(source: CityDocument, settings: GenerationSettings): CityDocument {
  if (settings.facilityLayout !== "population") return source;
  const population = settings.population?.targetPopulation ?? settings.descriptor?.burg.population;
  if (!population || population < 1)
    return {
      ...source,
      facilityReport: {
        population: 0,
        required: 0,
        placed: 0,
        provisional: 0,
        sites: [],
        unplaced: [{ id: "population", reason: "population-required" }]
      }
    };
  const { requests } = populationFacilityRequests(Math.round(population), {
    ...settings,
    historicalPeriod: source.historicalPeriod ?? settings.historicalPeriod
  });
  const fabric = buildBlockFabric(source);
  const shared = { allowOutskirtsFields: true, deferHousing: true } as const;
  const greedy = allocateBVFacilities(source, fabric, requests, undefined, shared);
  const district = allocateBVFacilities(source, fabric, requests, undefined, { ...shared, preferDistricts: true });
  // A district-first plot can take the only site a later request can use.
  // Housing is measured once, on the kept document, by the caller.
  const allocation = greedy.placed.every(id => district.placed.includes(id)) ? district : greedy;
  const sites = requests
    .filter(r => allocation.placed.includes(r.id))
    .map(r => ({
      id: r.id,
      assetId: r.asset.id,
      areaM2: r.asset.referenceSizeMeters[0] * r.asset.referenceSizeMeters[1],
      zone: r.zone!,
      provisional: !r.asset.bvModel,
      riverbankMaxDistanceMeters: r.riverbankMaxDistanceMeters
    }));
  return {
    ...allocation.document,
    facilityReport: {
      population: Math.round(population),
      required: requests.length,
      placed: sites.length,
      provisional: sites.filter(s => s.provisional).length,
      sites,
      unplaced: allocation.unplaced
    }
  };
}
