/**
 * Calendar-year gates shared by Economy's annual settlers.
 *
 * A single persisted record replaces the former collection of one-off
 * `<system>LastSettledYear` fields. The registry is deliberately calendar based:
 * `SimulationCadence` counts ticks, while a tick may span an arbitrary number of
 * days or years.
 *
 * docs/plan/economy-coupling-audit.md T2.
 */

import { getEconomySlice, getSimulationYear, registerContextFallbackReset } from "./economyApi";

export const ANNUAL_GATE = {
  settlementDevelopment: "settlementDevelopment",
  agTech: "agTech",
  industrialTech: "industrialTech",
  guildKnowledge: "guildKnowledge",
  guildChapters: "guildChapters",
  academyKnowledge: "academyKnowledge",
  stateSecret: "stateSecret",
  martialDiscipline: "martialDiscipline",
  martialIndividualMastery: "martialIndividualMastery",
  guildSuccession: "guildSuccession",
  burgTreasury: "burgTreasury",
  innFacilities: "innFacilities",
  urbanWater: "urbanWater",
  regionalWaterSchemes: "regionalWaterSchemes",
  steamInstallations: "steamInstallations",
  apothecaryWorkshops: "apothecaryWorkshops",
  experimentalWorkshops: "experimentalWorkshops",
  hospitalInstallations: "hospitalInstallations",
  acidPlants: "acidPlants",
  chlorinePlants: "chlorinePlants",
  phosphateFertilizerPlants: "phosphateFertilizerPlants",
  steelConverterPlants: "steelConverterPlants",
  fertilizerInvestment: "fertilizerInvestment",
  syntheticAmmoniaPlants: "syntheticAmmoniaPlants",
  nitrogenFertilizerInvestment: "nitrogenFertilizerInvestment",
  potashFertilizerInvestment: "potashFertilizerInvestment",
  powerStations: "powerStations",
  gasPowerStations: "gasPowerStations",
  telegraphLines: "telegraphLines",
  electrolysisPlants: "electrolysisPlants",
  chlorAlkaliPlants: "chlorAlkaliPlants",
  mercuryPlants: "mercuryPlants",
  oilRefineryPlants: "oilRefineryPlants",
  lngPlants: "lngPlants",
  coldStorageDepots: "coldStorageDepots",
  powerGridInvestment: "powerGridInvestment",
  dams: "dams",
  levees: "levees",
  faunaPopulation: "faunaPopulation",
  greatLibrary: "greatLibrary",
  climateDisasters: "climateDisasters",
  publicWorks: "publicWorks"
} as const;

export type AnnualGateKey = (typeof ANNUAL_GATE)[keyof typeof ANNUAL_GATE];
type AnnualGateYears = Record<string, number>;

/**
 * Legacy slice field → durable registry key. Kept only for idempotent save migration, so gates
 * introduced after T2 (which never had a pre-registry slice field) have no entry here.
 */
