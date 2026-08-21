/**
 * Urban water and sanitation (Phase 1–4).
 *
 * Owns simulation.extensions.economy.urbanWaterSystems and writes the host
 * civic score `burg.sanitation` (0–100).
 *
 * Phase 1: geography, demand, flood/mud/odor, cultural weights.
 * Phase 2: demand-signal-driven public works, maintenance vs construction, clogging.
 * Phase 3: institutions, organic pathways, intake/outfall mixing, river pollution.
 * Phase 4: waterLifting / municipalSanitation / sanitaryEngineering stocks,
 * tier 4–5 works, separate foul-water routes, interstate pollution compensation.
 *
 * Design: docs/plan/urban-water-and-sanitation-system.md §4–8, §11.
 */

import i18n from "../../../i18n";
import { useOptionsState } from "../../hostCore";
import type { Burg, CultureType } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getBurgProductionRecords,
  getGoods,
  getGuildKnowledgeStocks,
  getMarkets,
  getSimulationYear,
  getUrbanWaterLastSettledYear,
  getUrbanWaterSystems,
  getWorldContext,
  setUrbanWaterLastSettledYear,
  setUrbanWaterSystems
} from "../economyContext";
import { getAcademyBonus } from "./academyKnowledge";
import { computeNaturalFloodRisk } from "./floodHazard";
import { getComfortableTreasuryLevel } from "./guildTreasury";
import { Markets } from "./markets-generator";
import { waterTechRaceBiasFor } from "./raceWaterTechBias";
import { raceKeyForBurgState, raceKeyForBurgWaterworks } from "./resolveBurgCulture";
import {
  cleaningTaxRevenue,
  evolveInstitutions,
  healthPressureFromSanitation,
  irrigationPollutionPenalty,
  localMixedIntakeOutfall,
  pollutionExport,
  propagateRiverPollution,
  resolveOrganicPathways,
  tierDrinkingHealthBonus
} from "./urbanWaterInstitutions";
import { hasSameLandGravityWaterSource } from "./urbanWaterSupply";
import {
  applyPollutionDiplomaticAlert,
  buildInterstatePollutionEdges,
  canStartAdvancedProject,
  hasSeparateWastewaterRoute as computeSeparateWastewaterRoute,
  evolveWaterTechStocks,
  maxInvestableTier,
  projectForUpgrade as projectForUpgradeTech,
  projectMaterialNeedsPhase4,
  projectTreasuryCostPhase4,
  settlePollutionCompensation,
  targetTierForProject as targetTierForProjectTech,
  waterLiftingCapacityBonus
} from "./urbanWaterTech";
import type {
  CleansingMaterial,
  CulturalHygieneProfile,
  OrganicWasteRoute,
  UrbanWaterSystem,
  WaterDemandSignal,
  WaterDemandSignalId,
  WaterSanitationTier,
  WaterWorksProjectKind
} from "./urbanWaterTypes";
import {
  CLEANSING_MATERIALS,
  MAX_INVESTABLE_TIER,
  ORGANIC_WASTE_ROUTES,
  WATER_SANITATION_TIER_LABELS,
  WATER_WORKS_PROJECT_LABELS
} from "./urbanWaterTypes";

export { maxInvestableTier, waterTechCeilings } from "./urbanWaterTech";
export type {
  CulturalHygieneProfile,
  UrbanWaterSystem,
  WaterDemandSignal,
  WaterDemandSignalId,
  WaterSanitationTier,
  WaterWorksProjectKind
} from "./urbanWaterTypes";
export {
  ABSOLUTE_MAX_WATER_TIER,
  MAX_INVESTABLE_TIER,
  WATER_DEMAND_SIGNAL_LABELS,
  WATER_SANITATION_TIER_LABELS,
  WATER_WORKS_PROJECT_LABELS
} from "./urbanWaterTypes";

/** Inputs derived from map cells and burg attributes (pure, testable). */
export type BurgWaterGeography = {
  hasRiver: boolean;
  riverFlux: number;
  isWetland: boolean;
  isDry: boolean;
  isCoastal: boolean;
  precipitation: number;
  /** 0..1 local relief among neighbors (higher = more slope for gravity drainage). */
  slopeAdvantage: number;
  /** 0..1 flood-prone from low elevation + flux + wetland. */
  naturalFloodRisk: number;
  irrigationPotential: number;
};

/** Share of liquid burg treasury available for annual drain maintenance. */
export const WATER_MAINTENANCE_BUDGET_SHARE = 0.08;
/** Share of liquid burg treasury available for construction (separate from maintenance). */
export const WATER_CONSTRUCTION_BUDGET_SHARE = 0.12;
/** Minimum demand urgency to start or continue a public works project. */
export const WATER_PROJECT_URGENCY_THRESHOLD = 0.35;
/** Masonry guild stock needed before covered culverts (tier 3) may start. */
export const COVERED_CULVERT_MASONRY_STOCK_MIN = 0.15;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function asTier(value: number): WaterSanitationTier {
  const n = Math.max(0, Math.min(5, Math.floor(value)));
  return n as WaterSanitationTier;
}

function actualUrbanPeople(burg: Burg, populationRate: number, urbanization: number): number {
  return Math.max(0, burg.population ?? 0) * Math.max(0, populationRate) * Math.max(0, urbanization);
}

function normalizeWeights<T extends string>(raw: Record<T, number>, keys: readonly T[]): Record<T, number> {
  let sum = 0;
  for (const key of keys) sum += Math.max(0, raw[key] ?? 0);
  const out = {} as Record<T, number>;
  if (sum <= 0) {
    const even = 1 / keys.length;
    for (const key of keys) out[key] = even;
    return out;
  }
  for (const key of keys) out[key] = Math.max(0, raw[key] ?? 0) / sum;
  return out;
}

/**
 * Cultural cleansing / organic-waste weights by culture type (§8–9 of the design).
 * Phase 1 stores nothing permanent: profiles are recomputed for UI and waste modifiers.
 */
export function culturalHygieneProfile(cultureType: CultureType | string | undefined): CulturalHygieneProfile {
  const type = cultureType || "Generic";
  const cleansingRaw: Record<CleansingMaterial, number> = {
    water: 0.35,
    plant: 0.4,
    cloth: 0.15,
    paper: 0.05,
    sharedTool: 0.05
  };
  const wasteRaw: Record<OrganicWasteRoute, number> = {
    openDisposal: 0.28,
    cesspit: 0.22,
    nightSoilCollection: 0.12,
    managedComposting: 0.15,
    animalScavenging: 0.13,
    waterDischarge: 0.1
  };

  switch (type) {
    case "River":
    case "Lake":
      cleansingRaw.water = 0.5;
      cleansingRaw.plant = 0.3;
      wasteRaw.waterDischarge = 0.22;
      wasteRaw.nightSoilCollection = 0.18;
      wasteRaw.openDisposal = 0.18;
      wasteRaw.managedComposting = 0.18;
      break;
    case "Naval":
      cleansingRaw.water = 0.48;
      cleansingRaw.plant = 0.28;
      wasteRaw.waterDischarge = 0.28;
      wasteRaw.openDisposal = 0.22;
      wasteRaw.cesspit = 0.18;
      wasteRaw.animalScavenging = 0.12;
      break;
    case "Nomadic":
      cleansingRaw.water = 0.2;
      cleansingRaw.plant = 0.55;
      cleansingRaw.cloth = 0.15;
      wasteRaw.openDisposal = 0.4;
      wasteRaw.animalScavenging = 0.22;
      wasteRaw.cesspit = 0.1;
      wasteRaw.managedComposting = 0.12;
      wasteRaw.waterDischarge = 0.06;
      wasteRaw.nightSoilCollection = 0.1;
      break;
    case "Highland":
      cleansingRaw.water = 0.22;
      cleansingRaw.plant = 0.5;
      cleansingRaw.cloth = 0.18;
      wasteRaw.managedComposting = 0.28;
      wasteRaw.cesspit = 0.25;
      wasteRaw.openDisposal = 0.2;
      wasteRaw.waterDischarge = 0.08;
      break;
    case "Hunting":
      cleansingRaw.plant = 0.55;
      cleansingRaw.water = 0.25;
      wasteRaw.openDisposal = 0.35;
      wasteRaw.animalScavenging = 0.2;
      wasteRaw.managedComposting = 0.18;
      wasteRaw.cesspit = 0.15;
      break;
    default:
      break;
  }

  return {
    cleansing: normalizeWeights(cleansingRaw, CLEANSING_MATERIALS),
    organicWaste: normalizeWeights(wasteRaw, ORGANIC_WASTE_ROUTES)
  };
}

