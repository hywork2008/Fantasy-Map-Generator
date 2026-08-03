/**
 * Phase 4: late water technology stocks, tier 4–5 gates, and pollution compensation.
 *
 * Host technology graph stages (locked/known/demonstrated/…) now live in
 * `src/generators/technologyProgress.ts` (`urbanCoveredDrainage` and later nodes).
 * This module keeps local 0..1 adoption stocks that those graph nodes can drive
 * more tightly in a later pass.
 *
 * Design: urban-water-and-sanitation-system.md §6, §11 Phase 4.
 */

import { rn } from "../../hostUtils";
import type { UrbanWaterSystem, WaterSanitationTier, WaterTechStocks, WaterWorksProjectKind } from "./urbanWaterTypes";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export type HistoricalPeriod = "earlyMedieval" | "highMedieval" | "lateMedieval";

/** Soft ceilings by generation backdrop — industrial sanitary engineering is not free in 1200. */
export function waterTechCeilings(period: HistoricalPeriod | string | undefined): WaterTechStocks {
  switch (period) {
    case "earlyMedieval":
      return { waterLifting: 0.35, municipalSanitation: 0.35, sanitaryEngineering: 0 };
    case "lateMedieval":
      return { waterLifting: 0.75, municipalSanitation: 0.7, sanitaryEngineering: 0.28 };
    case "highMedieval":
    default:
      return { waterLifting: 0.55, municipalSanitation: 0.55, sanitaryEngineering: 0.08 };
  }
}

/** Thresholds for investing past covered culverts. */
export const MANAGED_SEWER_MUNICIPAL_MIN = 0.28;
export const MANAGED_SEWER_PERMIT_MIN = 0.22;
export const SANITARY_ENGINEERING_STOCK_MIN = 0.22;
export const SANITARY_ENGINEERING_ADMIN_MIN = 1.05;
export const WATER_LIFTING_PROJECT_MIN_STOCK = 0.08;

/**
 * Highest tier this burg may invest toward, given tech and institutions.
 * Tier 5 requires sanitary-engineering stock (verification item 7).
 */
export function maxInvestableTier(args: {
  waterLifting: number;
  municipalSanitation: number;
  sanitaryEngineering: number;
  connectionPermitCoverage: number;
  dischargeRegulation: number;
  administrationBonus: number;
}): WaterSanitationTier {
  const {
    municipalSanitation,
    sanitaryEngineering,
    connectionPermitCoverage,
    dischargeRegulation,
    administrationBonus
  } = args;
  if (
    sanitaryEngineering >= SANITARY_ENGINEERING_STOCK_MIN &&
    administrationBonus >= SANITARY_ENGINEERING_ADMIN_MIN &&
    municipalSanitation >= 0.35
  ) {
    return 5;
  }
  if (
    municipalSanitation >= MANAGED_SEWER_MUNICIPAL_MIN &&
    connectionPermitCoverage >= MANAGED_SEWER_PERMIT_MIN &&
    dischargeRegulation >= 0.2
  ) {
    return 4;
  }
  return 3;
}

export function projectForUpgrade(
  fromTier: WaterSanitationTier,
  maxTier: WaterSanitationTier
): WaterWorksProjectKind | null {
  if (fromTier >= maxTier) return null;
  if (fromTier <= 0) return "openDitches";
  if (fromTier === 1) return "stoneDrains";
  if (fromTier === 2) return "coveredCulverts";
  if (fromTier === 3) return "managedSewers";
  if (fromTier === 4) return "sanitarySeparation";
  return null;
}

export function targetTierForProject(project: WaterWorksProjectKind): WaterSanitationTier | null {
  switch (project) {
    case "openDitches":
      return 1;
    case "stoneDrains":
      return 2;
    case "coveredCulverts":
      return 3;
    case "managedSewers":
      return 4;
    case "sanitarySeparation":
      return 5;
    case "waterLiftingWorks":
      return null;
  }
}

