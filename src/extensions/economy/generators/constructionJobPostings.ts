import { getBurgDemographics, useOptionsState } from "../../hostCore";
import { rn } from "../../hostUtils";
import { getConstructionOperations, getWorldContext } from "../economyContext";
import {
  getConstructionRequiredWorkers,
  getHousingBacklog,
  getRequiredDwellings,
  isBrickGoodAvailable,
  type MasonShareContext,
  normalizeConstructionOperation,
  resolveBurgCultureType
} from "./constructionEmployment";
import type { ConstructionOperation } from "./constructionEmploymentTypes";

/**
 * Construction job postings vs anonymous macro hiring
 * (keeps open seats for player/NPC hire — does not let annual reconcile fill 100% of demand).
 *
 * Full demand D = getConstructionRequiredWorkers (housing gap driven).
 * Macro target M = D × (1 − RESERVED_FOR_HIRE)  ← basicEmployment fills toward this.
 * Vacancies V    = sticky open seats for hire board (display Phase 1; apply later).
 */

/** Share of full construction demand never filled by anonymous macro reconcile. */
export const CONSTRUCTION_RESERVED_FOR_HIRE = 0.15;
/** Always post at least this many seats when there is meaningful construction demand. */
export const CONSTRUCTION_MIN_POSTINGS = 1;
/** Cap open seats on the board so tiny towns do not advertise dozens of phantom jobs. */
export const CONSTRUCTION_MAX_POSTINGS = 12;
/** Floor of demand posted as hire openings (independent of current fill). */
export const CONSTRUCTION_POSTING_SHARE = 0.1;
/** Extra openings from unfilled gap (D − W). */
export const CONSTRUCTION_OPEN_GAP_SHARE = 0.3;
/** Minimum full demand (mason+carpenter) before we bother posting MIN_POSTINGS. */
const DEMAND_FLOOR_FOR_POSTINGS = 1.5;

export interface ConstructionRoleDemand {
  mason: number;
  carpenter: number;
  total: number;
}

export interface ConstructionJobPosting {
  burgId: number;
  /** Full economic demand (points). */
  demand: ConstructionRoleDemand;
  /** Anonymous macro target (points) — reconcile fills toward this only. */
  macroTarget: ConstructionRoleDemand;
  /** Currently assigned anonymous workers. */
  filled: ConstructionRoleDemand;
  /**
   * Open seats on the hire board (points, typically whole seats for display).
   * Not reduced by macro fill below reserved band — sticky openings for applicants.
   */
  openSeats: number;
  openMason: number;
  openCarpenter: number;
  housingGap: number;
}

function masonContextForBurg(burg: { culture?: number; type?: string }): MasonShareContext {
  return {
    cultureType: resolveBurgCultureType(burg),
    highFantasy: useOptionsState.getState().culturesSet === "highFantasy",
    brickAvailable: isBrickGoodAvailable()
  };
}

/** Full construction labor demand (unchanged economics). */
export function getFullConstructionDemand(
  operation: Pick<ConstructionOperation, "buildingStock" | "hasQuarryAccess" | "dwellingStock"> & {
    requiredDwellings?: number;
  },
  adults: number,
  masonShareContext?: MasonShareContext
): ConstructionRoleDemand {
  const roles = getConstructionRequiredWorkers(operation, adults, masonShareContext);
  return {
    mason: roles.mason,
    carpenter: roles.carpenter,
    total: rn(roles.mason + roles.carpenter, 2)
  };
}

/**
 * Anonymous macro hire target — strictly below full demand so hire-board seats remain.
 * Used by `reconcileAnnualBasicEmploymentWorkers` only.
 */
export function getConstructionMacroRequiredWorkers(
  operation: Pick<ConstructionOperation, "buildingStock" | "hasQuarryAccess" | "dwellingStock"> & {
    requiredDwellings?: number;
  },
  adults: number,
  masonShareContext?: MasonShareContext
): { mason: number; carpenter: number } {
  const full = getConstructionRequiredWorkers(operation, adults, masonShareContext);
  const scale = 1 - CONSTRUCTION_RESERVED_FOR_HIRE;
  return {
    mason: rn(full.mason * scale, 2),
    carpenter: rn(full.carpenter * scale, 2)
  };
}

/**
 * Hire-board open seats for a construction operation.
 * Sticky: even when anonymous workers sit at macro target, openings remain for applicants.
 */