const LEGACY_GATE_FIELDS: Readonly<Partial<Record<AnnualGateKey, string>>> = {
  settlementDevelopment: "settlementDevelopmentLastEvaluatedYear",
  agTech: "agTechLastSettledYear",
  industrialTech: "industrialTechLastSettledYear",
  guildKnowledge: "guildKnowledgeLastSettledYear",
  guildChapters: "guildChaptersLastSettledYear",
  academyKnowledge: "academyKnowledgeLastSettledYear",
  stateSecret: "stateSecretLastSettledYear",
  martialDiscipline: "martialDisciplineLastSettledYear",
  martialIndividualMastery: "martialIndividualMasteryLastSettledYear",
  guildSuccession: "guildSuccessionLastSettledYear",
  burgTreasury: "burgTreasuryLastSettledYear",
  innFacilities: "innFacilitiesLastSettledYear",
  urbanWater: "urbanWaterLastSettledYear",
  regionalWaterSchemes: "regionalWaterSchemesLastSettledYear",
  steamInstallations: "steamInstallationsLastSettledYear",
  apothecaryWorkshops: "apothecaryWorkshopsLastSettledYear",
  experimentalWorkshops: "experimentalWorkshopsLastSettledYear",
  hospitalInstallations: "hospitalInstallationsLastSettledYear",
  acidPlants: "acidPlantsLastSettledYear",
  chlorinePlants: "chlorinePlantsLastSettledYear",
  phosphateFertilizerPlants: "phosphateFertilizerPlantsLastSettledYear",
  steelConverterPlants: "steelConverterPlantsLastSettledYear",
  fertilizerInvestment: "fertilizerInvestmentLastSettledYear",
  syntheticAmmoniaPlants: "syntheticAmmoniaPlantsLastSettledYear",
  nitrogenFertilizerInvestment: "nitrogenFertilizerInvestmentLastSettledYear",
  potashFertilizerInvestment: "potashFertilizerInvestmentLastSettledYear",
  powerStations: "powerStationsLastSettledYear",
  gasPowerStations: "gasPowerStationsLastSettledYear",
  telegraphLines: "telegraphLinesLastSettledYear",
  electrolysisPlants: "electrolysisPlantsLastSettledYear",
  chlorAlkaliPlants: "chlorAlkaliPlantsLastSettledYear",
  mercuryPlants: "mercuryPlantsLastSettledYear",
  oilRefineryPlants: "oilRefineryPlantsLastSettledYear",
  lngPlants: "lngPlantsLastSettledYear",
  coldStorageDepots: "coldStorageDepotsLastSettledYear",
  powerGridInvestment: "powerGridInvestmentLastSettledYear",
  dams: "damsLastSettledYear",
  levees: "leveesLastSettledYear",
  faunaPopulation: "faunaPopulationLastSettledYear",
  greatLibrary: "greatLibraryLastSettledYear",
  climateDisasters: "climateDisastersLastSettledYear"
};

let fallbackGateYears: AnnualGateYears = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Migrates a pre-T2 Economy slice in place. It is safe to call on every load/access:
 * existing registry entries win and all legacy fields are removed after being considered.
 */
export function migrateLegacyAnnualGateYears(slice: Record<string, unknown>): boolean {
  const existing = slice.annualGateYears;
  const years: AnnualGateYears = isRecord(existing) ? (existing as AnnualGateYears) : {};
  let changed = !isRecord(existing);

  for (const [key, legacyField] of Object.entries(LEGACY_GATE_FIELDS) as [AnnualGateKey, string][]) {
    if (!legacyField) continue;
    const legacyYear = slice[legacyField];
    if (typeof legacyYear === "number" && Number.isFinite(legacyYear) && years[key] === undefined) {
      years[key] = legacyYear;
      changed = true;
    }
    if (legacyField in slice) {
      delete slice[legacyField];
      changed = true;
    }
  }

  if (changed || !isRecord(existing)) slice.annualGateYears = years;
  return changed;
}

function getPersistedGateYears(): AnnualGateYears | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  migrateLegacyAnnualGateYears(slice);
  return slice.annualGateYears as AnnualGateYears;
}

export function getAnnualGateYear(key: string): number | null {
  const years = getPersistedGateYears() ?? fallbackGateYears;
  const year = years[key];
  return typeof year === "number" && Number.isFinite(year) ? year : null;
}

export function setAnnualGateYear(key: string, year: number): void {
  if (!Number.isFinite(year)) throw new Error(`Annual gate ${key} must be a finite year`);
  const years = getPersistedGateYears();
  if (years) years[key] = year;
  else fallbackGateYears[key] = year;
}

export function clearAnnualGateYear(key: string): void {
  const years = getPersistedGateYears();
  if (years) delete years[key];
  else delete fallbackGateYears[key];
}

/**
 * Claims the current calendar year for `key` and, when provided, runs the callback once.
 *
 * Settlers that need to return a richer result use the no-callback form as their guard;
 * simple callers can keep their complete annual body in `run`.
 */
export function settleAnnualOnce(key: string, run?: () => void): boolean {
  const year = getSimulationYear();
  if (getAnnualGateYear(key) === year) return false;
  setAnnualGateYear(key, year);
  run?.();
  return true;
}

registerContextFallbackReset(() => {
  fallbackGateYears = {};
});