export function canStartAdvancedProject(args: {
  project: WaterWorksProjectKind;
  masonryStock: number;
  waterLifting: number;
  municipalSanitation: number;
  sanitaryEngineering: number;
  connectionPermitCoverage: number;
  dischargeRegulation: number;
  administrationBonus: number;
  hasRiver: boolean;
  hasOutfall: boolean;
  people: number;
}): boolean {
  const {
    project,
    masonryStock,
    waterLifting,
    municipalSanitation,
    sanitaryEngineering,
    connectionPermitCoverage,
    dischargeRegulation,
    administrationBonus,
    hasRiver,
    hasOutfall,
    people
  } = args;

  switch (project) {
    case "managedSewers":
      return (
        people >= 1500 &&
        municipalSanitation >= MANAGED_SEWER_MUNICIPAL_MIN &&
        connectionPermitCoverage >= MANAGED_SEWER_PERMIT_MIN &&
        dischargeRegulation >= 0.18 &&
        masonryStock >= 0.12
      );
    case "sanitarySeparation":
      return (
        people >= 4000 &&
        sanitaryEngineering >= SANITARY_ENGINEERING_STOCK_MIN &&
        administrationBonus >= SANITARY_ENGINEERING_ADMIN_MIN &&
        municipalSanitation >= 0.35 &&
        hasOutfall &&
        masonryStock >= 0.2
      );
    case "waterLiftingWorks":
      // Wheels / buckets along water; limited by period ceiling when evolved.
      return (hasRiver || waterLifting > 0) && people >= 200 && masonryStock >= 0.05;
    default:
      return true;
  }
}

/**
 * Annual EWMA of local tech stocks toward demand-driven targets, capped by historical period.
 */
export function evolveWaterTechStocks(args: {
  previous: WaterTechStocks | null;
  period: HistoricalPeriod | string | undefined;
  tier: WaterSanitationTier;
  hasRiver: boolean;
  droughtDemand: number;
  contamination: number;
  sanitationBurden: number;
  connectionPermitCoverage: number;
  dischargeRegulation: number;
  cleaningTaxRate: number;
  administrationBonus: number;
  masonryStock: number;
  /** Extra progress from completing waterLiftingWorks this year. */
  liftingWorksProgress?: number;
}): WaterTechStocks {
  const rate = 0.18;
  const ceiling = waterTechCeilings(args.period);
  const prev = args.previous ?? { waterLifting: 0, municipalSanitation: 0, sanitaryEngineering: 0 };

  const liftingTarget = clamp01(
    (args.hasRiver ? 0.2 : 0.05) +
      args.droughtDemand * 0.45 +
      args.tier * 0.04 +
      args.masonryStock * 0.15 +
      (args.liftingWorksProgress ?? 0) * 0.5
  );
  const municipalTarget = clamp01(
    args.connectionPermitCoverage * 0.45 +
      args.dischargeRegulation * 0.35 +
      args.cleaningTaxRate * 8 +
      args.tier * 0.06 +
      (args.administrationBonus - 1) * 0.4
  );
  // Sanitary engineering is slow and almost unavailable before late pressure + admin + drains.
  const sanitaryTarget =
    args.tier < 3
      ? 0
      : clamp01(
          (args.contamination * 0.35 + args.sanitationBurden * 0.25 + prev.municipalSanitation * 0.25) *
            Math.max(0, args.administrationBonus - 0.95) *
            (prev.waterLifting >= 0.2 || args.tier >= 3 ? 1 : 0.3)
        );

  const nextLifting = clamp01(prev.waterLifting * (1 - rate) + Math.min(ceiling.waterLifting, liftingTarget) * rate);
  const nextMunicipal = clamp01(
    prev.municipalSanitation * (1 - rate) + Math.min(ceiling.municipalSanitation, municipalTarget) * rate
  );
  const nextSanitary = clamp01(
    prev.sanitaryEngineering * (1 - rate) + Math.min(ceiling.sanitaryEngineering, sanitaryTarget) * rate
  );

  return {
    waterLifting: rn(Math.min(ceiling.waterLifting, nextLifting + (args.liftingWorksProgress ?? 0) * 0.12), 4),
    municipalSanitation: rn(Math.min(ceiling.municipalSanitation, nextMunicipal), 4),
    sanitaryEngineering: rn(Math.min(ceiling.sanitaryEngineering, nextSanitary), 4)
  };
}

/** Capacity multipliers from water lifting (asymmetric: helps supply, not drainage). */
export function waterLiftingCapacityBonus(waterLifting: number): {
  service: number;
  drinking: number;
  irrigation: number;
} {
  const w = clamp01(waterLifting);
  return {
    service: 1 + w * 0.35,
    drinking: 1 + w * 0.22,
    irrigation: 1 + w * 0.12
  };
}

/** Separate foul-water route exists under sanitary engineering or tier 5 works. */
export function hasSeparateWastewaterRoute(args: { tier: WaterSanitationTier; sanitaryEngineering: number }): boolean {
  return args.tier >= 5 || args.sanitaryEngineering >= 0.45;
}

