import { getUrbanDwellings } from "../../utils/urbanDwellings";
import { residentialStoreys, supportsUrbanMorphology } from "../../utils/urbanMorphology";
import type { PopulationGenerationSettings, PopulationPlan } from "../types/contracts/population";
import { residentialHeightWeights, supportsBuildingHeightVariation } from "./buildingHeightPolicy";
import { dwellingCapacity } from "./residentialCapacity";

export class PopulationSettingError extends Error {
  constructor(
    message: string,
    readonly fields: string[]
  ) {
    super(message);
  }
}
export const DEFAULT_CITY_POPULATION = 5_000;
export const MAX_CITY_POPULATION = 220_000;
export function defaultPopulationSettings(population = DEFAULT_CITY_POPULATION): PopulationGenerationSettings {
  return {
    version: 1,
    source: "manual",
    targetPopulation: population,
    housingDisplay: "auto",
    frameMode: "auto",
    profileId: "medieval-v1",
    profileVersion: 1
  };
}
export const POPULATION_MESH_CELLS = [50, 100, 150, 200] as const;
export function validPopulationSettings(value: unknown): value is PopulationGenerationSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as PopulationGenerationSettings;
  return (
    v.version === 1 &&
    ["manual", "fmg", "ce-override"].includes(v.source) &&
    Number.isInteger(v.targetPopulation) &&
    v.targetPopulation >= 1 &&
    v.targetPopulation <= MAX_CITY_POPULATION &&
    ["auto", "detailed", "cluster-10", "cluster-20"].includes(v.housingDisplay) &&
    ["auto", "manual"].includes(v.frameMode) &&
    v.profileId === "medieval-v1" &&
    v.profileVersion === 1 &&
    (v.meshCellMeters === undefined || POPULATION_MESH_CELLS.includes(v.meshCellMeters))
  );
}
export function planPopulation(
  settings: PopulationGenerationSettings,
  period = "lateMedieval",
  manualExtent = 4800,
  heightPolicyVersion?: 1 | 2,
  areaScale = 1
): PopulationPlan {
  if (!validPopulationSettings(settings))
    throw new PopulationSettingError(
      "Population must be an integer from 1 to 220,000; unsupported population profile or settings.",
      ["population"]
    );
  if (!supportsUrbanMorphology(period))
    throw new PopulationSettingError(`Population generation does not support ${period}.`, ["historicalPeriod"]);
  const requiredDwellings = getUrbanDwellings(settings.targetPopulation);
  const storeys = residentialStoreys(period).standard;
  const low = Math.max(1, storeys - (storeys >= 3 ? 1 : 0));
  const meanCapacity =
    heightPolicyVersion === 1
      ? residentialHeightWeights(period, "ordinary").reduce(
          (sum, weight, index) => sum + weight * dwellingCapacity(80, index + 1),
          0
        )
      : (dwellingCapacity(80, low) + dwellingCapacity(80, storeys)) / 2;
  const estimatedBuildings = Math.ceil(requiredDwellings / meanCapacity);
  const residentialFootprintM2 = estimatedBuildings * 80;
  if (!Number.isFinite(areaScale) || areaScale < 1 || areaScale > 64)
    throw new PopulationSettingError("Invalid housing area scale.", ["housingAreaScale"]);
  const targetAreaM2 = (residentialFootprintM2 / 0.27) * areaScale;
  const cityRadiusMeters = Math.sqrt(targetAreaM2 / Math.PI);
  const neededExtent = Math.max(300, 2 * cityRadiusMeters * 1.3);
  if (settings.frameMode === "manual" && (!Number.isFinite(manualExtent) || manualExtent < neededExtent))
    throw new PopulationSettingError(`The map needs at least ${Math.ceil(neededExtent)} metres for this population.`, [
      "population",
      "frameMode",
      "frame"
    ]);
  const extentMeters =
    settings.frameMode === "manual"
      ? manualExtent
      : ([300, 600, 1200, 2400, 4800].find(n => n >= neededExtent) ?? Math.ceil(neededExtent / 100) * 100);
  const displayDwellings =
    settings.housingDisplay === "detailed"
      ? 1
      : settings.housingDisplay === "cluster-10"
        ? 10
        : settings.housingDisplay === "cluster-20"
          ? 20
          : requiredDwellings <= 2000
            ? 1
            : requiredDwellings <= 20000
              ? 10
              : 20;
  // Resolution is independent of display grouping, so changing it does not reroll the city.
  // The default 50 m cell at every size: more people add cells instead of coarsening them.
  // A coarser cell is an explicit choice; its fabric still draws 50 m street blocks.
  const cellWidthMeters = settings.meshCellMeters ?? 50;
  return {
    version: 1,
    ...(heightPolicyVersion !== undefined ? { heightPolicyVersion } : {}),
    ...(areaScale > 1 ? { areaScale } : {}),
    settings: structuredClone(settings),
    period,
    requiredDwellings,
    targetAreaM2,
    estimatedBuildings,
    residentialFootprintM2,
    cellWidthMeters,
    equivalent50mCells: targetAreaM2 / 2500,
    extentMeters,
    cityRadiusMeters,
    displayDwellings
  };
}
export function validPopulationPlan(value: unknown): value is PopulationPlan {
  if (!value || typeof value !== "object") return false;
  const v = value as PopulationPlan;
  if (v.version !== 1 || !validPopulationSettings(v.settings) || !supportsUrbanMorphology(v.period)) return false;
  if (v.heightPolicyVersion !== undefined && v.heightPolicyVersion !== 1 && v.heightPolicyVersion !== 2) return false;
  if (v.heightPolicyVersion === 1 && !supportsBuildingHeightVariation(v.period)) return false;
  if (
    v.areaScale !== undefined &&
    (!Number.isFinite(v.areaScale) || v.areaScale < 1 || v.areaScale > 64 || v.heightPolicyVersion === undefined)
  )
    return false;
  const fit = v.housingFit;
  if (
    fit !== undefined &&
    (!fit ||
      ![1, 2, 3].includes(fit.pass) ||
      !Number.isInteger(fit.storeys) ||
      fit.storeys < 1 ||
      fit.storeys > residentialStoreys(v.period).maximum ||
      ![400, 640].includes(fit.parcelAreaM2) ||
      (fit.exhausted !== undefined && typeof fit.exhausted !== "boolean"))
  )
    return false;
  try {
    const expected = planPopulation(v.settings, v.period, v.extentMeters, v.heightPolicyVersion, v.areaScale);
    return (
      [
        "requiredDwellings",
        "targetAreaM2",
        "estimatedBuildings",
        "residentialFootprintM2",
        "cellWidthMeters",
        "equivalent50mCells",
        "cityRadiusMeters",
        "displayDwellings"
      ].every(
        k => Math.abs(Number(v[k as keyof PopulationPlan]) - Number(expected[k as keyof PopulationPlan])) < 1e-6
      ) &&
      Number.isFinite(v.extentMeters) &&
      v.extentMeters >= Math.max(300, 2 * v.cityRadiusMeters * 1.3)
    );
  } catch {
    return false;
  }
}
