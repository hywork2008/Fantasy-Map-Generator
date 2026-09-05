import { parseRacePersonNameMapping, resolveRacePersonNameMapping } from "../data/racePersonNameConfig";
import { tip } from "../services/tooltipService";
import { generationProgressStore } from "../store/generationProgressState";
import {
  GENERATION_OPTION_KEYS,
  type GenerationOptions,
  getGenerationOptions,
  useOptionsState
} from "../store/optionsState";
import { BIOME_REGION_PROFILES } from "../types/biomeRegion";
import { isValidCanvasDimension, MIN_CANVAS_HEIGHT, MIN_CANVAS_WIDTH } from "../utils/canvasSize";
import { normalizeConflictAutonomy } from "../utils/conflictAutonomy";
import { downloadFile, getFileName } from "../utils/editorHelpers";
import { normalizeFrontierPolitySpacing, normalizeFrontierStartMode } from "../utils/frontierStartMode";
import { normalizeInitialPolityRealmSize } from "../utils/initialPolityScope";
import { normalizeInitialSettlementPattern } from "../utils/initialSettlementPattern";
import { VERSION } from "../versioning";

export const GENERATION_OPTIONS_KIND = "fmg-generation-options";

export interface GenerationOptionsExport {
  kind: typeof GENERATION_OPTIONS_KIND;
  version: string;
  exportedAt: string;
  options: GenerationOptions;
}

export type GenerationOptionsImportError = "invalidJson" | "invalidFormat" | "emptyOptions" | "busy";

export type GenerationOptionsImportResult =
  | { ok: true; options: Partial<GenerationOptions> }
  | { ok: false; error: GenerationOptionsImportError };

const HISTORICAL_PERIODS = [
  "earlyMedieval",
  "highMedieval",
  "lateMedieval",
  "ageOfExploration",
  "maritimeEra",
  "preIndustrialEra",
  "steamEra",
  "industrialChemistryEra",
  "petroleumEra",
  "rocketryEra"
] as const;
const TEMPLATE_RANDOMIZATIONS = ["all", "landRich", "oceanRich"] as const;
const ENCLOSURE_MODES = ["oceanCurrents", "oceanCurrentsAmbient", "radius"] as const;
const STATE_LABEL_MODES = ["auto", "short", "full"] as const;
const ECONOMY_START_MODES = ["provisioned", "balanced", "subsistence"] as const;
const RURAL_ECOSYSTEM_DETAILS = ["detailed", "simplified"] as const;
const THREAT_CALCULATIONS = ["additive", "max", "nonlinear"] as const;
const SETTLEMENT_PATTERNS = ["frontier", "marches", "scattered", "standard", "dense"] as const;
const FRONTIER_START_MODES = ["landOrigin", "seaborne"] as const;
const FRONTIER_SPACINGS = ["dispersed", "clustered"] as const;
const CONFLICT_AUTONOMIES = ["playerDirected", "autonomous"] as const;

const BOOLEAN_KEYS = [
  "gunpowderEraEnabled",
  "initialFirearmsUnstocked",
  "forceIndustrialCultures",
  "dangerEnabled"
] as const;

const STRING_KEYS = ["seed", "mapName", "era", "template", "culturesSet", "emblemShape"] as const;

const DANGER_TYPE_KEYS = ["dangerRarity5Type", "dangerRarity4Type", "dangerRarity3Type", "dangerRarity1Type"] as const;

