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
import { getCultureModernizationAffinity, useOptionsState } from "../../hostCore";
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
import { electricityCoverageForMarket } from "./chemMedCommon";
import { computeNaturalFloodRisk } from "./floodHazard";
import { getComfortableTreasuryLevel } from "./guildTreasury";
import { Markets } from "./markets-generator";
import { waterTechRaceBiasFor } from "./raceWaterTechBias";
import { getRegionalSchemeConnectedBurgIds } from "./regionalWaterAuthority";
import { raceKeyForBurgState, raceKeyForBurgWaterworks } from "./resolveBurgCulture";
import { hasSameLandSewerOutfall } from "./urbanSewerage";
import { isSeasonalColdBurg, resolveBurgBasinKind, resolveBurgEffluentDestination } from "./urbanWaterClimate";
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
import {
  isModernWaterEraAvailable,
  MODERN_WATER_MIN_POPULATION,
  settleModernWaterTreatmentInvestment
} from "./urbanWaterModernTreatment";
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
  ABSOLUTE_MAX_WATER_TIER,
  CLEANSING_MATERIALS,
  MAX_INVESTABLE_TIER,
  ORGANIC_WASTE_ROUTES,
  WATER_SANITATION_TIER_LABELS,
  WATER_WORKS_PROJECT_LABELS
} from "./urbanWaterTypes";

export type { RiverBasinKind, WaterEffluentDestination } from "./urbanWaterClimate";
export { maxInvestableTier, waterTechCeilings } from "./urbanWaterTech";
export type {
  CulturalHygieneProfile,
  RegionalWaterScheme,
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
    // Added 2026-08-23 alongside docs/plan/modern-urban-water-treatment-and-governance.md.
    case "Desert":
      // Fixed oasis/caravan settlements minimize water for cleansing (cloth/sand wiping over
      // washing) but, unlike Nomadic camps, cannot just relocate away from their own waste.
      cleansingRaw.water = 0.12;
      cleansingRaw.plant = 0.35;
      cleansingRaw.cloth = 0.35;
      cleansingRaw.sharedTool = 0.1;
      wasteRaw.cesspit = 0.35;
      wasteRaw.managedComposting = 0.2;
      wasteRaw.openDisposal = 0.25;
      wasteRaw.animalScavenging = 0.14;
      wasteRaw.waterDischarge = 0.04;
      break;
    case "Marsh":
      // Delta/polder life is water-saturated in both directions: highest water cleansing of any
      // type, and — before any modern treatment exists — the highest raw waterDischarge too
      // (see docs/plan/epidemic-cholera-and-water-security.md for what that risks downstream).
      cleansingRaw.water = 0.55;
      cleansingRaw.plant = 0.3;
      wasteRaw.waterDischarge = 0.35;
      wasteRaw.openDisposal = 0.2;
      wasteRaw.nightSoilCollection = 0.15;
      wasteRaw.managedComposting = 0.15;
      wasteRaw.cesspit = 0.1;
      wasteRaw.animalScavenging = 0.05;
      break;
    case "Industrial":
      // Dense factory-town population with little rural land nearby: organized night-soil
      // collection stands in for the piped sewer this culture wants but, absent the still-
      // unimplemented ModernWaterTreatmentSystem (§6 of the doc above), does not yet have.
      cleansingRaw.water = 0.45;
      cleansingRaw.cloth = 0.25;
      cleansingRaw.paper = 0.15;
      cleansingRaw.plant = 0.1;
      wasteRaw.nightSoilCollection = 0.3;
      wasteRaw.waterDischarge = 0.25;
      wasteRaw.cesspit = 0.2;
      wasteRaw.openDisposal = 0.15;
      wasteRaw.managedComposting = 0.06;
      wasteRaw.animalScavenging = 0.04;
      break;
    case "Colonial":
      // A single scalar profile cannot represent the historical split between a well-served
      // colonial quarter and a neglected native one (§5.4's own caveat) — this is the administered-
      // average across both, leaning on imported organization (night-soil rounds, composting) more
      // than an organic Generic culture would.
      cleansingRaw.water = 0.4;
      cleansingRaw.cloth = 0.2;
      cleansingRaw.paper = 0.1;
      cleansingRaw.plant = 0.25;
      wasteRaw.nightSoilCollection = 0.25;
      wasteRaw.managedComposting = 0.2;
      wasteRaw.cesspit = 0.2;
      wasteRaw.openDisposal = 0.2;
      wasteRaw.waterDischarge = 0.1;
      wasteRaw.animalScavenging = 0.05;
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
 * §18.1 (docs/plan/modern-urban-water-treatment-and-governance.md): historical-period "civic
 * waterworks readiness" for initialTier()'s generation-time bonus below. `lateMedieval` (~1300-1500,
 * i18n label) is the earliest period included — the Black Death fell within this window and, in the
 * doc's own framing, is the plausible catalyst for later organized urban sanitation regulation (§10
 * still forbids retroactively giving these burgs a modern TREATMENT plant — this only ever raises
 * the legacy `tier` ladder's own top end: source protection, gravity waterworks, drainage). Earlier
 * periods (`earlyMedieval`/`highMedieval`) and no-selection (legacy saves) are intentionally absent
 * from this map so initialTier() falls back to its unmodified pre-existing behavior for them.
 */
const CIVIC_WATERWORKS_TECH_LEVEL: Readonly<Partial<Record<string, number>>> = {
  lateMedieval: 2,
  ageOfExploration: 3,
  maritimeEra: 3,
  preIndustrialEra: 4,
  steamEra: 5,
  industrialChemistryEra: 6,
  petroleumEra: 7,
  rocketryEra: 8
};
const CIVIC_WATERWORKS_TECH_LEVEL_MIN = 2; // lateMedieval
const CIVIC_WATERWORKS_TECH_LEVEL_MAX = 8; // rocketryEra