export function readBurgWaterGeography(args: {
  cellId: number;
  isPort: boolean;
  cells: {
    h?: ArrayLike<number>;
    r?: ArrayLike<number>;
    fl?: ArrayLike<number>;
    c?: ArrayLike<ArrayLike<number> | undefined>;
    biomeCode?: ArrayLike<number>;
    g?: ArrayLike<number>;
    haven?: ArrayLike<number>;
  };
  biomesTags: ReadonlyArray<ReadonlyArray<string> | undefined> | undefined;
  gridTemp?: ArrayLike<number>;
  gridPrec?: ArrayLike<number>;
}): BurgWaterGeography {
  const { cellId, cells } = args;
  const height = cells.h?.[cellId] ?? 50;
  const riverId = cells.r?.[cellId] ?? 0;
  const hasRiver = riverId > 0;
  const riverFlux = hasRiver ? Math.max(0, cells.fl?.[cellId] ?? 0) : 0;
  const biomeCode = cells.biomeCode?.[cellId] ?? 0;
  const tags = args.biomesTags?.[biomeCode] ?? [];
  const isWetland = tags.includes("wetland");
  const isDry = tags.includes("dry") || tags.includes("desert");
  const isCoastal = args.isPort || Boolean(cells.haven?.[cellId]);

  const gridCell = cells.g?.[cellId] ?? cellId;
  const precipitation = args.gridPrec?.[gridCell] ?? 45;

  const neighbors = cells.c?.[cellId];
  let maxDrop = 0;
  if (neighbors) {
    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i];
      if (n === undefined) continue;
      const nh = cells.h?.[n] ?? height;
      maxDrop = Math.max(maxDrop, height - nh, nh - height);
    }
  }
  // Height units are 0–100 style; ~8+ points of relief is strong local slope.
  const slopeAdvantage = clamp01(maxDrop / 12);

  const naturalFloodRisk = computeNaturalFloodRisk({
    cellId,
    cells,
    biomesTags: args.biomesTags,
    gridPrec: args.gridPrec
  });

  const irrigationPotential = isDry ? (hasRiver ? 0.75 : 0.15) : hasRiver ? 0.45 : isWetland ? 0.2 : 0.3;

  return {
    hasRiver,
    riverFlux,
    isWetland,
    isDry,
    isCoastal,
    precipitation,
    slopeAdvantage,
    naturalFloodRisk,
    irrigationPotential
  };
}

function workshopIntensity(burg: Burg): number {
  const records = getBurgProductionRecords(burg);
  if (!records.length) {
    const people = Math.max(1, burg.population ?? 0);
    return clamp01((burg.product ?? 0) / (people * 40));
  }
  let active = 0;
  for (const record of records) {
    if ("units" in record && (record.units ?? 0) > 0) active += 1;
    else if ("dealId" in record) active += 0.5;
  }
  return clamp01(active / 10);
}

function pigScavengingShare(burg: Burg): number {
  const marketId = burg.market ?? 0;
  if (!marketId) return 0;
  const market = getMarkets().find(m => m.i === marketId);
  if (!market?.goods) return 0;
  const pig = getGoods().find(g => g.name === "Pig");
  if (!pig) return 0;
  const heads = market.goods[pig.i]?.stock ?? 0;
  const people = Math.max(1, actualUrbanPeople(burg, getWorldContext().populationRate, getWorldContext().urbanization));
  return clamp01(heads / (people / 80));
}

function masonryGuildStock(burgId: number): number {
  return getGuildKnowledgeStocks().find(entry => entry.burgId === burgId && entry.domain === "masonry")?.stock ?? 0;
}

/** Baseline capacities for a tier before maintenance, clogging, and geography modifiers. */
export function tierBaseCapacities(tier: WaterSanitationTier): {
  stormwater: number;
  wastewater: number;
  service: number;
  irrigation: number;
  drinking: number;
} {
  switch (tier) {
    case 0:
      return { stormwater: 0.18, wastewater: 0.12, service: 0.25, irrigation: 0.15, drinking: 0.45 };
    case 1:
      return { stormwater: 0.4, wastewater: 0.22, service: 0.35, irrigation: 0.3, drinking: 0.5 };
    case 2:
      return { stormwater: 0.62, wastewater: 0.38, service: 0.48, irrigation: 0.42, drinking: 0.55 };
    case 3:
      return { stormwater: 0.78, wastewater: 0.55, service: 0.58, irrigation: 0.5, drinking: 0.58 };
    case 4:
      return { stormwater: 0.88, wastewater: 0.72, service: 0.7, irrigation: 0.55, drinking: 0.72 };
    case 5:
      return { stormwater: 0.95, wastewater: 0.9, service: 0.88, irrigation: 0.65, drinking: 0.9 };
  }
}

/**
 * Initial tier from geography and settlement size (generation only assigns 0–2).
 * Large river / wetland / dry-irrigation towns start with more drainage practice.
 */
export function initialTier(args: {
  people: number;
  geography: BurgWaterGeography;
  isCapital: boolean;
  hasMarket: boolean;
}): WaterSanitationTier {
  const { people, geography, isCapital, hasMarket } = args;
  let score = 0;
  if (people >= 800) score += 1;
  if (people >= 4000) score += 1;
  if (people >= 15000) score += 1;
  if (geography.hasRiver) score += 1;
  if (geography.isWetland) score += 1;
  if (geography.isDry && geography.hasRiver) score += 1;
  if (geography.naturalFloodRisk >= 0.45) score += 1;
  if (isCapital) score += 1;
  if (hasMarket && people >= 1500) score += 1;
  if (geography.slopeAdvantage < 0.15 && !geography.hasRiver) score -= 1;

  if (score >= 5) return 2;
  if (score >= 2) return 1;
  return 0;
}

/** Project that raises tier from `fromTier` toward `maxTier` (tech-gated). */
export function projectForUpgrade(
  fromTier: WaterSanitationTier,
  maxTier: WaterSanitationTier = MAX_INVESTABLE_TIER
): WaterWorksProjectKind | null {
  return projectForUpgradeTech(fromTier, maxTier);
}

export function targetTierForProject(project: WaterWorksProjectKind): WaterSanitationTier | null {
  return targetTierForProjectTech(project);
}

/**
 * Demand signals that justify waterworks investment (§4.2).
 * Pure function of current metrics + geography + settlement size.
 */
export function evaluateWaterDemandSignals(args: {
  geography: BurgWaterGeography;
  people: number;
  workshops: number;
  floodExposure: number;
  muddiness: number;
  odor: number;
  waterContamination: number;
  sanitationBurden: number;
  stormDeficit: number;
  wasteDeficit: number;
  irrigationCapacity: number;
  serviceWaterCapacity: number;
  hasMarket: boolean;
}): WaterDemandSignal[] {
  const {
    geography,
    people,
    workshops,
    floodExposure,
    muddiness,
    odor,
    waterContamination,
    sanitationBurden,
    stormDeficit,
    wasteDeficit,
    irrigationCapacity,
    serviceWaterCapacity,
    hasMarket
  } = args;
  const popFactor = clamp01(people / 12000);

  const signals: WaterDemandSignal[] = [
    {
      id: "floodMud",
      strength: clamp01(
        floodExposure * 0.55 + muddiness * 0.35 + stormDeficit * 0.35 + geography.naturalFloodRisk * 0.2
      )
    },
    {
      id: "wetlandExpansion",
      strength: clamp01(
        (geography.isWetland ? 0.45 : 0) +
          popFactor * 0.35 +
          (hasMarket ? 0.15 : 0) +
          stormDeficit * 0.2 +
          geography.naturalFloodRisk * 0.15
      )
    },
    {
      id: "irrigationDrain",
      strength: clamp01(
        geography.irrigationPotential * 0.5 +
          (geography.isDry && geography.hasRiver ? 0.35 : 0) +
          Math.max(0, geography.irrigationPotential - irrigationCapacity) * 0.4
      )
    },
    {
      id: "workshopEffluent",
      strength: clamp01(workshops * 0.7 + wasteDeficit * 0.4 + (hasMarket ? 0.1 : 0) + odor * 0.15)
    },
    {
      id: "densityOdor",
      strength: clamp01(popFactor * 0.45 + odor * 0.4 + sanitationBurden * 0.35)
    },
    {
      id: "waterContamination",
      strength: clamp01(waterContamination * 0.75 + wasteDeficit * 0.25 + (geography.isWetland ? 0.1 : 0))
    },
    {
      id: "droughtService",
      strength: clamp01(
        (geography.isDry ? 0.4 : 0) +
          clamp01((20 - geography.precipitation) / 20) * 0.45 +
          Math.max(0, 0.45 - serviceWaterCapacity) * 0.4
      )
    }
  ];
  return signals;
}

export function primaryDemandSignal(signals: readonly WaterDemandSignal[]): WaterDemandSignal | null {
  let best: WaterDemandSignal | null = null;
  for (const signal of signals) {
    if (!best || signal.strength > best.strength) best = signal;
  }
  return best && best.strength > 0 ? best : null;
}

