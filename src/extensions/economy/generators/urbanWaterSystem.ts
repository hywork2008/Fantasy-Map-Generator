/**
 * Urban water and sanitation Phase 1: burg state, geographic init, annual update.
 *
 * Owns simulation.extensions.economy.urbanWaterSystems and writes the host
 * civic score `burg.sanitation` (0–100). Does not yet build public works,
 * charge maintenance budgets, or unlock tech nodes (Phase 2+).
 *
 * Design: docs/plan/urban-water-and-sanitation-system.md §5, §8, §11 Phase 1.
 */

import type { Burg, CultureType } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getBurgProductionRecords,
  getGoods,
  getMarkets,
  getSimulationYear,
  getUrbanWaterLastSettledYear,
  getUrbanWaterSystems,
  getWorldContext,
  setUrbanWaterLastSettledYear,
  setUrbanWaterSystems
} from "../economyContext";
import type {
  CleansingMaterial,
  CulturalHygieneProfile,
  OrganicWasteRoute,
  UrbanWaterSystem,
  WaterSanitationTier
} from "./urbanWaterTypes";
import { CLEANSING_MATERIALS, ORGANIC_WASTE_ROUTES, WATER_SANITATION_TIER_LABELS } from "./urbanWaterTypes";

export type { CulturalHygieneProfile, UrbanWaterSystem, WaterSanitationTier } from "./urbanWaterTypes";
export { WATER_SANITATION_TIER_LABELS } from "./urbanWaterTypes";

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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
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

  const lowLand = clamp01((40 - height) / 25);
  const fluxRisk = clamp01(Math.log1p(riverFlux) / 8);
  const wetRisk = isWetland ? 0.45 : 0;
  const rainRisk = clamp01((precipitation - 30) / 80);
  const naturalFloodRisk = clamp01(0.35 * lowLand + 0.3 * fluxRisk + 0.25 * wetRisk + 0.2 * rainRisk);

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
    // Fallback when production is not yet settled: product density.
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
  // A few pigs per thousand people matter; large herds at the market edge matter more.
  return clamp01(heads / (people / 80));
}

/** Baseline capacities for a tier before maintenance and geography modifiers. */
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
 * Initial tier from geography and settlement size (Phase 1 only assigns 0–2).
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