/**
 * Initial tier from geography and settlement size (generation only assigns 0–2 on its own).
 * Large river / wetland / dry-irrigation towns start with more drainage practice.
 *
 * §18.1: when `historicalPeriod` is `lateMedieval` or later (docs/plan/modern-urban-water-treatment-
 * and-governance.md §18), a further bonus of up to +3 tiers is added, scaled by BOTH how far into
 * the lateMedieval->rocketryEra span the map's chosen backdrop sits AND the burg's own culture
 * (`modernizationAffinity`, §11) — reusing the exact "technology level" and "culture" readings this
 * plan's modern-ladder generation seed (modernWaterworksGenerationSeed()) established for
 * the newer drinkingTreatmentTier/wastewaterTreatmentTier ladder, applied here to the legacy ladder
 * across its full period range instead. Both factors are required multiplicatively — an
 * `Industrial`-affinity culture at `lateMedieval` (readiness 0, the era has not caught up yet) and a
 * `Nomadic`-affinity culture at `rocketryEra` (readiness near 0, the culture never settled into it)
 * both get essentially none of this bonus, only their unmodified population/geography baseTier.
 *
 * Gated on population alone (MODERN_WATER_MIN_POPULATION, same floor settleModernWaterTreatmentInvestment
 * uses), NOT on baseTier > 0 — deliberately: baseTier's score above rewards river/wetland/flood-risk
 * geography specifically ("drainage practice"), which is a different question from "is this
 * settlement big enough and in a late/culturally-modern-enough era for engineered civic waterworks
 * to make sense regardless of terrain". An early version of this gated on baseTier > 0 and, as a
 * result, silently gave zero bonus to any inland/flat/non-capital town — most ordinary settlements
 * on many maps — even at rocketryEra with a fully Industrial culture (regression found via user
 * report: petroleumEra + Industrial produced no visible development on such towns).
 */
