import { growthRandom, residentialStoreys } from "../../utils/urbanMorphology";
import type { BuildingHeightPolicy } from "../types/contracts/buildingHeightPolicy";
import type { CityDocument } from "../types/document";
import { stableBuildingAppearanceId } from "./buildingAppearanceId";
import { maximumBuildingStoreys } from "./buildingHeightLimits";
import type { BuildingLot } from "./buildingLots.types";
import { polygonArea } from "./geom";
import { dwellingCapacity, isResidentialBuilding, residentialCapacity } from "./residentialCapacityFormula";

export const DEFAULT_BUILDING_HEIGHT_POLICY: BuildingHeightPolicy = { version: 1, profile: "european-medieval-v1" };
const PERIODS = new Set(["earlyMedieval", "highMedieval", "lateMedieval", "ageOfExploration"]);
const TRADITIONS = new Set([
  "latinWest",
  "latinMediterranean",
  "anglo",
  "gallic",
  "insularCeltic",
  "basque",
  "magyar",
  "norse",
  "finnic",
  "ruthenian",
  "hellenic",
  "roman"
]);

export function validBuildingHeightPolicy(value: unknown): value is BuildingHeightPolicy | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Partial<BuildingHeightPolicy>;
  return policy.version === 1 && policy.profile === "european-medieval-v1";
}

export function validHousingAreaSettings(value: { housingAreaScale?: unknown; housingAreaPasses?: unknown }): boolean {
  return (
    (value.housingAreaScale === undefined ||
      (typeof value.housingAreaScale === "number" &&
        Number.isFinite(value.housingAreaScale) &&
        value.housingAreaScale >= 1 &&
        value.housingAreaScale <= 64)) &&
    (value.housingAreaPasses === undefined ||
      (typeof value.housingAreaPasses === "number" &&
        Number.isInteger(value.housingAreaPasses) &&
        value.housingAreaPasses >= 0 &&
        value.housingAreaPasses <= 3))
  );
}

export function sameBuildingHeightPolicy(
  a: BuildingHeightPolicy | undefined,
  b: BuildingHeightPolicy | undefined
): boolean {
  return a?.version === b?.version && a?.profile === b?.profile;
}

export function heightPeriod(document: CityDocument): string {
  return (
    document.populationPlan?.period ??
    document.urbanMorphology?.period ??
    document.historicalPeriod ??
    "ageOfExploration"
  );
}

export function supportsBuildingHeightVariation(period: string, tradition?: string): boolean {
  return PERIODS.has(period) && (!tradition || TRADITIONS.has(tradition));
}

export function hasBuildingHeightVariation(document: CityDocument): boolean {
  return (
    document.buildingHeightPolicy?.version === 1 &&
    supportsBuildingHeightVariation(heightPeriod(document), document.civilization?.tradition)
  );
}

/** Probabilities are design defaults, not a census of medieval Europe. */
export function residentialHeightWeights(
  period: string,
  kind: "ordinary" | "commercial" | "rich" | "outside"
): readonly number[] {
  if (kind === "outside") return [0.35, 0.65];
  if (period === "earlyMedieval" || period === "highMedieval")
    return kind === "ordinary" ? [0.3, 0.6, 0.1] : [0.1, 0.65, 0.25];
  if (kind === "commercial") return [0, 0.3, 0.55, 0.15];
  if (kind === "rich") return [0, 0.3, 0.5, 0.2];
  return [0.1, 0.6, 0.25, 0.05];
}

function kindOf(document: CityDocument, lot: BuildingLot) {
  const face = document.mesh.faces[lot.faceId];
  if (face?.properties.settlement === "outskirts") return "outside";
  if (lot.archetype === "patrician-house" || lot.archetype === "elite-compound") return "rich";
  if (lot.archetype === "shop-house" || lot.archetype === "merchant-house") return "commercial";
  if (face?.properties.ward === "patriciate") return "rich";
  if (face?.properties.ward === "market" || face?.properties.ward === "merchant") return "commercial";
  return "ordinary";
}

export function buildingHeightKey(lot: BuildingLot): string {
  return lot.heightKey ?? stableBuildingAppearanceId(lot);
}

function seedOf(document: CityDocument): string {
  return `${document.generationSeed ?? document.fabric?.seed ?? "height"}:height-v1`;
}

export function sampleResidentialStoreys(document: CityDocument, lot: BuildingLot): number {
  const seed = seedOf(document);
  const key = buildingHeightKey(lot);
  const individual = growthRandom(`${seed}:${key}:independent`) < 0.15;
  const roll = growthRandom(individual ? `${seed}:${key}:storeys` : `${seed}:face:${lot.faceId}:storeys`);
  let cumulative = 0;
  const weights = residentialHeightWeights(heightPeriod(document), kindOf(document, lot));
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return maximumBuildingStoreys(document, lot, i + 1, true);
  }
  return maximumBuildingStoreys(document, lot, weights.length, true);
}