export type PollutionCompensationEdge = {
  upstreamBurgId: number;
  downstreamBurgId: number;
  upstreamStateId: number;
  downstreamStateId: number;
  /** 0..1 pollution transfer intensity. */
  importLoad: number;
  /** 0..1 upstream export. */
  exportLoad: number;
};

/**
 * Build directed pollution edges between different states on the same river.
 * Same-state externalities stay internal (no interstate compensation).
 */
export function buildInterstatePollutionEdges(args: {
  systems: readonly UrbanWaterSystem[];
  burgState: ReadonlyMap<number, number>;
  /** burgId → riverId (0 if none). */
  burgRiver: ReadonlyMap<number, number>;
  /** burgId → upstream rank (higher = further upstream). */
  burgUpstreamRank: ReadonlyMap<number, number>;
}): PollutionCompensationEdge[] {
  const byRiver = new Map<number, number[]>();
  for (const system of args.systems) {
    const riverId = args.burgRiver.get(system.burgId) ?? 0;
    if (!riverId) continue;
    const list = byRiver.get(riverId) ?? [];
    list.push(system.burgId);
    byRiver.set(riverId, list);
  }

  const systemByBurg = new Map(args.systems.map(s => [s.burgId, s]));
  const edges: PollutionCompensationEdge[] = [];

  for (const list of byRiver.values()) {
    list.sort((a, b) => (args.burgUpstreamRank.get(b) ?? 0) - (args.burgUpstreamRank.get(a) ?? 0));
    for (let i = 0; i < list.length; i++) {
      const upId = list[i]!;
      const up = systemByBurg.get(upId);
      const upState = args.burgState.get(upId) ?? 0;
      if (!up || !upState || up.downstreamPollutionExport < 0.08) continue;
      for (let j = i + 1; j < list.length; j++) {
        const downId = list[j]!;
        const down = systemByBurg.get(downId);
        const downState = args.burgState.get(downId) ?? 0;
        if (!down || !downState || downState === upState) continue;
        if (down.upstreamPollutionImport < 0.06) continue;
        // Nearest few downstream foreign burgs only — avoid O(n²) full plume fan-out cost.
        if (j > i + 3) break;
        edges.push({
          upstreamBurgId: upId,
          downstreamBurgId: downId,
          upstreamStateId: upState,
          downstreamStateId: downState,
          importLoad: down.upstreamPollutionImport,
          exportLoad: up.downstreamPollutionExport
        });
      }
    }
  }
  return edges;
}

/**
 * Cash compensation owed for one edge. Scales with product of pollution intensities.
 * Pure amount before treasury affordability.
 */
export function pollutionCompensationAmount(args: {
  edge: PollutionCompensationEdge;
  upstreamProduct: number;
  downstreamPeople: number;
}): number {
  const severity = clamp01(args.edge.exportLoad * 0.55 + args.edge.importLoad * 0.55);
  const base = Math.max(5, args.upstreamProduct * 0.04 + args.downstreamPeople * 0.0008);
  return rn(base * severity, 2);
}

export type CompensationSettlement = {
  byBurgPaid: Map<number, number>;
  byBurgReceived: Map<number, number>;
  byBurgStrain: Map<number, number>;
  /** State pairs that failed to fully pay (for alert). */
  unpaidStatePairs: Array<{ from: number; to: number; shortfall: number }>;
};

/**
 * Settle compensation from upstream state treasuries to downstream state treasuries.
 * Mutates state.treasury on the provided states map-like accessors.
 */