/** Whether a project is eligible given geography, guild skill, tech stocks, and outfall. */
export function canStartProject(args: {
  project: WaterWorksProjectKind;
  geography: BurgWaterGeography;
  masonryStock: number;
  people: number;
  waterLifting?: number;
  municipalSanitation?: number;
  sanitaryEngineering?: number;
  connectionPermitCoverage?: number;
  dischargeRegulation?: number;
  administrationBonus?: number;
}): boolean {
  const { project, geography, masonryStock, people } = args;
  if (people < 80 && project !== "openDitches" && project !== "waterLiftingWorks") return false;
  switch (project) {
    case "openDitches":
      return geography.slopeAdvantage >= 0.05 || geography.hasRiver || geography.isWetland || geography.isCoastal;
    case "stoneDrains":
      return geography.slopeAdvantage >= 0.08 || geography.hasRiver || geography.isCoastal;
    case "coveredCulverts":
      return (
        masonryStock >= COVERED_CULVERT_MASONRY_STOCK_MIN &&
        (geography.hasRiver || geography.isCoastal) &&
        (geography.slopeAdvantage >= 0.1 || geography.isWetland)
      );
    case "managedSewers":
    case "sanitarySeparation":
    case "waterLiftingWorks":
      return canStartAdvancedProject({
        project,
        masonryStock,
        waterLifting: args.waterLifting ?? 0,
        municipalSanitation: args.municipalSanitation ?? 0,
        sanitaryEngineering: args.sanitaryEngineering ?? 0,
        connectionPermitCoverage: args.connectionPermitCoverage ?? 0,
        dischargeRegulation: args.dischargeRegulation ?? 0,
        administrationBonus: args.administrationBonus ?? 1,
        hasRiver: geography.hasRiver,
        hasOutfall: geography.hasRiver || geography.isCoastal,
        people
      });
  }
}

/** Treasury cash cost to fully complete a project (materials charged separately). */
export function projectTreasuryCost(project: WaterWorksProjectKind, people: number): number {
  const late = projectTreasuryCostPhase4(project, people);
  if (late > 0) return late;
  const scale = 0.55 + clamp01(people / 15000) * 1.45;
  switch (project) {
    case "openDitches":
      return rn(40 * scale, 2);
    case "stoneDrains":
      return rn(120 * scale, 2);
    case "coveredCulverts":
      return rn(280 * scale, 2);
    default:
      return 0;
  }
}

/** Material units requested for a full project (Stone / Tools / Brick). */
export function projectMaterialNeeds(
  project: WaterWorksProjectKind,
  people: number
): {
  stone: number;
  tools: number;
  brick: number;
} {
  const late = projectMaterialNeedsPhase4(project, people);
  if (late.stone + late.tools + late.brick > 0) return late;
  const scale = 0.5 + clamp01(people / 15000);
  switch (project) {
    case "openDitches":
      return { stone: rn(2 * scale, 2), tools: rn(4 * scale, 2), brick: 0 };
    case "stoneDrains":
      return { stone: rn(18 * scale, 2), tools: rn(8 * scale, 2), brick: rn(4 * scale, 2) };
    case "coveredCulverts":
      return { stone: rn(36 * scale, 2), tools: rn(12 * scale, 2), brick: rn(14 * scale, 2) };
    default:
      return { stone: 0, tools: 0, brick: 0 };
  }
}

/** Annual maintenance cash need for the installed tier and clogging. */
export function annualMaintenanceNeed(args: {
  tier: WaterSanitationTier;
  people: number;
  clogging: number;
  product: number;
}): number {
  const { tier, people, clogging, product } = args;
  if (tier <= 0) {
    // Individual handling still needs well / cesspit labor.
    return rn(Math.max(2, people * 0.0004 + product * 0.005), 2);
  }
  const base = people * (0.0012 + tier * 0.0009) + product * (0.01 + tier * 0.004);
  return rn(base * (1 + clogging * 0.75), 2);
}

/**
 * Update maintenance condition and clogging from paid coverage and demand deficits.
 * Pure; used by settle and tests.
 */
export function applyMaintenanceYear(args: {
  maintenanceCondition: number;
  clogging: number;
  coverage: number;
  stormDeficit: number;
  wasteDeficit: number;
  tier: WaterSanitationTier;
}): { maintenanceCondition: number; clogging: number } {
  const { coverage, stormDeficit, wasteDeficit, tier } = args;
  let { maintenanceCondition, clogging } = args;

  // Paid maintenance repairs structure; underfunding decays it.
  maintenanceCondition = clamp01(maintenanceCondition + (coverage - 0.55) * 0.12 + (tier >= 2 ? 0.01 : 0));
  if (coverage < 0.4) maintenanceCondition = clamp01(maintenanceCondition - (0.4 - coverage) * 0.1);

  // Deficits and neglect clog channels; good maintenance digs them out.
  const clogPressure = stormDeficit * 0.2 + wasteDeficit * 0.25 + (1 - coverage) * 0.12;
  const unclog = coverage * 0.18 + (tier >= 2 ? 0.03 : 0);
  clogging = clamp01(clogging + clogPressure - unclog);

  // Catastrophic neglect slowly undermines higher tiers' effective operation via condition.
  if (coverage < 0.15 && tier >= 2) {
    maintenanceCondition = clamp01(maintenanceCondition - 0.04);
  }

  return {
    maintenanceCondition: rn(maintenanceCondition, 4),
    clogging: rn(clogging, 4)
  };
}