export function computeConstructionOpenSeats(args: {
  demandTotal: number;
  filledTotal: number;
  masonDemand: number;
  carpenterDemand: number;
  masonFilled: number;
  carpenterFilled: number;
}): { openSeats: number; openMason: number; openCarpenter: number } {
  const { demandTotal, filledTotal, masonDemand, carpenterDemand, masonFilled, carpenterFilled } = args;
  if (demandTotal < DEMAND_FLOOR_FOR_POSTINGS) {
    return { openSeats: 0, openMason: 0, openCarpenter: 0 };
  }

  const gap = Math.max(0, demandTotal - filledTotal);
  const raw = demandTotal * CONSTRUCTION_POSTING_SHARE + gap * CONSTRUCTION_OPEN_GAP_SHARE;
  // Always leave at least MIN when demand is real — the reserved macro band guarantees room.
  const reservedBand = demandTotal * CONSTRUCTION_RESERVED_FOR_HIRE;
  const openSeats = Math.min(
    CONSTRUCTION_MAX_POSTINGS,
    Math.max(CONSTRUCTION_MIN_POSTINGS, Math.ceil(Math.max(raw, reservedBand * 0.5)))
  );

  // Split openings by role demand share (prefer the thinner role).
  const masonShort = Math.max(0, masonDemand - masonFilled);
  const carpenterShort = Math.max(0, carpenterDemand - carpenterFilled);
  const shortSum = masonShort + carpenterShort;
  let openMason: number;
  let openCarpenter: number;
  if (shortSum > 0) {
    openMason = Math.round((openSeats * masonShort) / shortSum);
    openCarpenter = openSeats - openMason;
  } else if (masonDemand + carpenterDemand > 0) {
    openMason = Math.round((openSeats * masonDemand) / (masonDemand + carpenterDemand));
    openCarpenter = openSeats - openMason;
  } else {
    openMason = 0;
    openCarpenter = openSeats;
  }

  return { openSeats, openMason, openCarpenter };
}

/** Live posting snapshot for one burg (null if no construction op). */
export function getConstructionJobPosting(burgId: number): ConstructionJobPosting | null {
  if (!burgId) return null;
  const { pack, populationRate } = getWorldContext();
  const burg = pack.burgs?.[burgId];
  if (!burg?.i || burg.removed || burg.group === "fort") return null;

  const raw = getConstructionOperations().find(op => op.active && op.burgId === burgId);
  if (!raw) return null;

  const rate = Math.max(0, populationRate ?? 0) || 1;
  const operation = normalizeConstructionOperation(raw, burg, rate);
  const requiredDwellings = getRequiredDwellings(burg.population ?? 0, rate);
  const demographics = getBurgDemographics(burg);
  const adults = Math.max(0, demographics.maleAdults + demographics.femaleAdults);
  const ctx = masonContextForBurg(burg);

  const demandRoles = getFullConstructionDemand({ ...operation, requiredDwellings }, adults, ctx);
  const macroRoles = getConstructionMacroRequiredWorkers({ ...operation, requiredDwellings }, adults, ctx);
  const filled: ConstructionRoleDemand = {
    mason: operation.masonWorkers,
    carpenter: operation.carpenterWorkers,
    total: rn(operation.masonWorkers + operation.carpenterWorkers, 2)
  };
  const openings = computeConstructionOpenSeats({
    demandTotal: demandRoles.total,
    filledTotal: filled.total,
    masonDemand: demandRoles.mason,
    carpenterDemand: demandRoles.carpenter,
    masonFilled: filled.mason,
    carpenterFilled: filled.carpenter
  });
  const housingGap = getHousingBacklog(operation.dwellingStock, requiredDwellings);

  return {
    burgId,
    demand: demandRoles,
    macroTarget: {
      mason: macroRoles.mason,
      carpenter: macroRoles.carpenter,
      total: rn(macroRoles.mason + macroRoles.carpenter, 2)
    },
    filled,
    openSeats: openings.openSeats,
    openMason: openings.openMason,
    openCarpenter: openings.openCarpenter,
    housingGap: rn(housingGap, 4)
  };
}

/** One-line English for Burg Editor. */
export function formatConstructionJobPosting(posting: ConstructionJobPosting | null): string {
  if (!posting || posting.openSeats <= 0) return "—";
  const parts: string[] = [];
  if (posting.openMason > 0) parts.push(`${posting.openMason} mason`);
  if (posting.openCarpenter > 0) parts.push(`${posting.openCarpenter} carpenter`);
  const roles = parts.length ? parts.join(", ") : `${posting.openSeats} seat(s)`;
  return `${posting.openSeats} open (${roles})`;
}