export function settlePollutionCompensation(args: {
  edges: readonly PollutionCompensationEdge[];
  getStateTreasury: (stateId: number) => number;
  setStateTreasury: (stateId: number, value: number) => void;
  getBurgProduct: (burgId: number) => number;
  getBurgPeople: (burgId: number) => number;
  previousStrain: ReadonlyMap<number, number>;
}): CompensationSettlement {
  const byBurgPaid = new Map<number, number>();
  const byBurgReceived = new Map<number, number>();
  const byBurgStrain = new Map<number, number>();
  const unpaidStatePairs: CompensationSettlement["unpaidStatePairs"] = [];

  // Aggregate claims per upstream→downstream state pair to one transfer.
  type PairKey = string;
  const pairClaims = new Map<
    PairKey,
    { from: number; to: number; amount: number; upBurgs: number[]; downBurgs: number[] }
  >();

  for (const edge of args.edges) {
    const amount = pollutionCompensationAmount({
      edge,
      upstreamProduct: args.getBurgProduct(edge.upstreamBurgId),
      downstreamPeople: args.getBurgPeople(edge.downstreamBurgId)
    });
    if (amount < 0.5) continue;
    const key = `${edge.upstreamStateId}->${edge.downstreamStateId}`;
    const entry = pairClaims.get(key) ?? {
      from: edge.upstreamStateId,
      to: edge.downstreamStateId,
      amount: 0,
      upBurgs: [],
      downBurgs: []
    };
    entry.amount += amount;
    entry.upBurgs.push(edge.upstreamBurgId);
    entry.downBurgs.push(edge.downstreamBurgId);
    pairClaims.set(key, entry);
  }

  for (const claim of pairClaims.values()) {
    const available = Math.max(0, args.getStateTreasury(claim.from));
    // Cap annual pollution indemnity so it cannot empty a state alone.
    const cap = available * 0.08;
    const owed = rn(claim.amount, 2);
    const paid = rn(Math.min(owed, cap), 2);
    const shortfall = rn(Math.max(0, owed - paid), 2);

    if (paid > 0) {
      args.setStateTreasury(claim.from, rn(available - paid, 2));
      args.setStateTreasury(claim.to, rn(args.getStateTreasury(claim.to) + paid, 2));
    }

    const perUp = claim.upBurgs.length ? paid / claim.upBurgs.length : 0;
    const perDown = claim.downBurgs.length ? paid / claim.downBurgs.length : 0;
    for (const id of claim.upBurgs) {
      byBurgPaid.set(id, rn((byBurgPaid.get(id) ?? 0) + perUp, 2));
    }
    for (const id of claim.downBurgs) {
      byBurgReceived.set(id, rn((byBurgReceived.get(id) ?? 0) + perDown, 2));
      const prev = args.previousStrain.get(id) ?? 0;
      const unpaidRatio = owed > 0 ? shortfall / owed : 0;
      byBurgStrain.set(id, rn(clamp01(prev * 0.55 + unpaidRatio * 0.55 + (paid > 0 ? -0.08 : 0.05)), 4));
    }

    if (shortfall > 1) {
      unpaidStatePairs.push({ from: claim.from, to: claim.to, shortfall });
    }
  }

  return { byBurgPaid, byBurgReceived, byBurgStrain, unpaidStatePairs };
}

/** Soft diplomatic pressure: raise state.alert slightly when pollution claims go unpaid. */
export function applyPollutionDiplomaticAlert(args: {
  unpaidStatePairs: readonly { from: number; to: number; shortfall: number }[];
  getAlert: (stateId: number) => number;
  setAlert: (stateId: number, value: number) => void;
}): void {
  for (const pair of args.unpaidStatePairs) {
    // Both parties heat up: victim anger and polluter notoriety.
    const bump = Math.min(4, 1 + pair.shortfall / 50);
    args.setAlert(pair.from, Math.min(100, args.getAlert(pair.from) + bump * 0.5));
    args.setAlert(pair.to, Math.min(100, args.getAlert(pair.to) + bump));
  }
}

export function projectTreasuryCostPhase4(project: WaterWorksProjectKind, people: number): number {
  const scale = 0.55 + clamp01(people / 15000) * 1.45;
  switch (project) {
    case "managedSewers":
      return rn(480 * scale, 2);
    case "sanitarySeparation":
      return rn(900 * scale, 2);
    case "waterLiftingWorks":
      return rn(160 * scale, 2);
    default:
      return 0;
  }
}

export function projectMaterialNeedsPhase4(
  project: WaterWorksProjectKind,
  people: number
): { stone: number; tools: number; brick: number } {
  const scale = 0.5 + clamp01(people / 15000);
  switch (project) {
    case "managedSewers":
      return { stone: rn(55 * scale, 2), tools: rn(20 * scale, 2), brick: rn(28 * scale, 2) };
    case "sanitarySeparation":
      return { stone: rn(80 * scale, 2), tools: rn(28 * scale, 2), brick: rn(40 * scale, 2) };
    case "waterLiftingWorks":
      return { stone: rn(12 * scale, 2), tools: rn(18 * scale, 2), brick: rn(6 * scale, 2) };
    default:
      return { stone: 0, tools: 0, brick: 0 };
  }
}