export function computeUrbanWaterSystem(args: {
  burg: Burg;
  geography: BurgWaterGeography;
  people: number;
  cultureType: CultureType | string | undefined;
  ambientTemperature?: number;
  /** Preserve tier / maintenance / investment across annual refreshes when provided. */
  previous?: UrbanWaterSystem | null;
  /** Override maintenance after budget settlement (Phase 2). */
  maintenanceCondition?: number;
  clogging?: number;
  tier?: WaterSanitationTier;
  upgradeProgress?: number;
  activeProject?: WaterWorksProjectKind | null;
  primaryDemandSignal?: WaterDemandSignalId | null;
  demandUrgency?: number;
  lastMaintenanceCoverage?: number;
  lastMaintenanceSpend?: number;
  lastConstructionSpend?: number;
  connectionPermitCoverage?: number;
  cleaningTaxRate?: number;
  dischargeRegulation?: number;
  lastCleaningTaxRevenue?: number;
  upstreamPollutionImport?: number;
  waterLifting?: number;
  municipalSanitation?: number;
  sanitaryEngineering?: number;
  lastPollutionCompensationPaid?: number;
  lastPollutionCompensationReceived?: number;
  pollutionDiplomaticStrain?: number;
}): UrbanWaterSystem {
  const { burg, geography, people, cultureType, previous } = args;
  const hasMarket = (burg.market ?? 0) > 0;
  const tier: WaterSanitationTier =
    args.tier ??
    previous?.tier ??
    initialTier({
      people,
      geography,
      isCapital: Boolean(burg.capital),
      hasMarket
    });

  const maintenanceCondition =
    args.maintenanceCondition ??
    previous?.maintenanceCondition ??
    clamp01(0.72 + tier * 0.06 + geography.slopeAdvantage * 0.08);
  const clogging = args.clogging ?? previous?.clogging ?? 0;
  const connectionPermitCoverage = args.connectionPermitCoverage ?? previous?.connectionPermitCoverage ?? 0;
  const cleaningTaxRate = args.cleaningTaxRate ?? previous?.cleaningTaxRate ?? 0;
  const dischargeRegulation = args.dischargeRegulation ?? previous?.dischargeRegulation ?? 0;
  const upstreamPollutionImport = args.upstreamPollutionImport ?? previous?.upstreamPollutionImport ?? 0;
  const waterLifting = args.waterLifting ?? previous?.waterLifting ?? 0;
  const municipalSanitation = args.municipalSanitation ?? previous?.municipalSanitation ?? 0;
  const sanitaryEngineering = args.sanitaryEngineering ?? previous?.sanitaryEngineering ?? 0;
  const hasInheritedRomanWaterworks = previous?.hasInheritedRomanWaterworks ?? false;
  const hasRegionalRomanConnection =
    hasInheritedRomanWaterworks && hasSameLandGravityWaterSource(burg, getWorldContext().pack.cells);

  const base = tierBaseCapacities(tier);
  const maint = clamp01(maintenanceCondition);
  const lifting = waterLiftingCapacityBonus(waterLifting);
  const clearFactor = 1 - clamp01(clogging) * 0.65;

  const stormwaterDrainageCapacity = clamp01(
    base.stormwater * maint * clearFactor * (0.75 + geography.slopeAdvantage * 0.4)
  );
  // Connection permits + municipal sanitation raise effective wastewater handling.
  const permitBoost = 1 + connectionPermitCoverage * 0.12 + municipalSanitation * 0.08;
  const wastewaterCapacity = clamp01(base.wastewater * maint * clearFactor * permitBoost);
  const serviceWaterCapacity = clamp01(
    base.service *
      maint *
      (geography.hasRiver || geography.isCoastal || hasRegionalRomanConnection ? 1.1 : 0.85) *
      lifting.service
  );
  let irrigationCapacity = clamp01(base.irrigation * maint * geography.irrigationPotential * 1.2 * lifting.irrigation);
  const drinkingBase =
    base.drinking *
    (geography.hasRiver || geography.isCoastal || hasRegionalRomanConnection ? 1.05 : geography.isDry ? 0.75 : 0.95) *
    lifting.drinking;

  const popFactor = clamp01(people / 12000);
  const rainFactor = clamp01(geography.precipitation / 90);
  const workshops = workshopIntensity(burg);
  // Ports concentrate baths, crews, and craft wastewater.
  const portLoad = burg.port ? 0.1 : 0;
  const stormwaterDemand = clamp01(0.15 + popFactor * 0.45 + rainFactor * 0.35 + geography.naturalFloodRisk * 0.25);
  const wastewaterDemand = clamp01(0.12 + popFactor * 0.55 + workshops * 0.3 + (hasMarket ? 0.08 : 0) + portLoad);

  const stormDeficit = Math.max(0, stormwaterDemand - stormwaterDrainageCapacity);
  const wasteDeficit = Math.max(0, wastewaterDemand - wastewaterCapacity);

  const profile = culturalHygieneProfile(cultureType);
  const pigs = pigScavengingShare(burg);
  const ambientTemperature =
    args.ambientTemperature ??
    (() => {
      const packCells = getWorldContext().pack?.cells;
      const gridCell = packCells?.g?.[burg.cell] ?? burg.cell;
      return getWorldContext().grid?.cells?.temp?.[gridCell] ?? 12;
    })();

  const organic = resolveOrganicPathways({
    profile,
    people,
    ambientTemperature,
    tier,
    isCapital: Boolean(burg.capital),
    isPort: Boolean(burg.port),
    pigScavenging: pigs,
    connectionPermitCoverage,
    irrigationCapacity
  });

  // Night-soil / compost return slightly supports near-burg irrigation utility.
  irrigationCapacity = clamp01(irrigationCapacity * (1 + organic.fertilizerReturn * 0.12));
  irrigationCapacity = irrigationPollutionPenalty(upstreamPollutionImport, irrigationCapacity);

  const hasDownstreamOutfall = geography.hasRiver || geography.isCoastal || hasRegionalRomanConnection;
  const hasUpstreamIntake = (geography.hasRiver && !geography.isWetland) || hasRegionalRomanConnection;
  const hasSeparateWastewaterRoute = computeSeparateWastewaterRoute({ tier, sanitaryEngineering });
  const mixedLocal = localMixedIntakeOutfall({
    hasRiver: geography.hasRiver,
    hasSeparateWastewaterRoute,
    dischargeRegulation
  });

  const mixedUsePenalty = mixedLocal
    ? 0.18 + organic.waterDischargeShare * 0.28 * (1 - dischargeRegulation * 0.7)
    : organic.waterDischargeShare * 0.05 * (1 - sanitaryEngineering * 0.5);

  // Sanitary engineering treats / dilutes export and protects intake when separate.
  const treatmentFactor = 1 - sanitaryEngineering * 0.45 - (hasSeparateWastewaterRoute ? 0.15 : 0);

  const waterContamination = clamp01(
    wasteDeficit * 0.4 +
      organic.openDisposalShare * 0.18 +
      mixedUsePenalty +
      organic.scavengingRisk * 0.12 +
      (geography.isWetland ? 0.1 : 0) +
      clogging * 0.08 +
      upstreamPollutionImport * 0.35 * (1 - sanitaryEngineering * 0.2) -
      (hasUpstreamIntake && !mixedLocal ? 0.14 : hasUpstreamIntake ? 0.05 : 0) -
      connectionPermitCoverage * 0.06 -
      dischargeRegulation * 0.08 -
      sanitaryEngineering * 0.1
  );

  const sanitationBurden = clamp01(
    0.18 +
      wasteDeficit * 0.5 +
      stormDeficit * 0.18 +
      organic.organicStreetLoad * 0.35 +
      workshops * 0.08 +
      popFactor * 0.12 +
      portLoad * 0.05 -
      organic.fertilizerReturn * 0.1 -
      organic.scavengingRelief * 0.12 -
      connectionPermitCoverage * 0.08 -
      tier * 0.03 +
      clogging * 0.1
  );

  const floodExposure = clamp01(
    geography.naturalFloodRisk * 0.65 + stormDeficit * 0.45 - stormwaterDrainageCapacity * 0.25
  );
  const muddiness = clamp01(stormDeficit * 0.55 + rainFactor * 0.25 + (geography.isWetland ? 0.2 : 0) - tier * 0.05);
  const odor = clamp01(
    sanitationBurden * 0.45 +
      wasteDeficit * 0.25 +
      organic.organicStreetLoad * 0.25 +
      organic.scavengingRisk * 0.1 +
      clogging * 0.1
  );

  const tierDrinkBonus = tierDrinkingHealthBonus({
    tier,
    localMixed: mixedLocal,
    dischargeRegulation,
    hasUpstreamIntake
  });
  const drinkingWaterSecurity = clamp01(
    (drinkingBase + tierDrinkBonus) *
      maint *
      (1 - waterContamination * 0.55) *
      (geography.isDry && !geography.hasRiver ? 0.7 : 1) *
      (1 - upstreamPollutionImport * 0.25)
  );

  const exportLoad = clamp01(
    pollutionExport({
      wasteDeficit,
      waterDischargeShare: organic.waterDischargeShare,
      openDisposalShare: organic.openDisposalShare,
      dischargeRegulation,
      hasDownstreamOutfall,
      people
    }) * Math.max(0.15, treatmentFactor)
  );
  const coalSmokeExposure =
    getMarkets().find(market => market.i === burg.market)?.heatingLedger?.coalSmokeExposure ?? 0;

  const healthPressure = healthPressureFromSanitation({
    waterContamination,
    sanitationBurden,
    organicStreetLoad: organic.organicStreetLoad,
    scavengingRisk: organic.scavengingRisk,
    upstreamPollutionImport,
    drinkingWaterSecurity,
    coalSmokeExposure
  });

  const signals = evaluateWaterDemandSignals({
    geography,
    people,
    workshops,
    floodExposure,
    muddiness,
    odor,
    waterContamination,
    sanitationBurden,
    stormDeficit,
    wasteDeficit,
    irrigationCapacity,
    serviceWaterCapacity,
    hasMarket
  });
  const primary = primaryDemandSignal(signals);

  return {
    burgId: burg.i!,
    tier,
    drinkingWaterSecurity: rn(drinkingWaterSecurity, 4),
    serviceWaterCapacity: rn(serviceWaterCapacity, 4),
    irrigationCapacity: rn(irrigationCapacity, 4),
    stormwaterDrainageCapacity: rn(stormwaterDrainageCapacity, 4),
    wastewaterCapacity: rn(wastewaterCapacity, 4),
    maintenanceCondition: rn(maintenanceCondition, 4),
    sanitationBurden: rn(sanitationBurden, 4),
    waterContamination: rn(waterContamination, 4),
    floodExposure: rn(floodExposure, 4),
    muddiness: rn(muddiness, 4),
    odor: rn(odor, 4),
    hasUpstreamIntake,
    hasDownstreamOutfall,
    hasInheritedRomanWaterworks,
    hasSeparateWastewaterRoute,
    stormwaterDemand: rn(stormwaterDemand, 4),
    wastewaterDemand: rn(wastewaterDemand, 4),
    clogging: rn(clogging, 4),
    upgradeProgress: rn(args.upgradeProgress ?? previous?.upgradeProgress ?? 0, 4),
    activeProject: args.activeProject ?? previous?.activeProject ?? null,
    primaryDemandSignal: args.primaryDemandSignal ?? primary?.id ?? null,
    demandUrgency: rn(args.demandUrgency ?? primary?.strength ?? 0, 4),
    lastMaintenanceCoverage: rn(args.lastMaintenanceCoverage ?? previous?.lastMaintenanceCoverage ?? 1, 4),
    lastMaintenanceSpend: rn(args.lastMaintenanceSpend ?? previous?.lastMaintenanceSpend ?? 0, 2),
    lastConstructionSpend: rn(args.lastConstructionSpend ?? previous?.lastConstructionSpend ?? 0, 2),
    connectionPermitCoverage: rn(connectionPermitCoverage, 4),
    cleaningTaxRate: rn(cleaningTaxRate, 4),
    dischargeRegulation: rn(dischargeRegulation, 4),
    lastCleaningTaxRevenue: rn(args.lastCleaningTaxRevenue ?? previous?.lastCleaningTaxRevenue ?? 0, 2),
    organicStreetLoad: organic.organicStreetLoad,
    compostingEfficiency: organic.compostingEfficiency,
    pigToiletPractice: organic.pigToiletPractice,
    upstreamPollutionImport: rn(upstreamPollutionImport, 4),
    downstreamPollutionExport: rn(exportLoad, 4),
    coalSmokeExposure: rn(coalSmokeExposure, 4),
    healthPressure: rn(healthPressure, 4),
    localMixedIntakeOutfall: mixedLocal,
    waterLifting: rn(waterLifting, 4),
    municipalSanitation: rn(municipalSanitation, 4),
    sanitaryEngineering: rn(sanitaryEngineering, 4),
    lastPollutionCompensationPaid: rn(
      args.lastPollutionCompensationPaid ?? previous?.lastPollutionCompensationPaid ?? 0,
      2
    ),
    lastPollutionCompensationReceived: rn(
      args.lastPollutionCompensationReceived ?? previous?.lastPollutionCompensationReceived ?? 0,
      2
    ),
    pollutionDiplomaticStrain: rn(args.pollutionDiplomaticStrain ?? previous?.pollutionDiplomaticStrain ?? 0, 4)
  };
}

