/**
 * Distant Realms / Overseas Trading Companies — Phase 0–2 data model.
 * Design: docs/plan/distant-realms-overseas-trade.md
 *
 * DistantRealm is deliberately NOT a full State: no cells, no geometry, no per-burg simulation.
 * It only carries the handful of numbers Overseas Relations needs to run trade voyages and (in
 * later phases) tribute/colonization. This keeps the "abstracted East India Company" promise —
 * the map's Economy extension's per-burg complexity does not apply here.
 */

export const CLIMATE_BANDS = ["polar", "temperate", "arid", "subtropical", "tropical"] as const;
export type ClimateBand = (typeof CLIMATE_BANDS)[number];

export const DISTANCE_BANDS = ["nearAbroad", "farAbroad", "remote"] as const;
export type DistanceBand = (typeof DISTANCE_BANDS)[number];

/** Derived at read time from overseasProjectionScore(state) vs. DistantRealm.powerScore — never stored. */
export type PowerTier = "weaker" | "comparable" | "stronger";

export type RealmRelation = "unknown" | "contacted" | "trading" | "tributary" | "colony" | "hostile";

export interface DistantRealm {
  i: number;
  name: string;
  climateBand: ClimateBand;
  distanceBand: DistanceBand;
  /** Abstract naval/military strength, compared against a state's overseasProjectionScore. */
  powerScore: number;
  /** Abstract treasury the realm can be taxed/raided from (Phase 3+; unused by Phase 1 trade). */
  wealthLevel: number;
  /** Abstract defense used by tribute/raid/colonize success rolls (Phase 3+; unused by Phase 1). */
  defenseScore: number;
  /** Existing Economy Good names this realm exports. Phase 1 draws only from this list. */
  specialtyGoodNames: string[];
}

/** One state's relationship with one DistantRealm. Created lazily on first contact. */
export interface OverseasRelationLedger {
  stateId: number;
  realmId: number;
  relation: RealmRelation;
  /** Simulation day (getSimulationDay()) of the most recent resolved expedition, for UI display. */
  lastResolvedTick?: number;
  /** Phase 4 colonization upkeep — present only once relation reaches "colony". */
  colonyGarrisonRequired?: number;
  colonyGarrisonFunded?: number;
  monthsUnderfunded: number;
}

export type ExpeditionPurpose = "trade";
export type ExpeditionState = "outbound" | "resolved";
export type ExpeditionOutcomeCause = "shipwreck" | "piracy";

export interface OverseasExpeditionOutcome {
  lost: boolean;
  cause?: ExpeditionOutcomeCause;
  /** Treasury credited on arrival (0 when lost). */
  profit?: number;
}

export interface OverseasExpedition {
  id: number;
  stateId: number;
  realmId: number;
  purpose: ExpeditionPurpose;
  /** Good actually carried this trip, chosen from the realm's specialtyGoodNames. */
  goodId: number;
  /** Ties this expedition to MerchantTransportAssets' reservation lifecycle (shared ship pool). */
  reservationId: number;
  /** State-owned navy hulls committed to this convoy for its whole round trip (Phase 2). */
  escortHullIds: number[];
  portMarketId: number;
  /** Treasury already spent funding the venture; lost outright if the voyage is lost. */
  buyCost: number;
  departedTick: number;
  etaTick: number;
  state: ExpeditionState;
  outcome?: OverseasExpeditionOutcome;
}