export function initialTier(args: {
  people: number;
  geography: BurgWaterGeography;
  isCapital: boolean;
  hasMarket: boolean;
  historicalPeriod?: string;
  modernizationAffinity?: number;
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

  const baseTier: WaterSanitationTier = score >= 5 ? 2 : score >= 2 ? 1 : 0;

  const techLevel = args.historicalPeriod ? CIVIC_WATERWORKS_TECH_LEVEL[args.historicalPeriod] : undefined;
  if (techLevel === undefined) return baseTier;
  // Same population bands modernWaterworksGenerationSeed() uses for its own Tier 1/2/3 split — city
  // scale directly sets how large a bonus is even possible, not just whether one applies at all.
  const populationBand = people >= 15000 ? 3 : people >= 4000 ? 2 : people >= MODERN_WATER_MIN_POPULATION ? 1 : 0;
  if (populationBand <= 0) return baseTier;

  const techLevelProgress = clamp01(
    (techLevel - CIVIC_WATERWORKS_TECH_LEVEL_MIN) / (CIVIC_WATERWORKS_TECH_LEVEL_MAX - CIVIC_WATERWORKS_TECH_LEVEL_MIN)
  );
  const affinity = clamp01(args.modernizationAffinity ?? 0);
  const readiness = techLevelProgress * affinity;
  const bonus = Math.round(populationBand * readiness);
  return asTier(Math.min(ABSOLUTE_MAX_WATER_TIER, baseTier + bonus));
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
  /** Modern Phase 2 (docs/plan/modern-urban-water-treatment-and-governance.md §8) overrides —
   * settleModernWaterTreatmentInvestment()'s result, mirrors the legacy overrides above. */
  drinkingTreatmentTier?: WaterSanitationTier;
  wastewaterTreatmentTier?: WaterSanitationTier;
  sourceProtection?: number;
  drinkingTreatmentUpgradeProgress?: number;
  wastewaterTreatmentUpgradeProgress?: number;
  treatmentOperationsFunding?: number;
  wastewaterOperationsFunding?: number;
  /** Modern Phase 4 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §15) overrides —
   * settleModernWaterTreatmentInvestment()'s Tier 2/3 results, same threading pattern as the
   * Phase 2 fields above. */
  chemicalTestCoverage?: number;
  coagulantStockCoverage?: number;
  limeStockCoverage?: number;
  chlorineStockCoverage?: number;
  /** Modern Phase 5 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §16) overrides —
   * settleModernWaterTreatmentInvestment()'s wastewater Tier 2/3 results. */
  sludgeBacklog?: number;
  effluentTestCoverage?: number;
  lastModernConstructionSpend?: number;
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
  /** Phase 3 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §9, §14): true once this
   * burg is a member of an "operating" RegionalWaterScheme (regionalWaterAuthority.ts). Computed by
   * the caller (buildSystems(), one year lagged the same way Dams'/PowerGrid's floor writes are —
   * see regionalWaterAuthority.ts's header comment) and fed in like every other Phase 2/3 override
   * above, rather than read from economyContext directly, so this function stays a pure computation
   * over its args. */
  hasRegionalSchemeConnection?: boolean;
}): UrbanWaterSystem {
  const { burg, geography, people, cultureType, previous } = args;
  const hasMarket = (burg.market ?? 0) > 0;
  // Giants retain basic potable-water and wastewater treatment as a State capability, even when
  // a burg has a different local culture or an old save did not yet store the two tier fields.
  const isGiantState = raceKeyForBurgState(burg) === "giant";
  const drinkingTreatmentTier: WaterSanitationTier = isGiantState
    ? 1
    : (args.drinkingTreatmentTier ?? previous?.drinkingTreatmentTier ?? 0);
  const wastewaterTreatmentTier: WaterSanitationTier = isGiantState
    ? 1
    : (args.wastewaterTreatmentTier ?? previous?.wastewaterTreatmentTier ?? 0);
  // Modern Phase 2 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §12.4): Giants
  // inherit source protection and funding at the same generous level as their other institutional
  // seeds (giantRomanWaterworksSeed()'s connectionPermitCoverage: 0.86 etc.) rather than going
  // through settleModernWaterTreatmentInvestment(), which only ever raises other burgs toward this
  // same floor. Non-Giants read the settled values (or 0 for a fresh, not-yet-invested burg).
  const sourceProtection = isGiantState ? 1 : (args.sourceProtection ?? previous?.sourceProtection ?? 0);
  const drinkingTreatmentUpgradeProgress = isGiantState
    ? 0
    : (args.drinkingTreatmentUpgradeProgress ?? previous?.drinkingTreatmentUpgradeProgress ?? 0);
  const wastewaterTreatmentUpgradeProgress = isGiantState
    ? 0
    : (args.wastewaterTreatmentUpgradeProgress ?? previous?.wastewaterTreatmentUpgradeProgress ?? 0);
  const treatmentOperationsFunding = isGiantState
    ? 0.9
    : (args.treatmentOperationsFunding ?? previous?.treatmentOperationsFunding ?? 0);
  const wastewaterOperationsFunding = isGiantState
    ? 0.9
    : (args.wastewaterOperationsFunding ?? previous?.wastewaterOperationsFunding ?? 0);
  // Modern Phase 4 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §15): Giants stay
  // at Roman-grade Tier 1 (drinkingTreatmentTier above is locked to 1 for them), so neither field
  // is ever meaningfully >0 for a Giant burg — 0 here, not a generous seed like the Phase 2 fields
  // above, since there is no chemical dosing or testing regime to represent at Tier 1.
  const chemicalTestCoverage = isGiantState ? 0 : (args.chemicalTestCoverage ?? previous?.chemicalTestCoverage ?? 0);
  const coagulantStockCoverage = isGiantState
    ? 0
    : (args.coagulantStockCoverage ?? previous?.coagulantStockCoverage ?? 0);
  const limeStockCoverage = isGiantState ? 0 : (args.limeStockCoverage ?? previous?.limeStockCoverage ?? 0);
  const chlorineStockCoverage = isGiantState ? 0 : (args.chlorineStockCoverage ?? previous?.chlorineStockCoverage ?? 0);
  // Modern Phase 5 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §16): Giants stay
  // at Roman-grade wastewaterTreatmentTier 1 (locked above), so neither field is ever meaningfully
  // >0 for a Giant burg — same reasoning as the Phase 4 fields directly above.
  const sludgeBacklog = isGiantState ? 0 : (args.sludgeBacklog ?? previous?.sludgeBacklog ?? 0);
  const effluentTestCoverage = isGiantState ? 0 : (args.effluentTestCoverage ?? previous?.effluentTestCoverage ?? 0);
  const tier: WaterSanitationTier =
    args.tier ??
    previous?.tier ??
    initialTier({
      people,
      geography,
      isCapital: Boolean(burg.capital),
      hasMarket,
      // §18.1: the generation-time civic-waterworks bonus (lateMedieval..rocketryEra, scaled by the
      // burg's own culture) — see initialTier()'s own doc comment.
      historicalPeriod: getWorldContext().options?.historicalPeriod,
      modernizationAffinity: modernizationAffinityForBurg(burg)
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
  // `hasInheritedRomanWaterworks` used to record both facilities. Keep it as the migration
  // default while storing aqueduct and trunk-sewer connectivity independently from now on.
  const hasInheritedRomanSewer = previous?.hasInheritedRomanSewer ?? hasInheritedRomanWaterworks;
  const hasRegionalRomanWaterConnection =
    hasInheritedRomanWaterworks && hasSameLandGravityWaterSource(burg, getWorldContext().pack.cells);
  // Phase 3: an ordinary (non-Giant) burg gets the same kind of imported-water credit once its
  // RegionalWaterScheme reaches "operating" (regionalWaterAuthority.ts) — the two are deliberately
  // ORed into one slot below rather than kept as parallel branches, since both represent the same
  // underlying fact ("this burg's water didn't originate locally").
  const hasRegionalWaterConnection = hasRegionalRomanWaterConnection || Boolean(args.hasRegionalSchemeConnection);
  // `hasSameLandSewerOutfall` now avoids closed-basin rivers unconditionally (urbanSewerage.ts,
  // 2026-08-23 — it used to require a seasonalColdBurgIds gate), so no climate filter is needed here.
  const hasRegionalRomanSewerOutfall =
    hasInheritedRomanSewer &&
    hasSameLandSewerOutfall(burg, getWorldContext().pack.cells, getWorldContext().pack.rivers, {
      features: getWorldContext().pack.features
    });

  const thermalRegime: "temperate" | "seasonalCold" = isSeasonalColdBurg(getWorldContext(), burg)
    ? "seasonalCold"
    : "temperate";
  // Every burg's own geographic fact (docs/plan/modern-urban-water-treatment-and-governance.md
  // §2.2), not just Giant/seasonal-cold ones — see resolveBurgBasinKind()'s doc comment.
  const basinKind = resolveBurgBasinKind({
    cellId: burg.cell,
    cells: getWorldContext().pack.cells,
    rivers: getWorldContext().pack.rivers,
    features: getWorldContext().pack.features
  });
  const effluentDestination = resolveBurgEffluentDestination({
    hasRiver: geography.hasRiver,
    isCoastal: geography.isCoastal,
    basinKind
  });

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
      (geography.hasRiver || geography.isCoastal || hasRegionalWaterConnection ? 1.1 : 0.85) *
      lifting.service
  );
  let irrigationCapacity = clamp01(base.irrigation * maint * geography.irrigationPotential * 1.2 * lifting.irrigation);
  const drinkingBase =
    base.drinking *
    (geography.hasRiver || geography.isCoastal || hasRegionalWaterConnection ? 1.05 : geography.isDry ? 0.75 : 0.95) *
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

  // A closed-basin river is not a valid outfall (docs/plan/modern-urban-water-treatment-and-
  // governance.md §2.2) — only credit the river clause once basinKind confirms it reaches the sea.
  // Direct coastal discharge and an inherited Roman outfall (which independently avoids closed
  // rivers — see hasRegionalRomanSewerOutfall above) still count regardless of the river's basin.
  const hasDownstreamOutfall =
    (geography.hasRiver && basinKind === "openBasin") || geography.isCoastal || hasRegionalRomanSewerOutfall;
  const hasUpstreamIntake = (geography.hasRiver && !geography.isWetland) || hasRegionalWaterConnection;
  const hasSeparateWastewaterRoute = computeSeparateWastewaterRoute({ tier, sanitaryEngineering });
  const mixedLocal = localMixedIntakeOutfall({
    hasRiver: geography.hasRiver,
    hasSeparateWastewaterRoute,
    dischargeRegulation
  });

  const mixedUsePenalty = mixedLocal
    ? 0.18 + organic.waterDischargeShare * 0.28 * (1 - dischargeRegulation * 0.7)
    : organic.waterDischargeShare * 0.05 * (1 - sanitaryEngineering * 0.5);

  // Sanitary engineering treats / dilutes export and protects intake when separate. Modern Phase 2
  // (docs/plan/modern-urban-water-treatment-and-governance.md §8, §12.4): a funded primary
  // wastewater treatment plant (wastewaterTreatmentTier >= 1) cuts export further still — this is
  // the direct mechanism that separates riverPollutionLoad from a downstream burg's own
  // waterSecurity (§1's whole premise). Unfunded (treatmentOperationsFunding low) gives none of it.
  // Modern Phase 5 (§8, §16): Tier >= 2 (trickling filter / biological treatment) cuts export
  // further still, scaled by both operations funding AND effluentTestCoverage (an unverified
  // biological process is not trusted at face value, same reasoning as Phase 4's chemicalTest-
  // Coverage), and de-rated by any sludge backlog (a clogged plant loses effective capacity — §3.1's
  // "sludge putrefaction, odor, loss of treatment capacity"). Tier >= 3 (activated sludge) is a further cut scaled by
  // operations funding AND local Market.electricityStock coverage — blowers need real power, not
  // just budget; this is a shared capacity signal other plants already just read (electricity-
  // CoverageForMarket), not a purchased/consumed Good like Chlorine.
  // A capacity multiplier on the Tier 2 BENEFIT amount itself (not a separate, independently
  // applied factor) — a full backlog erodes the benefit toward 0 but never flips the term negative
  // (i.e. a fully clogged plant is at worst as bad as no Tier 2 treatment at all, never worse).
  const sludgeCapacityFactor = wastewaterTreatmentTier >= 2 ? 1 - clamp01(sludgeBacklog) * 0.6 : 1;
  const electricityCoverage = electricityCoverageForMarket(burg.market ?? 0);
  const modernWastewaterTreatmentFactor =
    (wastewaterTreatmentTier >= 1 ? 1 - 0.35 * clamp01(wastewaterOperationsFunding) : 1) *
    (wastewaterTreatmentTier >= 2
      ? 1 - 0.3 * clamp01(wastewaterOperationsFunding) * clamp01(effluentTestCoverage) * sludgeCapacityFactor
      : 1) *
    (wastewaterTreatmentTier >= 3 ? 1 - 0.25 * clamp01(wastewaterOperationsFunding) * electricityCoverage : 1);
  const treatmentFactor =
    (1 - sanitaryEngineering * 0.45 - (hasSeparateWastewaterRoute ? 0.15 : 0)) * modernWastewaterTreatmentFactor;

  // §22 (docs/plan/modern-urban-water-treatment-and-governance.md): general era-driven public-
  // health knowledge (keeping a well away from a latrine, informal/occasional water treatment) that
  // helps a Burg with no real drinking-treatment plant yet (drinkingTreatmentTier < 1) — whether it
  // has no river/regional-scheme intake to ever build one on, or simply hasn't built one yet —
  // independent of any capital investment. See its own doc comment (below, near
  // modernizationAffinityForBurg()) for the full reasoning; read here and in modernDrinkingBonus.
  const wellHygiene = wellHygieneReadiness(burg, drinkingTreatmentTier);

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
      sanitaryEngineering * 0.1 -
      // Modern Phase 2: source protection alone helps a little; a funded slow-sand-filtration
      // plant (drinkingTreatmentTier >= 1) helps a lot more — §4's Stage A vs. Stage B distinction.
      sourceProtection * 0.06 -
      (drinkingTreatmentTier >= 1 ? 0.12 * clamp01(treatmentOperationsFunding) : 0) -
      // Modern Phase 4 (§8, §15): rapid filtration/coagulation (Tier >= 2) needs funded operation,
      // verified dosing (chemicalTestCoverage), AND a real Alum stock (coagulantStockCoverage) to
      // earn its reduction — untested dosing is not trusted at face value (§1), and dosing gear with
      // no Alum to dose is inert regardless of budget/testing. Controlled chlorination (Tier >= 3) is
      // a further, real-Chlorine-stock-gated reduction on top, also contingent on the plant running.
      (drinkingTreatmentTier >= 2
        ? 0.1 * clamp01(treatmentOperationsFunding) * clamp01(chemicalTestCoverage) * clamp01(coagulantStockCoverage)
        : 0) -
      // §17.2: Lime is a smaller, INDEPENDENT top-up on the Alum-gated term above, not another
      // required factor stacked onto it — a Tier 2 plant with Alum but no local Lime still gets the
      // full Alum-gated reduction above, just misses this smaller pH-correction/softening extra.
      (drinkingTreatmentTier >= 2 ? 0.03 * clamp01(treatmentOperationsFunding) * clamp01(limeStockCoverage) : 0) -
      (drinkingTreatmentTier >= 3 ? 0.14 * clamp01(chlorineStockCoverage) * clamp01(treatmentOperationsFunding) : 0) -
      // §22: free knowledge, no treatmentOperationsFunding gate — see wellHygiene's own doc comment.
      wellHygiene * 0.08
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
      clogging * 0.1 +
      // Modern Phase 5 (§8, §16): unaddressed sludge from biological treatment is a local nuisance
      // in its own right, not just a downstream-export penalty (§3.1's "sludge putrefaction, odor…").
      (wastewaterTreatmentTier >= 2 ? clamp01(sludgeBacklog) * 0.15 : 0)
  );

  const tierDrinkBonus = tierDrinkingHealthBonus({
    tier,
    localMixed: mixedLocal,
    dischargeRegulation,
    hasUpstreamIntake
  });
  // Modern Phase 2: same source-protection/filtration split as waterContamination above — a
  // protected intake helps a little on its own, a funded Tier 1 filtration plant helps a lot more.
  // Modern Phase 4 (§8, §15): Tier 2/3 add further, gated bonuses — see the matching
  // waterContamination terms above for the same reasoning.
  const modernDrinkingBonus =
    sourceProtection * 0.05 +
    (drinkingTreatmentTier >= 1 ? 0.2 * clamp01(treatmentOperationsFunding) : 0) +
    (drinkingTreatmentTier >= 2
      ? 0.15 * clamp01(treatmentOperationsFunding) * clamp01(chemicalTestCoverage) * clamp01(coagulantStockCoverage)
      : 0) +
    // §17.2: same independent Lime top-up as the waterContamination term above.
    (drinkingTreatmentTier >= 2 ? 0.04 * clamp01(treatmentOperationsFunding) * clamp01(limeStockCoverage) : 0) +
    (drinkingTreatmentTier >= 3 ? 0.2 * clamp01(chlorineStockCoverage) * clamp01(treatmentOperationsFunding) : 0) +
    // §22: same free knowledge term as the waterContamination term above.
    wellHygiene * 0.1;
  const drinkingWaterSecurity = clamp01(
    (drinkingBase + tierDrinkBonus + modernDrinkingBonus) *
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
    drinkingTreatmentTier,
    wastewaterTreatmentTier,
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
    basinKind,
    thermalRegime,
    effluentDestination,
    hasInheritedRomanWaterworks,
    hasInheritedRomanSewer,
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
    sourceProtection: rn(sourceProtection, 4),
    drinkingTreatmentUpgradeProgress: rn(drinkingTreatmentUpgradeProgress, 4),
    wastewaterTreatmentUpgradeProgress: rn(wastewaterTreatmentUpgradeProgress, 4),
    treatmentOperationsFunding: rn(treatmentOperationsFunding, 4),
    wastewaterOperationsFunding: rn(wastewaterOperationsFunding, 4),
    chemicalTestCoverage: rn(chemicalTestCoverage, 4),
    coagulantStockCoverage: rn(coagulantStockCoverage, 4),
    limeStockCoverage: rn(limeStockCoverage, 4),
    chlorineStockCoverage: rn(chlorineStockCoverage, 4),
    sludgeBacklog: rn(sludgeBacklog, 4),
    effluentTestCoverage: rn(effluentTestCoverage, 4),
    lastModernConstructionSpend: rn(args.lastModernConstructionSpend ?? previous?.lastModernConstructionSpend ?? 0, 2),
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

/**
 * Culture.modernizationAffinity (0..1, docs/plan/modern-urban-water-treatment-and-governance.md
 * §11) for the burg's OWN culture — deliberately not `cultureTypeForBurg`'s `burg.type` override
 * (that field is a growth-model type override for a manually-reassigned burg, not a culture
 * identity change; modernization affinity is a trait of the people, not the terrain). Falls back
 * to the Generic prior when the burg has no resolvable culture (getCultureModernizationAffinity's
 * own contract), same as every other legacy-save-safe read in this file.
 */
function modernizationAffinityForBurg(burg: Burg): number {
  const culture = getWorldContext().pack.cultures?.[burg.culture ?? 0];
  return getCultureModernizationAffinity(culture ?? {});
}

/**
 * §22 (docs/plan/modern-urban-water-treatment-and-governance.md): general era-driven public-health
 * knowledge — keeping a well away from a latrine, informally boiling/treating water — for a Burg
 * that has no real drinking-treatment plant yet (drinkingTreatmentTier < 1). Answers the "medieval
 * vs. modern rural village" question for a village with no river/regional-scheme intake to ever
 * build a Tier 1 plant on: it can still slowly benefit from the era it lives in, just far less than
 * an actual filtration plant would give it (0.08/0.1 below vs. Tier 1's own 0.12/0.2 — see
 * computeUrbanWaterSystem()'s waterContamination/modernDrinkingBonus terms that read this).
 *
 * Deliberately free — no treatmentOperationsFunding, Good purchase, or treasury spend of any kind,
 * unlike every drinkingTreatmentTier >= 1 term in this file. This is a knowledge/behavior change,
 * not capital investment, so it does not compete with construction/operations budgets the way a
 * real plant does. Zero once drinkingTreatmentTier reaches 1 — at that point the real plant's own,
 * larger terms take over and this folk-knowledge term would be redundant.
 *
 * Reuses modernWaterworksGenerationSeed()'s (§20) exact era-progress scale (steamEra=0..
 * rocketryEra=1, CIVIC_WATERWORKS_TECH_LEVEL/MODERN_WATERWORKS_SEED_TECH_LEVEL_MIN below) so a
 * pre-steamEra map gets none of this either — §10's "no retroactive modern treatment" principle
 * applies to knowledge diffusion as much as to capital plants; germ theory and chlorination are
 * themselves steamEra-or-later ideas, not something a lateMedieval village could "just know".
 */
function wellHygieneReadiness(burg: Burg, drinkingTreatmentTier: WaterSanitationTier): number {
  if (drinkingTreatmentTier >= 1) return 0;
  const period = getWorldContext().options?.historicalPeriod;
  const techLevel = period ? CIVIC_WATERWORKS_TECH_LEVEL[period] : undefined;
  if (techLevel === undefined) return 0;
  const techLevelProgress = clamp01(
    (techLevel - MODERN_WATERWORKS_SEED_TECH_LEVEL_MIN) /
      (CIVIC_WATERWORKS_TECH_LEVEL_MAX - MODERN_WATERWORKS_SEED_TECH_LEVEL_MIN)
  );
  return techLevelProgress * clamp01(modernizationAffinityForBurg(burg));
}

function systemDefaults(
  partial: Partial<UrbanWaterSystem> & Pick<UrbanWaterSystem, "burgId" | "tier">
): UrbanWaterSystem {
  return {
    drinkingTreatmentTier: 0,
    wastewaterTreatmentTier: 0,
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
    // computeUrbanWaterSystem() always recomputes these three fresh from live geography — these
    // defaults only matter if a systemDefaults()/giantRomanWaterworksSeed() result is ever read
    // directly without going through it first. Kept consistent with hasDownstreamOutfall: false
    // above (no claimed outfall).
    basinKind: "openBasin",
    thermalRegime: "temperate",
    effluentDestination: "sealedStorageAndInfiltration",
    hasInheritedRomanWaterworks: false,
    hasInheritedRomanSewer: false,
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
    // As with basinKind et al. above: computeUrbanWaterSystem() always recomputes the Giant branch
    // fresh, and settleModernWaterTreatmentInvestment() drives the non-Giant one — these only
    // matter for a raw, un-recomputed read.
    sourceProtection: 0,
    drinkingTreatmentUpgradeProgress: 0,
    wastewaterTreatmentUpgradeProgress: 0,
    treatmentOperationsFunding: 0,
    wastewaterOperationsFunding: 0,
    chemicalTestCoverage: 0,
    coagulantStockCoverage: 0,
    limeStockCoverage: 0,
    chlorineStockCoverage: 0,
    sludgeBacklog: 0,
    effluentTestCoverage: 0,
    lastModernConstructionSpend: 0,
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
    drinkingTreatmentTier: 1,
    wastewaterTreatmentTier: 1,
    maintenanceCondition: 0.94,
    clogging: 0.03,
    connectionPermitCoverage: 0.86,
    cleaningTaxRate: 0.025,
    dischargeRegulation: 0.8,
    waterLifting: 0.72,
    municipalSanitation: 0.82,
    sourceProtection: 1,
    treatmentOperationsFunding: 0.9,
    wastewaterOperationsFunding: 0.9,
    hasInheritedRomanWaterworks: true,
    hasInheritedRomanSewer: true
  });
}

/** steamEra's rank in CIVIC_WATERWORKS_TECH_LEVEL above — the floor for
 * modernWaterworksGenerationSeed() below, matching isModernWaterEraAvailable()'s own outer gate
 * for the ongoing annual investment mechanism (§4's Stage B / MODERN_WATER_ERA in
 * urbanWaterModernTreatment.ts). Deliberately narrower than initialTier()'s civic-waterworks bonus
 * (lateMedieval-onward, legacy `tier` ladder only) — §10 forbids retroactively giving a pre-
 * industrial-era city a modern TREATMENT plant, and seeding drinkingTreatmentTier/
 * wastewaterTreatmentTier below this floor would also be mechanically inert: settleModern
 * WaterTreatmentInvestment()'s own era gate forces treatmentOperationsFunding etc. to 0 every year
 * outside MODERN_WATER_ERA, so the seeded tier would show as a frozen, funding-less badge forever. */
const MODERN_WATERWORKS_SEED_TECH_LEVEL_MIN = 5; // steamEra

/**
 * Burgs that have already reached a modern-water-era generation option (steamEra or later —
 * MODERN_WATERWORKS_SEED_TECH_LEVEL_MIN above) begin with modern drinking/wastewater treatment
 * already built, scaled by population, the burg's own culture (`modernizationAffinity`, §11), and
 * how far into the steamEra->rocketryEra span the map's chosen backdrop sits — a large,
 * culturally-modern metropolis late in that span should not spend the early centuries of play at
 * Tier 0 while settleModernWaterTreatmentInvestment() (urbanWaterModernTreatment.ts) slowly catches
 * up from scratch. The exact modern-ladder counterpart of initialTier()'s civic-waterworks bonus
 * (§18.2) — same "population band × techLevelProgress × modernizationAffinity, rounded" shape,
 * applied to drinkingTreatmentTier/wastewaterTreatmentTier instead of the legacy `tier` ladder, and
 * gated at the burg's own local culture (not the State's) for the same reason §18.2 reads Burg-level
 * — a Burg's OWN culture, not its owning State's, is what should decide how eagerly IT builds.
 *
 * Originally scoped to `historicalPeriod === "rocketryEra"` and State-level CultureType ===
 * "Industrial" only (a narrower precursor of this function). Generalized after a user report that
 * even petroleumEra + every culture forced Industrial (optionsState.ts's `forceIndustrialCultures`)
 * showed no water/sewer on the map — the map's "sewages" layer preset (drawSewerage.ts's
 * treatmentPlantMarkup()) draws its plant icon strictly from `wastewaterTreatmentTier >= 1`, a field
 * only THIS function (or annual play) ever seeds; §18's legacy-`tier` fix was invisible to it.
 *
 * Unlike the Giant branch (computeUrbanWaterSystem()'s isGiantState, re-asserted every year), this
 * is a pure generation-time head start: buildSystems()'s mode === "generate" branch reads it once as
 * `previous`, and ordinary annual maintenance/investment/culture-change governs the burg from there
 * on like any other — exactly what giantRomanWaterworksSeed()'s own doc comment says of itself,
 * except here nothing re-locks the tier back down afterward.
 *
 * Population bands reuse initialTier()'s own 4,000/15,000 breakpoints (this file, above) rather than
 * inventing new ones, and MODERN_WATER_MIN_POPULATION (urbanWaterModernTreatment.ts) as the floor
 * below which no seed applies — a hamlet-sized burg gets no head start, same as it would get no
 * annual modern investment either.
 */
function modernWaterworksGenerationSeed(burg: Burg): UrbanWaterSystem | null {
  const world = getWorldContext();
  const period = world.options?.historicalPeriod;
  if (!isModernWaterEraAvailable(period)) return null;

  const people = actualUrbanPeople(burg, world.populationRate, world.urbanization);
  if (people < MODERN_WATER_MIN_POPULATION) return null;

  const techLevel = period ? CIVIC_WATERWORKS_TECH_LEVEL[period] : undefined;
  if (techLevel === undefined) return null; // isModernWaterEraAvailable guards this in practice
  const techLevelProgress = clamp01(
    (techLevel - MODERN_WATERWORKS_SEED_TECH_LEVEL_MIN) /
      (CIVIC_WATERWORKS_TECH_LEVEL_MAX - MODERN_WATERWORKS_SEED_TECH_LEVEL_MIN)
  );
  const affinity = clamp01(modernizationAffinityForBurg(burg));
  const readiness = techLevelProgress * affinity;
  const populationBand = people >= 15000 ? 3 : people >= 4000 ? 2 : 1;
  // 3 is drinkingTreatmentTier/wastewaterTreatmentTier's own ceiling (controlled chlorination /
  // activated sludge, §15/§16) — not MAX_INVESTABLE_TIER (deprecated, legacy-`tier`-ladder-only).
  const tier = asTier(Math.min(3, Math.round(populationBand * readiness))) as WaterSanitationTier;
  if (tier <= 0) return null;

  const funding = tier >= 3 ? 0.85 : tier >= 2 ? 0.7 : 0.5;

  return systemDefaults({
    burgId: burg.i!,
    tier: ABSOLUTE_MAX_WATER_TIER,
    drinkingTreatmentTier: tier,
    wastewaterTreatmentTier: tier,
    maintenanceCondition: 0.85,
    clogging: 0.05,
    connectionPermitCoverage: tier >= 3 ? 0.8 : tier >= 2 ? 0.68 : 0.55,
    dischargeRegulation: tier >= 3 ? 0.78 : tier >= 2 ? 0.65 : 0.5,
    municipalSanitation: tier >= 3 ? 0.78 : tier >= 2 ? 0.65 : 0.5,
    sanitaryEngineering: tier >= 3 ? 0.75 : tier >= 2 ? 0.6 : 0.45,
    waterLifting: 0.6,
    sourceProtection: 1,
    treatmentOperationsFunding: funding,
    wastewaterOperationsFunding: funding,
    chemicalTestCoverage: tier >= 2 ? funding : 0,
    coagulantStockCoverage: tier >= 2 ? funding : 0,
    limeStockCoverage: tier >= 2 ? funding : 0,
    chlorineStockCoverage: tier >= 3 ? funding : 0,
    effluentTestCoverage: tier >= 2 ? funding : 0
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
    administrationBonus: institutionsAdministrationBonus,
    // Modern Phase 2/4/5 ladder (docs/plan/modern-urban-water-treatment-and-governance.md §15/§16):
    // one year lagged, same as every other cross-reference into this year's not-yet-settled modern
    // tiers within this same annual pass (settleModernWaterTreatmentInvestment() runs after this
    // function — see buildSystems()'s call order comment).
    drinkingTreatmentTier: system.drinkingTreatmentTier ?? 0,
    wastewaterTreatmentTier: system.wastewaterTreatmentTier ?? 0
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
  // Phase 3 (docs/plan/modern-urban-water-treatment-and-governance.md §9, §14): one year lagged,
  // same as PowerGridInvestment reading last year's Dam/PowerStation output — RegionalWaterAuthority.
  // settleAnnual() runs after UrbanWater.settleAnnual() in the same annual tick (index.tsx), so a
  // scheme that reaches "operating" this tick is only reflected in hasUpstreamIntake etc. starting
  // next year's buildSystems() call.
  const regionalSchemeConnectedBurgIds = getRegionalSchemeConnectedBurgIds();

  let systems: UrbanWaterSystem[] = [];
  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    const previous =
      mode === "annual"
        ? (previousByBurg.get(burg.i) ?? null)
        : (giantRomanWaterworksSeed(burg) ?? modernWaterworksGenerationSeed(burg));
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
      previous,
      hasRegionalSchemeConnection: regionalSchemeConnectedBurgIds.has(burg.i)
    });

    if (mode === "annual" && previous) {
      const investment = settleBurgWaterInvestment({
        burg,
        system: draft,
        geography,
        people
      });
      // Modern Phase 2/4 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §12.4,
      // §15.2): runs after the legacy investment above spends its share of this year's treasury —
      // the legacy ladder's maintenance/construction needs are more foundational and take priority
      // over this newer, secondary initiative.
      //
      // Explicitly skipped for Giants (already seeded, computeUrbanWaterSystem's isGiantState
      // branch always overrides the tier/funding fields below regardless of what this call would
      // compute) — NOT because settleModernWaterTreatmentInvestment() no-ops for them on its own.
      // Before Phase 4 it happened to no-op anyway, because Giants' previous.drinkingTreatmentTier/
      // wastewaterTreatmentTier both read back as 1 (isGiantState-forced) and the function's old
      // "both tiers already ≥ 1" early-return caught that immediately. Phase 4 removed that guard
      // (it also wrongly zeroed ongoing operations funding for any ordinary burg once both tiers
      // reached 1 — §15.2) so it no longer doubles as a Giant no-op; without this explicit skip,
      // Giants would spend real treasury on Tier 2/3 construction/ops whose result
      // computeUrbanWaterSystem discards outright.
      const modernInvestment =
        raceKeyForBurgState(burg) === "giant"
          ? {
              drinkingTreatmentTier: draft.drinkingTreatmentTier ?? 0,
              wastewaterTreatmentTier: draft.wastewaterTreatmentTier ?? 0,
              sourceProtection: draft.sourceProtection,
              drinkingTreatmentUpgradeProgress: draft.drinkingTreatmentUpgradeProgress,
              wastewaterTreatmentUpgradeProgress: draft.wastewaterTreatmentUpgradeProgress,
              treatmentOperationsFunding: draft.treatmentOperationsFunding,
              wastewaterOperationsFunding: draft.wastewaterOperationsFunding,
              chemicalTestCoverage: draft.chemicalTestCoverage,
              coagulantStockCoverage: draft.coagulantStockCoverage,
              limeStockCoverage: draft.limeStockCoverage,
              chlorineStockCoverage: draft.chlorineStockCoverage,
              sludgeBacklog: draft.sludgeBacklog,
              effluentTestCoverage: draft.effluentTestCoverage,
              lastModernConstructionSpend: 0
            }
          : settleModernWaterTreatmentInvestment({
              burg,
              people,
              period: getWorldContext().options?.historicalPeriod,
              hasUpstreamIntake: draft.hasUpstreamIntake,
              hasDownstreamOutfall: draft.hasDownstreamOutfall,
              modernizationAffinity: modernizationAffinityForBurg(burg),
              waterContamination: draft.waterContamination,
              sanitaryEngineering: draft.sanitaryEngineering,
              previous: {
                drinkingTreatmentTier: draft.drinkingTreatmentTier ?? 0,
                wastewaterTreatmentTier: draft.wastewaterTreatmentTier ?? 0,
                sourceProtection: draft.sourceProtection,
                drinkingTreatmentUpgradeProgress: draft.drinkingTreatmentUpgradeProgress,
                wastewaterTreatmentUpgradeProgress: draft.wastewaterTreatmentUpgradeProgress,
                sludgeBacklog: draft.sludgeBacklog
              }
            });
      draft = computeUrbanWaterSystem({
        burg,
        geography,
        people,
        cultureType: cultureTypeForBurg(burg),
        ambientTemperature,
        hasRegionalSchemeConnection: regionalSchemeConnectedBurgIds.has(burg.i),
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
          drinkingTreatmentTier: modernInvestment.drinkingTreatmentTier,
          wastewaterTreatmentTier: modernInvestment.wastewaterTreatmentTier,
          sourceProtection: modernInvestment.sourceProtection,
          drinkingTreatmentUpgradeProgress: modernInvestment.drinkingTreatmentUpgradeProgress,
          wastewaterTreatmentUpgradeProgress: modernInvestment.wastewaterTreatmentUpgradeProgress,
          treatmentOperationsFunding: modernInvestment.treatmentOperationsFunding,
          wastewaterOperationsFunding: modernInvestment.wastewaterOperationsFunding,
          chemicalTestCoverage: modernInvestment.chemicalTestCoverage,
          coagulantStockCoverage: modernInvestment.coagulantStockCoverage,
          limeStockCoverage: modernInvestment.limeStockCoverage,
          chlorineStockCoverage: modernInvestment.chlorineStockCoverage,
          sludgeBacklog: modernInvestment.sludgeBacklog,
          effluentTestCoverage: modernInvestment.effluentTestCoverage,
          lastModernConstructionSpend: modernInvestment.lastModernConstructionSpend,
          connectionPermitCoverage: investment.connectionPermitCoverage,
          cleaningTaxRate: investment.cleaningTaxRate,
          dischargeRegulation: investment.dischargeRegulation,
          lastCleaningTaxRevenue: investment.lastCleaningTaxRevenue,
          waterLifting: investment.waterLifting,
          municipalSanitation: investment.municipalSanitation,
          sanitaryEngineering: investment.sanitaryEngineering,
          hasInheritedRomanWaterworks: previous.hasInheritedRomanWaterworks,
          hasInheritedRomanSewer: previous.hasInheritedRomanSewer ?? previous.hasInheritedRomanWaterworks,
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
        drinkingTreatmentTier: modernInvestment.drinkingTreatmentTier,
        wastewaterTreatmentTier: modernInvestment.wastewaterTreatmentTier,
        sourceProtection: modernInvestment.sourceProtection,
        drinkingTreatmentUpgradeProgress: modernInvestment.drinkingTreatmentUpgradeProgress,
        wastewaterTreatmentUpgradeProgress: modernInvestment.wastewaterTreatmentUpgradeProgress,
        treatmentOperationsFunding: modernInvestment.treatmentOperationsFunding,
        wastewaterOperationsFunding: modernInvestment.wastewaterOperationsFunding,
        chemicalTestCoverage: modernInvestment.chemicalTestCoverage,
        coagulantStockCoverage: modernInvestment.coagulantStockCoverage,
        limeStockCoverage: modernInvestment.limeStockCoverage,
        chlorineStockCoverage: modernInvestment.chlorineStockCoverage,
        sludgeBacklog: modernInvestment.sludgeBacklog,
        effluentTestCoverage: modernInvestment.effluentTestCoverage,
        lastModernConstructionSpend: modernInvestment.lastModernConstructionSpend,
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