/** Map UrbanWaterSystem metrics to the host 0–100 civic sanitation score. */
export function sanitationScoreFromSystem(system: UrbanWaterSystem): number {
  const score =
    system.drinkingWaterSecurity * 34 +
    (1 - system.sanitationBurden) * 24 +
    (1 - system.waterContamination) * 18 +
    (1 - system.floodExposure) * 7 +
    (1 - system.odor) * 5 +
    (1 - system.healthPressure) * 12;
  return Math.max(0, Math.min(100, rn(score, 1)));
}

/**
 * Water-quality-specific civic score, independent of `sanitation`'s broader blend (waste
 * disposal, flood, odor). Extracts just the two water-supply sub-signals sanitationScoreFromSystem
 * already computes, at the same 34:18 ratio (rescaled to 60:40) — no new raw data.
 * Design: docs/plan/epidemic-cholera-and-water-security.md §3.1.
 */
export function waterSecurityScoreFromSystem(system: UrbanWaterSystem): number {
  const score = system.drinkingWaterSecurity * 60 + (1 - system.waterContamination) * 40;
  return Math.max(0, Math.min(100, rn(score, 1)));
}

export function getUrbanWaterSystemForBurg(burgId: number): UrbanWaterSystem | undefined {
  return getUrbanWaterSystems().find(system => system.burgId === burgId);
}

export function formatUrbanWaterSummary(system: UrbanWaterSystem): string {
  const tierLabel = i18n.t(`economy.water.tiers.${system.tier}`, {
    defaultValue: WATER_SANITATION_TIER_LABELS[system.tier]
  });
  const project =
    system.activeProject && system.upgradeProgress > 0
      ? i18n.t("economy.water.summary.building", {
          project: i18n.t(`economy.water.projects.${system.activeProject}`, {
            defaultValue: WATER_WORKS_PROJECT_LABELS[system.activeProject]
          }),
          percent: rn(system.upgradeProgress * 100, 0)
        })
      : "";
  const health =
    system.healthPressure >= 0.45
      ? i18n.t("economy.water.summary.healthRisk", { percent: rn(system.healthPressure * 100, 0) })
      : "";
  const upstream =
    system.upstreamPollutionImport >= 0.15
      ? i18n.t("economy.water.summary.upstreamPollution", { percent: rn(system.upstreamPollutionImport * 100, 0) })
      : "";
  return i18n.t("economy.water.summary.main", {
    tier: tierLabel,
    burden: rn(system.sanitationBurden * 100, 0),
    flood: rn(system.floodExposure * 100, 0),
    odor: rn(system.odor * 100, 0),
    project,
    health,
    upstream
  });
}

function cultureTypeForBurg(burg: Burg): CultureType | string | undefined {
  if (burg.type) return burg.type;
  const cultures = getWorldContext().pack.cultures;
  const culture = cultures?.[burg.culture ?? 0];
  return culture?.type;
}

function systemDefaults(
  partial: Partial<UrbanWaterSystem> & Pick<UrbanWaterSystem, "burgId" | "tier">
): UrbanWaterSystem {
  return {
    drinkingWaterSecurity: 0.5,
    serviceWaterCapacity: 0.3,
    irrigationCapacity: 0.2,
    stormwaterDrainageCapacity: 0.2,
    wastewaterCapacity: 0.15,
    maintenanceCondition: 0.75,
    sanitationBurden: 0.4,
    waterContamination: 0.3,
    floodExposure: 0.25,
    muddiness: 0.25,
    odor: 0.3,
    hasUpstreamIntake: false,
    hasDownstreamOutfall: false,
    hasInheritedRomanWaterworks: false,
    hasSeparateWastewaterRoute: false,
    stormwaterDemand: 0.3,
    wastewaterDemand: 0.3,
    clogging: 0,
    upgradeProgress: 0,
    activeProject: null,
    primaryDemandSignal: null,
    demandUrgency: 0,
    lastMaintenanceCoverage: 1,
    lastMaintenanceSpend: 0,
    lastConstructionSpend: 0,
    connectionPermitCoverage: 0,
    cleaningTaxRate: 0,
    dischargeRegulation: 0,
    lastCleaningTaxRevenue: 0,
    organicStreetLoad: 0.3,
    compostingEfficiency: 0,
    pigToiletPractice: 0,
    upstreamPollutionImport: 0,
    downstreamPollutionExport: 0,
    coalSmokeExposure: 0,
    healthPressure: 0.3,
    localMixedIntakeOutfall: false,
    waterLifting: 0,
    municipalSanitation: 0,
    sanitaryEngineering: 0,
    lastPollutionCompensationPaid: 0,
    lastPollutionCompensationReceived: 0,
    pollutionDiplomaticStrain: 0,
    ...partial
  };
}

/**
 * Giant states in a Fantasy cultures set begin with functioning Roman-grade urban works.
 * The legacy trunk may run to a distant source/outfall, so the local cell need not itself be
 * river or coastal. This is only a generation seed: ordinary annual maintenance can still
 * degrade its effective capacity, while tier 5 sanitary engineering remains unavailable.
 */
function giantRomanWaterworksSeed(burg: Burg): UrbanWaterSystem | null {
  const stateRace = raceKeyForBurgState(burg);
  const isGiantFantasyState =
    stateRace === "giant" && waterTechRaceBiasFor(stateRace, useOptionsState.getState().culturesSet) !== null;
  if (!isGiantFantasyState) return null;

  return systemDefaults({
    burgId: burg.i!,
    tier: 4,
    maintenanceCondition: 0.94,
    clogging: 0.03,
    connectionPermitCoverage: 0.86,
    cleaningTaxRate: 0.025,
    dischargeRegulation: 0.8,
    waterLifting: 0.72,
    municipalSanitation: 0.82,
    hasInheritedRomanWaterworks: true
  });
}

/**
 * Spend burg treasury on market goods for construction (Stone / Tools / Brick).
 * Returns fraction of requested materials obtained (cash-limited separately).
 */
function purchaseProjectMaterials(
  marketId: number,
  project: WaterWorksProjectKind,
  people: number,
  materialBudget: number
): { materialProgress: number; spend: number } {
  if (!marketId || materialBudget <= 0) return { materialProgress: 0, spend: 0 };
  const needs = projectMaterialNeeds(project, people);
  const goods = getGoods();
  const stone = goods.find(g => g.name === "Stone");
  const tools = goods.find(g => g.name === "Tools");
  const brick = goods.find(g => g.name === "Brick");

  const lines: Array<{ goodId: number; units: number }> = [];
  if (stone && needs.stone > 0) lines.push({ goodId: stone.i, units: needs.stone });
  if (tools && needs.tools > 0) lines.push({ goodId: tools.i, units: needs.tools });
  if (brick && needs.brick > 0) lines.push({ goodId: brick.i, units: needs.brick });
  if (!lines.length) return { materialProgress: 1, spend: 0 };

  const totalUnits = lines.reduce((sum, line) => sum + line.units, 0);
  let spend = 0;
  let obtained = 0;
  let remainingBudget = materialBudget;

  for (const line of lines) {
    const share = line.units / totalUnits;
    const lineBudget = remainingBudget * share;
    const { units, cost } = Markets.consumeForMarketInvestment(marketId, line.goodId, line.units, lineBudget);
    obtained += units;
    spend += cost;
    remainingBudget = Math.max(0, remainingBudget - cost);
  }

  return {
    materialProgress: clamp01(obtained / totalUnits),
    spend: rn(spend, 2)
  };
}

/**
 * One burg's annual investment: institutions + cleaning tax, then maintenance, then construction.
 * Mutates `burg.treasury`. Returns intermediate state for final metric recompute.
 */
