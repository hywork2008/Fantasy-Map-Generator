/**
 * Economic-base multiplier converting a Burg's basic (export-earning) employment into the
 * non-basic service employment it supports — innkeepers, victuallers, market brokers, and
 * artisans not tied to raw-material extraction (docs/plan/urban-employment-demand.md §3.5).
 * Historical estimates for pre-industrial/medieval towns commonly place the non-basic
 * service sector at roughly 1x to 2.5x the basic-industry workforce; 1.5 is a plausible
 * middle value, deliberately not calibrated further (§5.1 decision 3: put in something that
 * "looks about right" and tune later rather than chase historical precision).
 */
const SERVICE_EMPLOYMENT_MULTIPLIER = 1.5;

export interface BasicEmploymentSummaryRecord {
  burgId: number;
  /**
   * Sum of this Burg's Burg-anchored basic employment (administration + mining + smelting,
   * Phases 1 & 3). Port/trade employment is Market-anchored (`LaborMarket`, Phase 2) and not
   * yet attributed back to a single Burg here — that attribution, and the full
   * `employmentDemand` aggregation, is Phase 4.
   */
  basicEmploymentDemand: number;
  serviceEmploymentDemand: number;
}

export function getServiceEmploymentDemand(basicEmploymentDemand: number): number {
  return Math.max(0, basicEmploymentDemand) * SERVICE_EMPLOYMENT_MULTIPLIER;
}

export function buildBasicEmploymentSummary(
  burgId: number,
  basicEmploymentDemand: number
): BasicEmploymentSummaryRecord {
  const clamped = Math.max(0, basicEmploymentDemand);
  return {
    burgId,
    basicEmploymentDemand: clamped,
    serviceEmploymentDemand: getServiceEmploymentDemand(clamped)
  };
}