const NUMBER_KEYS = [
  "mapWidth",
  "mapHeight",
  "points",
  "year",
  "cultures",
  "religionsNumber",
  "statesNumber",
  "provincesRatio",
  "sizeVariety",
  "growthRate",
  "manors",
  "resolveDepressionsSteps",
  "lakeElevationLimit",
  "volcanismChance",
  "volcanoActiveChance",
  "volcanicSoilStrength",
  "mapSize",
  "latitude",
  "longitude",
  "prec",
  "initialPopulationSaturation",
  "oikoumeneLandShare",
  "initialPolityRealmSize",
  "neutralRate",
  "statesGrowthRate",
  "diplomacyHistoryAttempts",
  "warFrequency",
  "ironDepositsPerState",
  "populationRate",
  "distanceScale",
  "urbanization",
  "urbanDensity",
  "dangerRarity5Min",
  "dangerRarity5Max",
  "dangerRarity5Power",
  "dangerRarity4Min",
  "dangerRarity4Max",
  "dangerRarity4Power",
  "dangerRarity3Min",
  "dangerRarity3Max",
  "dangerRarity3Power",
  "dangerRarity1Min",
  "dangerRarity1Max",
  "dangerRarity1Power"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asAllowedString<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Keep only known generation keys and drop values that cannot be applied safely. */
export function sanitizeGenerationOptions(raw: unknown): Partial<GenerationOptions> {
  if (!isRecord(raw)) return {};
  const updates: Partial<GenerationOptions> = {};

  for (const key of NUMBER_KEYS) {
    if (!(key in raw)) continue;
    const value = asFiniteNumber(raw[key]);
    if (value === undefined) continue;
    if (key === "mapWidth" && !isValidCanvasDimension(value, MIN_CANVAS_WIDTH)) continue;
    if (key === "mapHeight" && !isValidCanvasDimension(value, MIN_CANVAS_HEIGHT)) continue;
    if (key === "points") {
      const points = Math.round(value);
      if (points >= 1 && points <= 13) updates.points = points;
      continue;
    }
    if (key === "oikoumeneLandShare") {
      const share = value > 1 ? value / 100 : value;
      if (share >= 0.1 && share <= 0.95) updates.oikoumeneLandShare = share;
      continue;
    }
    if (key === "initialPolityRealmSize") {
      updates.initialPolityRealmSize = normalizeInitialPolityRealmSize(value);
      continue;
    }
    updates[key] = value;
  }

  for (const key of BOOLEAN_KEYS) {
    if (!(key in raw)) continue;
    const value = asBoolean(raw[key]);
    if (value !== undefined) updates[key] = value;
  }

  for (const key of STRING_KEYS) {
    if (!(key in raw)) continue;
    const value = asString(raw[key]);
    if (value !== undefined) updates[key] = value;
  }

  for (const key of DANGER_TYPE_KEYS) {
    if (!(key in raw)) continue;
    const value = asString(raw[key]);
    if (value !== undefined) updates[key] = value;
  }

  const historicalPeriod = asAllowedString(raw.historicalPeriod, HISTORICAL_PERIODS);
  if (historicalPeriod) updates.historicalPeriod = historicalPeriod;

  const templateRandomization = asAllowedString(raw.templateRandomization, TEMPLATE_RANDOMIZATIONS);
  if (templateRandomization) updates.templateRandomization = templateRandomization;

  const enclosureCalculationMode = asAllowedString(raw.enclosureCalculationMode, ENCLOSURE_MODES);
  if (enclosureCalculationMode) updates.enclosureCalculationMode = enclosureCalculationMode;

  const stateLabelsMode = asAllowedString(raw.stateLabelsMode, STATE_LABEL_MODES);
  if (stateLabelsMode) updates.stateLabelsMode = stateLabelsMode;

  const economyStartMode = asAllowedString(raw.economyStartMode, ECONOMY_START_MODES);
  if (economyStartMode) updates.economyStartMode = economyStartMode;

  const ruralEcosystemDetail = asAllowedString(raw.ruralEcosystemDetail, RURAL_ECOSYSTEM_DETAILS);
  if (ruralEcosystemDetail) updates.ruralEcosystemDetail = ruralEcosystemDetail;

  const threatCalculation = asAllowedString(raw.threatCalculation, THREAT_CALCULATIONS);
  if (threatCalculation) updates.threatCalculation = threatCalculation;

  if ("biomeRegionProfile" in raw) {
    const biomeRegionProfile = asAllowedString(raw.biomeRegionProfile, BIOME_REGION_PROFILES);
    if (biomeRegionProfile) updates.biomeRegionProfile = biomeRegionProfile;
  }

  if ("initialSettlementPattern" in raw) {
    const pattern = asAllowedString(raw.initialSettlementPattern, SETTLEMENT_PATTERNS);
    if (pattern) updates.initialSettlementPattern = normalizeInitialSettlementPattern(pattern);
  }

  if ("frontierStartMode" in raw) {
    const mode = asAllowedString(raw.frontierStartMode, FRONTIER_START_MODES);
    if (mode) updates.frontierStartMode = normalizeFrontierStartMode(mode);
  }

  if ("frontierPolitySpacing" in raw) {
    const spacing = asAllowedString(raw.frontierPolitySpacing, FRONTIER_SPACINGS);
    if (spacing) updates.frontierPolitySpacing = normalizeFrontierPolitySpacing(spacing);
  }

  if ("conflictAutonomy" in raw) {
    const autonomy = asAllowedString(raw.conflictAutonomy, CONFLICT_AUTONOMIES);
    if (autonomy) updates.conflictAutonomy = normalizeConflictAutonomy(autonomy);
  }

  if ("racePersonNameSpheres" in raw) {
    updates.racePersonNameSpheres = resolveRacePersonNameMapping(parseRacePersonNameMapping(raw.racePersonNameSpheres));
  }

  return updates;
}

export function parseGenerationOptionsExport(raw: string): GenerationOptionsImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalidJson" };
  }

  if (!isRecord(parsed) || parsed.kind !== GENERATION_OPTIONS_KIND || !isRecord(parsed.options)) {
    return { ok: false, error: "invalidFormat" };
  }

  const options = sanitizeGenerationOptions(parsed.options);
  if (Object.keys(options).length === 0) return { ok: false, error: "emptyOptions" };
  return { ok: true, options };
}