export function settleBurgWaterInvestment(args: {
  burg: Burg;
  system: UrbanWaterSystem;
  geography: BurgWaterGeography;
  people: number;
}): {
  tier: WaterSanitationTier;
  maintenanceCondition: number;
  clogging: number;
  upgradeProgress: number;
  activeProject: WaterWorksProjectKind | null;
  primaryDemandSignal: WaterDemandSignalId | null;
  demandUrgency: number;
  lastMaintenanceCoverage: number;
  lastMaintenanceSpend: number;
  lastConstructionSpend: number;
  connectionPermitCoverage: number;
  cleaningTaxRate: number;
  dischargeRegulation: number;
  lastCleaningTaxRevenue: number;
  waterLifting: number;
  municipalSanitation: number;
  sanitaryEngineering: number;
} {
  const { burg, system, geography, people } = args;
  const workshops = workshopIntensity(burg);
  const stormDeficit = Math.max(0, system.stormwaterDemand - system.stormwaterDrainageCapacity);
  const wasteDeficit = Math.max(0, system.wastewaterDemand - system.wastewaterCapacity);

  const signals = evaluateWaterDemandSignals({
    geography,
    people,
    workshops,
    floodExposure: system.floodExposure,
    muddiness: system.muddiness,
    odor: system.odor,
    waterContamination: system.waterContamination,
    sanitationBurden: system.sanitationBurden,
    stormDeficit,
    wasteDeficit,
    irrigationCapacity: system.irrigationCapacity,
    serviceWaterCapacity: system.serviceWaterCapacity,
    hasMarket: (burg.market ?? 0) > 0
  });
  const primary = primaryDemandSignal(signals);
  const demandUrgency = primary?.strength ?? 0;
  const droughtDemand = signals.find(s => s.id === "droughtService")?.strength ?? 0;

  // ── Phase 3 institutions ─────────────────────────────────────────────────
  const capitalId = burg.state ? (getWorldContext().pack.states[burg.state]?.capital ?? burg.i!) : burg.i!;
  const administrationBonus = getAcademyBonus(capitalId, "administration");

  // Race-conditioned bias (Fantasy culture sets only) — see raceWaterTechBias.ts. This is a
  // demand/gate bias applied on top of ordinary conditions, never a bypass of geography/scale
  // gates: a burg with nowhere to drain still cannot build a sewer network. A Roman waterworks
  // inheritance belongs to the Giant State that operates its aqueducts and trunk sewer, so it
  // continues to receive that State's technical bias even if a local burg culture differs.
  const waterTechRace = raceKeyForBurgWaterworks(burg, system.hasInheritedRomanWaterworks);
  const raceBias = waterTechRaceBiasFor(waterTechRace, useOptionsState.getState().culturesSet);
  const effectiveUrgencyThreshold = WATER_PROJECT_URGENCY_THRESHOLD * (raceBias?.urgencyThresholdMultiplier ?? 1);

  // Institutional head start feeds connectionPermitCoverage/dischargeRegulation targets only
  // (institutionalTargets() clamps admin to [0.85, 1.35]) — deliberately NOT reused for
  // maxInvestableTier()/canStartAdvancedProject()'s tier-5 gate (SANITARY_ENGINEERING_ADMIN_MIN),
  // which stays purely earned.
  const institutionsAdministrationBonus = administrationBonus + (raceBias?.administrationBonusBonus ?? 0);
  const institutions = evolveInstitutions({
    previous: system,
    tier: system.tier,
    contamination: system.waterContamination,
    sanitationBurden: system.sanitationBurden,
    demandUrgency,
    administrationBonus: institutionsAdministrationBonus
  });

  const taxRevenue = cleaningTaxRevenue({
    cleaningTaxRate: institutions.cleaningTaxRate,
    people,
    product: burg.product ?? 0
  });
  if (taxRevenue > 0) burg.treasury = rn((burg.treasury ?? 0) + taxRevenue, 2);

  // ── Maintenance (separate budget from construction; can use cleaning tax) ─
  const needed = annualMaintenanceNeed({
    tier: system.tier,
    people,
    clogging: system.clogging,
    product: burg.product ?? 0
  });
  const liquid = Math.max(0, burg.treasury ?? 0);
  const cushion = getComfortableTreasuryLevel(burg) * 0.15;
  const maintBudget = Math.max(0, Math.min(liquid - cushion, liquid * WATER_MAINTENANCE_BUDGET_SHARE + taxRevenue));
  const maintSpend = rn(Math.min(maintBudget, needed), 2);
  if (maintSpend > 0) burg.treasury = rn((burg.treasury ?? 0) - maintSpend, 2);
  const coverage = needed > 0 ? clamp01(maintSpend / needed) : 1;

  const { maintenanceCondition, clogging } = applyMaintenanceYear({
    maintenanceCondition: system.maintenanceCondition,
    clogging: system.clogging,
    coverage,
    stormDeficit,
    wasteDeficit,
    tier: system.tier
  });

  // ── Construction ─────────────────────────────────────────────────────────
  let tier = system.tier;
  let upgradeProgress = system.upgradeProgress;
  let activeProject = system.activeProject;
  let constructionSpend = 0;
  let liftingWorksProgress = 0;

  const masonryStock = masonryGuildStock(burg.i!);
  const maxTier = maxInvestableTier({
    waterLifting: system.waterLifting,
    municipalSanitation: Math.max(system.municipalSanitation, institutions.connectionPermitCoverage),
    sanitaryEngineering: system.sanitaryEngineering,
    connectionPermitCoverage: institutions.connectionPermitCoverage,
    dischargeRegulation: institutions.dischargeRegulation,
    administrationBonus
  });
  const suggested = projectForUpgrade(tier, maxTier);

  // Prefer water-lifting works under drought when supply is weak and stock is low.
  const preferLifting =
    droughtDemand >= effectiveUrgencyThreshold &&
    system.waterLifting < 0.45 &&
    system.serviceWaterCapacity < 0.55 &&
    canStartProject({
      project: "waterLiftingWorks",
      geography,
      masonryStock,
      people,
      waterLifting: system.waterLifting,
      municipalSanitation: system.municipalSanitation,
      sanitaryEngineering: system.sanitaryEngineering,
      connectionPermitCoverage: institutions.connectionPermitCoverage,
      dischargeRegulation: institutions.dischargeRegulation,
      administrationBonus
    });

  if (activeProject) {
    const target = targetTierForProject(activeProject);
    if (target !== null && tier >= target) {
      activeProject = null;
      upgradeProgress = 0;
    } else if (activeProject === "waterLiftingWorks" && system.waterLifting >= 0.85) {
      activeProject = null;
      upgradeProgress = 0;
    } else if (demandUrgency < effectiveUrgencyThreshold * 0.5 && !preferLifting) {
      // freeze
    }
  } else if (preferLifting) {
    activeProject = "waterLiftingWorks";
    upgradeProgress = 0;
  } else if (suggested && demandUrgency >= effectiveUrgencyThreshold) {
    if (
      canStartProject({
        project: suggested,
        geography,
        masonryStock,
        people,
        waterLifting: system.waterLifting,
        municipalSanitation: Math.max(system.municipalSanitation, institutions.connectionPermitCoverage),
        sanitaryEngineering: system.sanitaryEngineering,
        connectionPermitCoverage: institutions.connectionPermitCoverage,
        dischargeRegulation: institutions.dischargeRegulation,
        administrationBonus
      })
    ) {
      activeProject = suggested;
      upgradeProgress = 0;
    }
  }

  if (
    activeProject &&
    (demandUrgency >= effectiveUrgencyThreshold * 0.45 ||
      (activeProject === "waterLiftingWorks" && droughtDemand >= effectiveUrgencyThreshold * 0.4))
  ) {
    const treasuryCost = projectTreasuryCost(activeProject, people);
    const liquidAfterMaint = Math.max(0, burg.treasury ?? 0);
    const constructBudget = Math.max(
      0,
      Math.min(liquidAfterMaint - cushion * 0.5, liquidAfterMaint * WATER_CONSTRUCTION_BUDGET_SHARE)
    );

    const cashShare = 0.55;
    const cashBudget = constructBudget * cashShare;
    const materialBudget = constructBudget * (1 - cashShare);
    const cashProgress = treasuryCost > 0 ? clamp01(cashBudget / treasuryCost) : 0;
    const cashSpend = rn(Math.min(cashBudget, treasuryCost * Math.max(0.05, 1 - upgradeProgress)), 2);

    const marketId = burg.market ?? 0;
    const { materialProgress, spend: materialSpend } = purchaseProjectMaterials(
      marketId,
      activeProject,
      people,
      materialBudget
    );

    const laborFallback = activeProject === "openDitches" && !marketId ? 0.35 : 0.1;
    const yearProgress =
      (Math.max(cashProgress, laborFallback) * 0.55 + materialProgress * 0.45) *
      (raceBias?.constructionSpeedMultiplier ?? 1);
    const urgencyBoost = 0.85 + Math.max(demandUrgency, droughtDemand) * 0.3;
    upgradeProgress = clamp01(upgradeProgress + yearProgress * urgencyBoost);

    constructionSpend = rn(cashSpend + materialSpend, 2);
    if (cashSpend > 0) burg.treasury = rn((burg.treasury ?? 0) - cashSpend, 2);

    if (upgradeProgress >= 0.999) {
      const target = targetTierForProject(activeProject);
      if (target !== null) {
        tier = asTier(Math.max(tier, target));
      } else if (activeProject === "waterLiftingWorks") {
        liftingWorksProgress = 1;
      }
      upgradeProgress = 0;
      activeProject = null;
    }
  }

  // ── Phase 4 tech stocks ──────────────────────────────────────────────────
  const period = getWorldContext().options?.historicalPeriod;
  const tech = evolveWaterTechStocks({
    previous: {
      waterLifting: system.waterLifting,
      municipalSanitation: system.municipalSanitation,
      sanitaryEngineering: system.sanitaryEngineering
    },
    period,
    tier,
    hasRiver: geography.hasRiver,
    droughtDemand,
    contamination: system.waterContamination,
    sanitationBurden: system.sanitationBurden,
    connectionPermitCoverage: institutions.connectionPermitCoverage,
    dischargeRegulation: institutions.dischargeRegulation,
    cleaningTaxRate: institutions.cleaningTaxRate,
    administrationBonus,
    masonryStock,
    liftingWorksProgress,
    ceilingBonus: raceBias?.ceilingBonus
  });

  const completedUpgrade = tier > system.tier;
  const nextCondition = completedUpgrade ? clamp01(Math.max(maintenanceCondition, 0.82)) : maintenanceCondition;
  const nextClogging = completedUpgrade ? clamp01(clogging * 0.35) : clogging;

  return {
    tier,
    maintenanceCondition: nextCondition,
    clogging: nextClogging,
    upgradeProgress: rn(upgradeProgress, 4),
    activeProject,
    primaryDemandSignal: primary?.id ?? null,
    demandUrgency: rn(demandUrgency, 4),
    lastMaintenanceCoverage: rn(coverage, 4),
    lastMaintenanceSpend: maintSpend,
    lastConstructionSpend: constructionSpend,
    connectionPermitCoverage: institutions.connectionPermitCoverage,
    cleaningTaxRate: institutions.cleaningTaxRate,
    dischargeRegulation: institutions.dischargeRegulation,
    lastCleaningTaxRevenue: taxRevenue,
    waterLifting: tech.waterLifting,
    municipalSanitation: tech.municipalSanitation,
    sanitaryEngineering: tech.sanitaryEngineering
  };
}