export function heightPriority(document: CityDocument, lot: BuildingLot): number {
  const kind = kindOf(document, lot);
  return (
    (kind === "commercial" ? 0 : kind === "rich" ? 0.2 : 0.4) +
    growthRandom(`${seedOf(document)}:${buildingHeightKey(lot)}:priority`) * 0.6
  );
}

export interface HeightUnit {
  key: string;
  storeys: number;
  maximum: number;
  priority: number;
  footprint: number;
  /** Identical physical houses represented by an existing coarse-display parcel. */
  count?: number;
  residentialShare?: number;
}

/** A deterministic queue of increments. Re-running at a larger demand only adds floors. */
export function fitResidentialHeightCapacity<T extends HeightUnit>(units: readonly T[], required: number): T[] {
  const result = units.map(unit => ({ ...unit }));
  let capacity = result.reduce(
    (n, unit) => n + (unit.count ?? 1) * dwellingCapacity(unit.footprint, unit.storeys, unit.residentialShare),
    0
  );
  const increments = result
    .flatMap((unit, index) => {
      const steps: Array<{ index: number; storeys: number; priority: number; key: string }> = [];
      let previous = dwellingCapacity(unit.footprint, unit.storeys, unit.residentialShare);
      for (let storeys = unit.storeys + 1; storeys <= unit.maximum; storeys++) {
        const next = dwellingCapacity(unit.footprint, storeys, unit.residentialShare);
        if (next > previous) steps.push({ index, storeys, priority: storeys + unit.priority, key: unit.key });
        previous = next;
      }
      return steps;
    })
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
  for (const step of increments) {
    if (capacity >= required) break;
    const unit = result[step.index];
    capacity +=
      (unit.count ?? 1) *
      (dwellingCapacity(unit.footprint, step.storeys, unit.residentialShare) -
        dwellingCapacity(unit.footprint, unit.storeys, unit.residentialShare));
    unit.storeys = step.storeys;
  }
  return result;
}

export function assignResidentialHeightDistribution(document: CityDocument, lots: BuildingLot[]): BuildingLot[] {
  return lots.map(lot => {
    if (lot.residentialCluster || !isResidentialBuilding(lot) || document.mesh.faces[lot.faceId]?.properties.locked)
      return lot;
    return {
      ...lot,
      heightKey: buildingHeightKey(lot),
      storeys: sampleResidentialStoreys(document, lot),
      residentialFloorShare: lot.residentialFloorShare ?? (lot.uses?.some(use => use !== "residential") ? 0.55 : 0.85)
    };
  });
}

/** Called after the outskirts mask, so ineligible suburban capacity cannot suppress core height. */
export function fitMorphologyHeightDistribution(document: CityDocument, lots: BuildingLot[]): BuildingLot[] {
  const growth = document.urbanGrowth;
  if (
    !hasBuildingHeightVariation(document) ||
    !growth ||
    growth.insideStoreys <= residentialStoreys(heightPeriod(document)).standard
  )
    return lots;
  let fixed = 0,
    outside = 0;
  const units: Array<HeightUnit & { index: number }> = [];
  lots.forEach((lot, index) => {
    const face = document.mesh.faces[lot.faceId];
    if (face?.properties.settlement === "outskirts") outside += residentialCapacity(lot);
    else if (face?.properties.settlement === "core") {
      if (face.properties.locked || lot.residentialCluster || !isResidentialBuilding(lot))
        fixed += residentialCapacity(lot);
      else
        units.push({
          index,
          key: buildingHeightKey(lot),
          storeys: lot.storeys ?? 1,
          maximum: maximumBuildingStoreys(
            document,
            lot,
            Math.min(growth.insideStoreys, residentialStoreys(heightPeriod(document)).maximum),
            true
          ),
          footprint: Math.abs(polygonArea(lot.polygon)),
          residentialShare: lot.residentialFloorShare,
          priority: heightPriority(document, lot)
        });
    }
  });
  const fitted = fitResidentialHeightCapacity(
    units,
    Math.max(0, growth.requiredDwellings - Math.min(outside, growth.outsideBudget, growth.outsideCap) - fixed)
  );
  const byIndex = new Map(fitted.map(unit => [unit.index, unit.storeys]));
  return lots.map((lot, index) => (byIndex.has(index) ? { ...lot, storeys: byIndex.get(index)! } : lot));
}