function persistImportedOptionLock<K extends keyof GenerationOptions>(key: K, value: GenerationOptions[K]): void {
  if (key === "racePersonNameSpheres") {
    localStorage.setItem(key, JSON.stringify(value));
  } else {
    localStorage.setItem(key, String(value));
  }
  document.dispatchEvent(new CustomEvent("fmg:lock-changed", { detail: { id: key, locked: true } }));
}

/** Write sanitized options into Zustand and lock them so the next generation keeps them. */
export function applyGenerationOptions(updates: Partial<GenerationOptions>): GenerationOptions {
  const store = useOptionsState.getState();
  store.setOptions(updates);
  const next = useOptionsState.getState();
  for (const key of GENERATION_OPTION_KEYS) {
    if (!Object.hasOwn(updates, key)) continue;
    persistImportedOptionLock(key, next[key]);
  }
  return getGenerationOptions(next);
}

export function importGenerationOptionsFromText(raw: string): GenerationOptionsImportResult {
  if (generationProgressStore.getState().isGenerating) return { ok: false, error: "busy" };
  const parsed = parseGenerationOptionsExport(raw);
  if (!parsed.ok) return parsed;
  applyGenerationOptions(parsed.options);
  return parsed;
}

export async function importGenerationOptionsFromFile(file: File): Promise<GenerationOptionsImportResult> {
  try {
    return importGenerationOptionsFromText(await file.text());
  } catch {
    return { ok: false, error: "invalidJson" };
  }
}

export function buildGenerationOptionsExport(now = new Date()): GenerationOptionsExport {
  return {
    kind: GENERATION_OPTIONS_KIND,
    version: VERSION,
    exportedAt: now.toISOString(),
    options: getGenerationOptions()
  };
}

/** Download the current Zustand generation options as a JSON file. */
export function exportGenerationOptions(): void {
  const fileName = `${getFileName("GenerationOptions")}.json`;
  downloadFile(JSON.stringify(buildGenerationOptionsExport(), null, 2), fileName, "application/json");
  tip(`${fileName} is saved. Open "Downloads" screen (CTRL + J) to check`, true, "success", 7000);
}