function ambientTemperatureForBurg(burg: Burg): number {
  const world = getWorldContext();
  const gridCell = world.pack?.cells?.g?.[burg.cell] ?? burg.cell;
  return world.grid?.cells?.temp?.[gridCell] ?? 12;
}

function collectBurgRiverMeta(systems: readonly UrbanWaterSystem[]): {
  pollution: Map<number, { upstreamPollutionImport: number; downstreamPollutionExport: number }>;
  burgRiver: Map<number, number>;
  burgUpstreamRank: Map<number, number>;
} {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const burgs = world.pack.burgs;
  const nodes: Array<{ burgId: number; riverId: number; upstreamRank: number; exportLoad: number }> = [];
  const burgRiver = new Map<number, number>();
  const burgUpstreamRank = new Map<number, number>();

  for (const system of systems) {
    const burg = burgs[system.burgId];
    if (!burg?.i || !system.hasDownstreamOutfall) continue;
    const riverId = cells.r?.[burg.cell] ?? 0;
    if (!riverId) continue;
    const height = cells.h?.[burg.cell] ?? 50;
    const river = world.pack.rivers?.find(r => r.i === riverId);
    let upstreamRank = height;
    if (river?.cells?.length) {
      const idx = river.cells.indexOf(burg.cell);
      if (idx >= 0) upstreamRank = river.cells.length - idx;
    }
    burgRiver.set(system.burgId, riverId);
    burgUpstreamRank.set(system.burgId, upstreamRank);
    nodes.push({
      burgId: system.burgId,
      riverId,
      upstreamRank,
      exportLoad: system.downstreamPollutionExport
    });
  }

  return {
    pollution: propagateRiverPollution(nodes),
    burgRiver,
    burgUpstreamRank
  };
}

/** Apply upstream river pollution imports and recompute contamination-sensitive fields. */
function applyRiverPollutionExternalities(systems: UrbanWaterSystem[]): UrbanWaterSystem[] {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const burgs = world.pack.burgs;
  const { pollution } = collectBurgRiverMeta(systems);
  if (!pollution.size) return systems;

  return systems.map(system => {
    const transfer = pollution.get(system.burgId);
    if (!transfer) return system;
    const burg = burgs[system.burgId];
    if (!burg?.i) return { ...system, ...transfer };

    const geography = readBurgWaterGeography({
      cellId: burg.cell,
      isPort: Boolean(burg.port),
      cells,
      biomesTags: world.biomesData?.tags,
      gridTemp: world.grid?.cells?.temp,
      gridPrec: world.grid?.cells?.prec
    });
    const people = actualUrbanPeople(burg, world.populationRate, world.urbanization);
    return recomputeSystemPreservingState(burg, geography, people, system, {
      upstreamPollutionImport: transfer.upstreamPollutionImport
    });
  });
}

function recomputeSystemPreservingState(
  burg: Burg,
  geography: BurgWaterGeography,
  people: number,
  system: UrbanWaterSystem,
  overrides: Partial<{
    upstreamPollutionImport: number;
    lastPollutionCompensationPaid: number;
    lastPollutionCompensationReceived: number;
    pollutionDiplomaticStrain: number;
  }>
): UrbanWaterSystem {
  return computeUrbanWaterSystem({
    burg,
    geography,
    people,
    cultureType: cultureTypeForBurg(burg),
    ambientTemperature: ambientTemperatureForBurg(burg),
    previous: system,
    tier: system.tier,
    maintenanceCondition: system.maintenanceCondition,
    clogging: system.clogging,
    upgradeProgress: system.upgradeProgress,
    activeProject: system.activeProject,
    primaryDemandSignal: system.primaryDemandSignal,
    demandUrgency: system.demandUrgency,
    lastMaintenanceCoverage: system.lastMaintenanceCoverage,
    lastMaintenanceSpend: system.lastMaintenanceSpend,
    lastConstructionSpend: system.lastConstructionSpend,
    connectionPermitCoverage: system.connectionPermitCoverage,
    cleaningTaxRate: system.cleaningTaxRate,
    dischargeRegulation: system.dischargeRegulation,
    lastCleaningTaxRevenue: system.lastCleaningTaxRevenue,
    waterLifting: system.waterLifting,
    municipalSanitation: system.municipalSanitation,
    sanitaryEngineering: system.sanitaryEngineering,
    upstreamPollutionImport: overrides.upstreamPollutionImport ?? system.upstreamPollutionImport,
    lastPollutionCompensationPaid: overrides.lastPollutionCompensationPaid ?? system.lastPollutionCompensationPaid,
    lastPollutionCompensationReceived:
      overrides.lastPollutionCompensationReceived ?? system.lastPollutionCompensationReceived,
    pollutionDiplomaticStrain: overrides.pollutionDiplomaticStrain ?? system.pollutionDiplomaticStrain
  });
}

/** Phase 4: interstate pollution indemnity + soft diplomatic strain. */
function applyPollutionDiplomacy(systems: UrbanWaterSystem[]): UrbanWaterSystem[] {
  const world = getWorldContext();
  const burgs = world.pack.burgs;
  const states = world.pack.states;
  if (!states?.length) return systems;

  const { burgRiver, burgUpstreamRank } = collectBurgRiverMeta(systems);
  const burgState = new Map<number, number>();
  for (const system of systems) {
    const stateId = burgs[system.burgId]?.state ?? 0;
    if (stateId) burgState.set(system.burgId, stateId);
  }

  const edges = buildInterstatePollutionEdges({
    systems,
    burgState,
    burgRiver,
    burgUpstreamRank
  });
  if (!edges.length) {
    return systems.map(s => ({ ...s, lastPollutionCompensationPaid: 0, lastPollutionCompensationReceived: 0 }));
  }

  const previousStrain = new Map(systems.map(s => [s.burgId, s.pollutionDiplomaticStrain]));
  const settlement = settlePollutionCompensation({
    edges,
    getStateTreasury: id => states[id]?.treasury ?? 0,
    setStateTreasury: (id, value) => {
      if (states[id]?.i) states[id].treasury = value;
    },
    getBurgProduct: id => burgs[id]?.product ?? 0,
    getBurgPeople: id => {
      const b = burgs[id];
      if (!b) return 0;
      return actualUrbanPeople(b, world.populationRate, world.urbanization);
    },
    previousStrain
  });

  applyPollutionDiplomaticAlert({
    unpaidStatePairs: settlement.unpaidStatePairs,
    getAlert: id => states[id]?.alert ?? 0,
    setAlert: (id, value) => {
      if (states[id]?.i) states[id].alert = value;
    }
  });

  return systems.map(system => {
    const paid = settlement.byBurgPaid.get(system.burgId) ?? 0;
    const received = settlement.byBurgReceived.get(system.burgId) ?? 0;
    const strain = settlement.byBurgStrain.get(system.burgId) ?? system.pollutionDiplomaticStrain * 0.55;
    if (paid === 0 && received === 0 && Math.abs(strain - system.pollutionDiplomaticStrain) < 0.001) {
      return {
        ...system,
        lastPollutionCompensationPaid: 0,
        lastPollutionCompensationReceived: 0,
        pollutionDiplomaticStrain: rn(strain, 4)
      };
    }
    const burg = burgs[system.burgId];
    if (!burg?.i) {
      return {
        ...system,
        lastPollutionCompensationPaid: paid,
        lastPollutionCompensationReceived: received,
        pollutionDiplomaticStrain: rn(strain, 4)
      };
    }
    const geography = readBurgWaterGeography({
      cellId: burg.cell,
      isPort: Boolean(burg.port),
      cells: world.pack.cells,
      biomesTags: world.biomesData?.tags,
      gridTemp: world.grid?.cells?.temp,
      gridPrec: world.grid?.cells?.prec
    });
    const people = actualUrbanPeople(burg, world.populationRate, world.urbanization);
    // Strain slightly worsens health pressure via recompute using elevated contamination feel —
    // encoded by carrying strain on the system for score/UI; contamination already set.
    const next = recomputeSystemPreservingState(burg, geography, people, system, {
      lastPollutionCompensationPaid: paid,
      lastPollutionCompensationReceived: received,
      pollutionDiplomaticStrain: strain
    });
    // Soft health penalty when grievances go unpaid.
    if (strain > 0.35) {
      next.healthPressure = rn(clamp01(next.healthPressure + (strain - 0.35) * 0.2), 4);
    }
    return next;
  });
}

