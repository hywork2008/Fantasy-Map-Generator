import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import {
  clampDomainLevyRate,
  type DomainFiscalPolicy,
  domainLevyToPollMultiplier,
  normalizeDomainFiscalPolicy
} from "./domainFiscalPolicy";

/**
 * Multi-ledger PR-13 — per-seat domain levy → poll-tax detail for UI.
 */

export interface DomainPollSeatRow {
  burgId: number;
  burgName: string;
  provinceId: number;
  provinceName: string;
  population: number;
  levyRate: number;
  policy: DomainFiscalPolicy;
  worksTarget: string;
  worksProgress: number;
  /** Weight used in the state average (population-weighted). */
  weight: number;
  /** Seat's contribution to the poll multiplier blend (0–1 share of weight). */
  weightShare: number;
}

export interface DomainPollDetail {
  stateId: number;
  stateName: string;
  pollMultiplier: number;
  averageLevy: number;
  extractShare: number;
  seats: DomainPollSeatRow[];
}

/**
 * Build per-burg domain poll breakdown for a state.
 */
export function getDomainPollDetail(state: State): DomainPollDetail {
  const empty: DomainPollDetail = {
    stateId: state.i || 0,
    stateName: state.name || `State ${state.i || 0}`,
    pollMultiplier: state.domainPollTaxMultiplier ?? 1,
    averageLevy: 1,
    extractShare: 0,
    seats: []
  };
  if (!state.i) return empty;

  try {
    const { pack } = getWorldContext();
    const seats: DomainPollSeatRow[] = [];
    let weightSum = 0;
    let levyWeightSum = 0;
    let extractWeight = 0;

    for (const province of pack.provinces || []) {
      if (!province?.i || province.removed || province.state !== state.i || !province.burg) continue;
      const burg = pack.burgs?.[province.burg] as Burg | undefined;
      if (!burg || burg.removed) continue;

      const pop = Math.max(0.1, (burg.population || 0) * 1000);
      const levy = clampDomainLevyRate(burg.domainLevyRate);
      const policy = normalizeDomainFiscalPolicy(burg.domainFiscalPolicy);
      weightSum += pop;
      levyWeightSum += levy * pop;
      if (policy === "extract") extractWeight += pop;

      seats.push({
        burgId: burg.i || province.burg,
        burgName: burg.name || `Burg ${burg.i}`,
        provinceId: province.i,
        provinceName: province.name || `Province ${province.i}`,
        population: rn(pop, 1),
        levyRate: levy,
        policy,
        worksTarget: burg.domainWorksTarget || "walls",
        worksProgress: rn(burg.domainWorksProgress || 0, 1),
        weight: rn(pop, 1),
        weightShare: 0
      });
    }

    if (!(weightSum > 0) || seats.length === 0) {
      return { ...empty, pollMultiplier: 1 };
    }

    for (const seat of seats) {
      seat.weightShare = rn(seat.weight / weightSum, 3);
    }
    seats.sort((a, b) => b.population - a.population);

    const averageLevy = levyWeightSum / weightSum;
    const extractShare = extractWeight / weightSum;
    const pollMultiplier = domainLevyToPollMultiplier(averageLevy, extractShare);

    return {
      stateId: state.i,
      stateName: state.name || `State ${state.i}`,
      pollMultiplier,
      averageLevy: rn(averageLevy, 2),
      extractShare: rn(extractShare, 3),
      seats
    };
  } catch {
    return empty;
  }
}

/** All non-neutral states with at least one domain seat. */
export function getAllDomainPollDetails(): DomainPollDetail[] {
  try {
    const { pack } = getWorldContext();
    const rows: DomainPollDetail[] = [];
    for (const state of pack.states || []) {
      if (!state?.i || state.removed) continue;
      const detail = getDomainPollDetail(state);
      if (detail.seats.length > 0) rows.push(detail);
    }
    rows.sort((a, b) => b.pollMultiplier - a.pollMultiplier || a.stateName.localeCompare(b.stateName));
    return rows;
  } catch {
    return [];
  }
}
