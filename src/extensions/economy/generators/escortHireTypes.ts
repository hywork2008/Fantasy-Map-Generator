/**
 * Escort (護衛) hire-board types — protect trade caravans and travelers
 * between burgs. Available in all culture sets.
 */

/** What the contract is protecting. */
export type EscortKind = "trade" | "traveler";

/**
 * How the party travels.
 * - caravan: same land/sea/river movement model as trade caravans
 * - foot: overland pedestrian pace (travelers only; slower, slightly lower fee)
 */
export type EscortTransport = "caravan" | "foot";

/** Posted fee relative to calculated market rate. */
export type EscortMarketRate = "low" | "market" | "high";

/** Ecology/death tier stored on contracts. Injury is orthogonal. */
export type EscortEcologyOutcome = "success" | "partial" | "fail" | "dead";

export interface EscortRouteThreatSnapshot {
  /** Mean cells.danger along sampled land cells, 0..1. */
  avgDanger: number;
  /** Peak cells.danger along route, 0..1. */
  maxDanger: number;
  /** Bandit pressure contribution 0..1 (from UrbanLaborIntake / TradeSecurity). */
  banditThreat: number;
  /**
   * Beast / residual wilderness hazard 0..1 (danger field + frontier stage).
   * On standard culture sets this may still be >0 from frontier cells even when
   * monsters are not painted.
   */
  beastThreat: number;
  /**
   * Civic security deficit 0..1 — higher when bandits erode local order.
   * Derived; not a separate map layer in v1.
   */
  securityDeficit: number;
  /** Combined 0..1.5 score used by fee and combat difficulty. */
  threatScore: number;
}

export interface EscortJobPosting {
  i: number;
  /** Origin burg (board location; applicant must be present). */
  burgId: number;
  stateId: number;
  destinationBurgId: number;
  kind: EscortKind;
  transport: EscortTransport;
  /** One-way travel days (mission length). */
  missionDays: number;
  /** Threat breakdown at post time (fee is frozen here). */
  threat: EscortRouteThreatSnapshot;
  /** Full success fee in treasury / wealth units. */
  fee: number;
  feePartial: number;
  marketRate: EscortMarketRate;
  /** Multiplier that produced fee from the raw market quote. */
  rateMultiplier: number;
  openSeats: number;
  postedAtDay: number;
  expiresInDays: number;
  /** English UI label, e.g. "Escort caravan to Aster". */
  label: string;
}

export interface EscortHireApplication {
  i: number;
  postingId: number;
  burgId: number;
  /** Named character; null = anonymous NPC. */
  characterId: number | null;
  daysRemaining: number;
}

export interface EscortActiveContract {
  i: number;
  postingId: number;
  burgId: number;
  stateId: number;
  destinationBurgId: number;
  characterId: number | null;
  kind: EscortKind;
  transport: EscortTransport;
  fee: number;
  feePartial: number;
  threatScore: number;
  missionDaysRemaining: number;
  /**
   * Treasury units deducted on accept (named only).
   * Always 0 for anon.
   */
  escrow: number;
  lastOutcome?: EscortEcologyOutcome;
  label: string;
}

/** characterId (string key) → simulation ordinal day when injury cooldown ends. */
export type EscortCooldowns = Record<string, number>;

export const ESCORT_ROLE_SOURCE = "economy";
export const ESCORT_ROLE_KIND = "escortGuard";
