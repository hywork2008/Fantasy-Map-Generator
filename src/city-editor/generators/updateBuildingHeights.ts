import type { BuildingHeightPolicy } from "../types/contracts/buildingHeightPolicy";
import type { CityDocument } from "../types/document";
import { buildBlockFabric, documentFabricFingerprint } from "./blockInfill";
import { hasBuildingHeightLimits, inheritBuildingHeightLimits } from "./buildingHeightLimits";
import { hasBuildingHeightVariation } from "./buildingHeightPolicy";
import { finishPopulationHousing } from "./populationHousing";
import { planPopulation } from "./populationPlan";
import { measureHousingCapacity } from "./residentialCapacity";
import { ruralFieldOverlay, storeRuralFieldOverlay } from "./ruralFieldOverlay";

/** Explicit saved-city opt-in. Geometry in the document is retained; derived houses are rebuilt. */
export function withBuildingHeightPolicy(
  document: CityDocument,
  policy: BuildingHeightPolicy | undefined,
  previous: CityDocument = document
): CityDocument {
  const fingerprint = documentFabricFingerprint(previous);
  const fields = ruralFieldOverlay(previous, fingerprint);
  const next = { ...document, buildingHeightPolicy: policy ? { ...policy } : undefined };
  // A saved frame is fixed during this operation. Keep its old planning estimate if the
  // new conservative estimate would require a larger frame; actual capacity is measured below.
  if (next.populationPlan) {
    const old = next.populationPlan;
    const version = hasBuildingHeightVariation(next) ? 1 : hasBuildingHeightLimits(next) ? 2 : undefined;
    const estimate = planPopulation(
      { ...old.settings, frameMode: "auto" },
      old.period,
      old.extentMeters,
      version,
      version ? (old.areaScale ?? 1) : 1
    );
    if (estimate.cityRadiusMeters * 2 * 1.3 <= old.extentMeters)
      next.populationPlan = {
        ...estimate,
        settings: old.settings,
        extentMeters: old.extentMeters,
        housingFit: old.housingFit
      };
    else if (!version) next.populationPlan = { ...old, heightPolicyVersion: undefined };
  }
  if (next.fabric?.generation) {
    const generation = next.fabric.generation;
    next.fabric = {
      ...next.fabric,
      generation: {
        ...generation,
        input: withBuildingHeightPolicy(inheritBuildingHeightLimits(generation.input, next), policy),
        settings: {
          ...generation.settings,
          buildingHeightPolicy: next.buildingHeightPolicy,
          buildingHeightLimit: next.buildingHeightLimit
        }
      }
    };
  }
  if (fields) {
    const nextFingerprint = documentFabricFingerprint(next);
    if (previous.ruralFieldSnapshot?.fingerprint === fingerprint)
      next.ruralFieldSnapshot = { ...previous.ruralFieldSnapshot, fingerprint: nextFingerprint };
    storeRuralFieldOverlay(next, nextFingerprint, fields);
  }
  if (next.appearance === "town") {
    const fabric = buildBlockFabric(next);
    if (next.populationPlan) finishPopulationHousing(next, fabric);
    else if (next.urbanGrowth)
      next.housingCapacity = measureHousingCapacity(next, fabric.buildings, next.urbanGrowth.requiredDwellings);
  }
  return next;
}