export function computeUrbanWaterSystem(args: {
  burg: Burg;
  geography: BurgWaterGeography;
  people: number;
  cultureType: CultureType | string | undefined;
  /** Preserve tier / maintenance across annual refreshes when provided. */
  previous?: UrbanWaterSystem | null;
}): UrbanWaterSystem {
  const { burg, geography, people, cultureType, previous } = args;
  const hasMarket = (burg.market ?? 0) > 0;
  const tier: WaterSanitationTier =
    previous?.tier ??
    initialTier({
      people,
      geography,
      isCapital: Boolean(burg.capital),
      hasMarket
    });
  const base = tierBaseCapacities(tier);
  const maintenanceCondition = previous
    ? clamp01(previous.maintenanceCondition - (people > 8000 && tier <= 1 ? 0.02 : 0.005) + (tier >= 2 ? 0.01 : 0))
    : clamp01(0.72 + tier * 0.06 + geography.slopeAdvantage * 0.08);

  const maint = maintenanceCondition;
  const stormwaterDrainageCapacity = clamp01(base.stormwater * maint * (0.75 + geography.slopeAdvantage * 0.4));
  const wastewaterCapacity = clamp01(base.wastewater * maint);
  const serviceWaterCapacity = clamp01(base.service * maint * (geography.hasRiver || geography.isCoastal ? 1.1 : 0.85));
  const irrigationCapacity = clamp01(base.irrigation * maint * geography.irrigationPotential * 1.2);
  const drinkingBase =
    base.drinking * (geography.hasRiver || geography.isCoastal ? 1.05 : geography.isDry ? 0.75 : 0.95);

  // Demand scales with population, rain, workshops.
  const popFactor = clamp01(people / 12000);
  const rainFactor = clamp01(geography.precipitation / 90);
  const workshops = workshopIntensity(burg);
  const stormwaterDemand = clamp01(0.15 + popFactor * 0.45 + rainFactor * 0.35 + geography.naturalFloodRisk * 0.25);
  const wastewaterDemand = clamp01(0.12 + popFactor * 0.55 + workshops * 0.3 + (hasMarket ? 0.08 : 0));

  const stormDeficit = Math.max(0, stormwaterDemand - stormwaterDrainageCapacity);
  const wasteDeficit = Math.max(0, wastewaterDemand - wastewaterCapacity);

  const profile = culturalHygieneProfile(cultureType);
  const openDisposal = profile.organicWaste.openDisposal;
  const waterDischarge = profile.organicWaste.waterDischarge;
  const animalScavenging = profile.organicWaste.animalScavenging;
  const composting = profile.organicWaste.managedComposting + profile.organicWaste.nightSoilCollection;
  const pigs = pigScavengingShare(burg);
  // Free-ranging / market pigs cut organic street waste but add zoonotic & street mess risk.
  const scavengingRelief = clamp01(animalScavenging * 0.35 + pigs * 0.25);
  const scavengingRisk = clamp01(animalScavenging * 0.2 + pigs * 0.3);

  const sanitationBurden = clamp01(
    0.2 +
      wasteDeficit * 0.55 +
      stormDeficit * 0.2 +
      openDisposal * 0.25 +
      workshops * 0.1 +
      popFactor * 0.15 -
      composting * 0.12 -
      scavengingRelief * 0.15 -
      tier * 0.04
  );

  const hasDownstreamOutfall = geography.hasRiver || geography.isCoastal;
  const hasUpstreamIntake = geography.hasRiver && !geography.isWetland;
  // Phase 1 never separates wastewater routes (Tier 5 territory).
  const hasSeparateWastewaterRoute = false;

  // Draining into the same river used for drinking raises contamination unless intake is protected.
  const mixedUsePenalty =
    hasDownstreamOutfall && geography.hasRiver && waterDischarge > 0.15 && !hasSeparateWastewaterRoute
      ? 0.15 + waterDischarge * 0.25
      : 0.05;
  const waterContamination = clamp01(
    wasteDeficit * 0.45 +
      openDisposal * 0.2 +
      mixedUsePenalty +
      scavengingRisk * 0.15 +
      (geography.isWetland ? 0.12 : 0) -
      (hasUpstreamIntake ? 0.12 : 0) -
      tier * 0.03
  );

  const floodExposure = clamp01(
    geography.naturalFloodRisk * 0.65 + stormDeficit * 0.45 - stormwaterDrainageCapacity * 0.25
  );
  const muddiness = clamp01(stormDeficit * 0.55 + rainFactor * 0.25 + (geography.isWetland ? 0.2 : 0) - tier * 0.05);
  const odor = clamp01(sanitationBurden * 0.55 + wasteDeficit * 0.3 + openDisposal * 0.2 + scavengingRisk * 0.1);

  const drinkingWaterSecurity = clamp01(
    drinkingBase * maint * (1 - waterContamination * 0.55) * (geography.isDry && !geography.hasRiver ? 0.7 : 1)
  );

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
    hasSeparateWastewaterRoute,
    stormwaterDemand: rn(stormwaterDemand, 4),
    wastewaterDemand: rn(wastewaterDemand, 4)
  };
}

/** Map UrbanWaterSystem metrics to the host 0–100 civic sanitation score. */
export function sanitationScoreFromSystem(system: UrbanWaterSystem): number {
  const score =
    system.drinkingWaterSecurity * 38 +
    (1 - system.sanitationBurden) * 28 +
    (1 - system.waterContamination) * 20 +
    (1 - system.floodExposure) * 8 +
    (1 - system.odor) * 6;
  return Math.max(0, Math.min(100, rn(score, 1)));
}

export function getUrbanWaterSystemForBurg(burgId: number): UrbanWaterSystem | undefined {
  return getUrbanWaterSystems().find(system => system.burgId === burgId);
}