function buildSystems(mode: "generate" | "annual"): UrbanWaterSystem[] {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const previousByBurg = new Map<number, UrbanWaterSystem>();
  if (mode === "annual") {
    for (const system of getUrbanWaterSystems()) previousByBurg.set(system.burgId, system);
  }

  let systems: UrbanWaterSystem[] = [];
  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    const previous = mode === "annual" ? (previousByBurg.get(burg.i) ?? null) : giantRomanWaterworksSeed(burg);
    // Ordinary forts remain non-civic military sites, but Giant forts are supplied by the same
    // inherited aqueduct/trunk sewer network as their villages and cities.
    if (burg.group === "fort" && !previous?.hasInheritedRomanWaterworks) continue;

    const geography = readBurgWaterGeography({
      cellId: burg.cell,
      isPort: Boolean(burg.port),
      cells,
      biomesTags: world.biomesData?.tags,
      gridTemp: world.grid?.cells?.temp,
      gridPrec: world.grid?.cells?.prec
    });
    const people = actualUrbanPeople(burg, world.populationRate, world.urbanization);
    const ambientTemperature = ambientTemperatureForBurg(burg);

    // First pass metrics (for demand / investment decisions).
    let draft = computeUrbanWaterSystem({
      burg,
      geography,
      people,
      cultureType: cultureTypeForBurg(burg),
      ambientTemperature,
      previous
    });

    if (mode === "annual" && previous) {
      const investment = settleBurgWaterInvestment({
        burg,
        system: draft,
        geography,
        people
      });
      draft = computeUrbanWaterSystem({
        burg,
        geography,
        people,
        cultureType: cultureTypeForBurg(burg),
        ambientTemperature,
        previous: systemDefaults({
          burgId: burg.i,
          tier: investment.tier,
          maintenanceCondition: investment.maintenanceCondition,
          clogging: investment.clogging,
          upgradeProgress: investment.upgradeProgress,
          activeProject: investment.activeProject,
          primaryDemandSignal: investment.primaryDemandSignal,
          demandUrgency: investment.demandUrgency,
          lastMaintenanceCoverage: investment.lastMaintenanceCoverage,
          lastMaintenanceSpend: investment.lastMaintenanceSpend,
          lastConstructionSpend: investment.lastConstructionSpend,
          connectionPermitCoverage: investment.connectionPermitCoverage,
          cleaningTaxRate: investment.cleaningTaxRate,
          dischargeRegulation: investment.dischargeRegulation,
          lastCleaningTaxRevenue: investment.lastCleaningTaxRevenue,
          waterLifting: investment.waterLifting,
          municipalSanitation: investment.municipalSanitation,
          sanitaryEngineering: investment.sanitaryEngineering,
          hasInheritedRomanWaterworks: previous.hasInheritedRomanWaterworks,
          pollutionDiplomaticStrain: previous?.pollutionDiplomaticStrain ?? 0
        }),
        tier: investment.tier,
        maintenanceCondition: investment.maintenanceCondition,
        clogging: investment.clogging,
        upgradeProgress: investment.upgradeProgress,
        activeProject: investment.activeProject,
        primaryDemandSignal: investment.primaryDemandSignal,
        demandUrgency: investment.demandUrgency,
        lastMaintenanceCoverage: investment.lastMaintenanceCoverage,
        lastMaintenanceSpend: investment.lastMaintenanceSpend,
        lastConstructionSpend: investment.lastConstructionSpend,
        connectionPermitCoverage: investment.connectionPermitCoverage,
        cleaningTaxRate: investment.cleaningTaxRate,
        dischargeRegulation: investment.dischargeRegulation,
        lastCleaningTaxRevenue: investment.lastCleaningTaxRevenue,
        waterLifting: investment.waterLifting,
        municipalSanitation: investment.municipalSanitation,
        sanitaryEngineering: investment.sanitaryEngineering,
        pollutionDiplomaticStrain: previous?.pollutionDiplomaticStrain ?? 0
      });
    }

    systems.push(draft);
  }

  // Second pass: upstream outfalls pollute downstream intakes.
  systems = applyRiverPollutionExternalities(systems);
  // Third pass: interstate pollution compensation and diplomatic strain.
  if (mode === "annual") {
    systems = applyPollutionDiplomacy(systems);
  }

  for (const system of systems) {
    const burg = world.pack.burgs[system.burgId];
    if (burg?.i) {
      burg.sanitation = sanitationScoreFromSystem(system);
      burg.waterSecurity = waterSecurityScoreFromSystem(system);
    }
  }
  return systems;
}

/** Running sum/count pair used to average a burg civic score up to its Province/State. */
interface RollupAccumulator {
  sum: number;
  n: number;
}

/**
 * Averages both burg civic scores (unweighted by population, matching the pre-existing sanitation
 * rollup) up to Province/State in a single burgs pass. Design: docs/plan/epidemic-cholera-and-water-security.md §3.1.
 */
function rollupProvinceAndStateCivicScores(): void {
  const world = getWorldContext();
  const burgs = world.pack.burgs;
  const provinces = world.pack.provinces;
  const states = world.pack.states;
  if (!provinces?.length && !states?.length) return;

  const sanitationByProvince = new Map<number, RollupAccumulator>();
  const sanitationByState = new Map<number, RollupAccumulator>();
  const waterSecurityByProvince = new Map<number, RollupAccumulator>();
  const waterSecurityByState = new Map<number, RollupAccumulator>();

  const accumulate = (map: Map<number, RollupAccumulator>, id: number, value: number) => {
    if (id <= 0) return;
    const entry = map.get(id) ?? { sum: 0, n: 0 };
    entry.sum += value;
    entry.n += 1;
    map.set(id, entry);
  };

  for (const burg of burgs) {
    if (!burg?.i || burg.removed) continue;
    const provinceId = burg.province ?? 0;
    const stateId = burg.state ?? 0;

    const sanitation = burg.sanitation;
    if (typeof sanitation === "number" && Number.isFinite(sanitation)) {
      accumulate(sanitationByProvince, provinceId, sanitation);
      accumulate(sanitationByState, stateId, sanitation);
    }

    const waterSecurity = burg.waterSecurity;
    if (typeof waterSecurity === "number" && Number.isFinite(waterSecurity)) {
      accumulate(waterSecurityByProvince, provinceId, waterSecurity);
      accumulate(waterSecurityByState, stateId, waterSecurity);
    }
  }

  const applyRollup = (map: Map<number, RollupAccumulator>, id: number): number | undefined => {
    const entry = map.get(id);
    return entry && entry.n > 0 ? rn(entry.sum / entry.n, 1) : undefined;
  };

  if (provinces) {
    for (const province of provinces) {
      if (!province?.i || province.removed) continue;
      const sanitation = applyRollup(sanitationByProvince, province.i);
      if (sanitation !== undefined) province.sanitation = sanitation;
      const waterSecurity = applyRollup(waterSecurityByProvince, province.i);
      if (waterSecurity !== undefined) province.waterSecurity = waterSecurity;
    }
  }
  if (states) {
    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const sanitation = applyRollup(sanitationByState, state.i);
      if (sanitation !== undefined) state.sanitation = sanitation;
      const waterSecurity = applyRollup(waterSecurityByState, state.i);
      if (waterSecurity !== undefined) state.waterSecurity = waterSecurity;
    }
  }
}

class UrbanWaterSystemModule {
  /** Full rebuild after map generation or economy enable — assigns tiers 0–2, no spend. */
  generate(): void {
    setUrbanWaterSystems(buildSystems("generate"));
    rollupProvinceAndStateCivicScores();
    setUrbanWaterLastSettledYear(getSimulationYear());
  }

  /**
   * Annual: pay maintenance, progress public works under demand signals, recompute civic sanitation.
   * Runs before GuildTreasury surplus sweep so investment can use working capital.
   */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getUrbanWaterLastSettledYear() === year) return false;
    setUrbanWaterLastSettledYear(year);

    if (!getUrbanWaterSystems().length) {
      this.generate();
      return true;
    }

    setUrbanWaterSystems(buildSystems("annual"));
    rollupProvinceAndStateCivicScores();
    return true;
  }

  clear(): void {
    setUrbanWaterSystems([]);
    setUrbanWaterLastSettledYear(-1);
  }
}

export const UrbanWater = new UrbanWaterSystemModule();