export function formatUrbanWaterSummary(system: UrbanWaterSystem): string {
  const tierLabel = WATER_SANITATION_TIER_LABELS[system.tier];
  return `${tierLabel} · sanitation burden ${rn(system.sanitationBurden * 100, 0)}% · flood ${rn(system.floodExposure * 100, 0)}% · odor ${rn(system.odor * 100, 0)}%`;
}

function cultureTypeForBurg(burg: Burg): CultureType | string | undefined {
  if (burg.type) return burg.type;
  const cultures = getWorldContext().pack.cultures;
  const culture = cultures?.[burg.culture ?? 0];
  return culture?.type;
}

function buildSystems(preservePrevious: boolean): UrbanWaterSystem[] {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const previousByBurg = new Map<number, UrbanWaterSystem>();
  if (preservePrevious) {
    for (const system of getUrbanWaterSystems()) previousByBurg.set(system.burgId, system);
  }

  const systems: UrbanWaterSystem[] = [];
  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    if (burg.group === "fort") continue;

    const geography = readBurgWaterGeography({
      cellId: burg.cell,
      isPort: Boolean(burg.port),
      cells,
      biomesTags: world.biomesData?.tags,
      gridTemp: world.grid?.cells?.temp,
      gridPrec: world.grid?.cells?.prec
    });
    const people = actualUrbanPeople(burg, world.populationRate, world.urbanization);
    const system = computeUrbanWaterSystem({
      burg,
      geography,
      people,
      cultureType: cultureTypeForBurg(burg),
      previous: preservePrevious ? (previousByBurg.get(burg.i) ?? null) : null
    });
    systems.push(system);
    burg.sanitation = sanitationScoreFromSystem(system);
  }
  return systems;
}

function rollupProvinceAndStateSanitation(): void {
  const world = getWorldContext();
  const burgs = world.pack.burgs;
  const provinces = world.pack.provinces;
  const states = world.pack.states;
  if (!provinces?.length && !states?.length) return;

  const byProvince = new Map<number, { sum: number; n: number }>();
  const byState = new Map<number, { sum: number; n: number }>();

  for (const burg of burgs) {
    if (!burg?.i || burg.removed) continue;
    const sanitation = burg.sanitation;
    if (typeof sanitation !== "number" || !Number.isFinite(sanitation)) continue;
    const provinceId = burg.province ?? 0;
    if (provinceId > 0) {
      const entry = byProvince.get(provinceId) ?? { sum: 0, n: 0 };
      entry.sum += sanitation;
      entry.n += 1;
      byProvince.set(provinceId, entry);
    }
    const stateId = burg.state ?? 0;
    if (stateId > 0) {
      const entry = byState.get(stateId) ?? { sum: 0, n: 0 };
      entry.sum += sanitation;
      entry.n += 1;
      byState.set(stateId, entry);
    }
  }

  if (provinces) {
    for (const province of provinces) {
      if (!province?.i || province.removed) continue;
      const entry = byProvince.get(province.i);
      if (entry && entry.n > 0) province.sanitation = rn(entry.sum / entry.n, 1);
    }
  }
  if (states) {
    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const entry = byState.get(state.i);
      if (entry && entry.n > 0) state.sanitation = rn(entry.sum / entry.n, 1);
    }
  }
}

class UrbanWaterSystemModule {
  /** Full rebuild after map generation or economy enable — assigns tiers 0–2. */
  generate(): void {
    setUrbanWaterSystems(buildSystems(false));
    rollupProvinceAndStateSanitation();
    setUrbanWaterLastSettledYear(getSimulationYear());
  }

  /**
   * Annual refresh of demand, burden, contamination, flood, and civic sanitation.
   * Preserves tier and slowly adjusts maintenance until Phase 2 investments exist.
   */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getUrbanWaterLastSettledYear() === year) return false;
    setUrbanWaterLastSettledYear(year);

    if (!getUrbanWaterSystems().length) {
      this.generate();
      return true;
    }

    setUrbanWaterSystems(buildSystems(true));
    rollupProvinceAndStateSanitation();
    return true;
  }

  clear(): void {
    setUrbanWaterSystems([]);
    setUrbanWaterLastSettledYear(-1);
  }
}

export const UrbanWater = new UrbanWaterSystemModule();
