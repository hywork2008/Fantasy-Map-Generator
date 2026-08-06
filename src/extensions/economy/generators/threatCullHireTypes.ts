/**
 * Threat cull / pest-control hire-board types.
 * Spec: docs/plan/player-threat-cull-jobs.md PR-2.
 */
import type { CullTargetRef } from "../../../generators/threatCullEffects";

export type { CullTargetRef };

export type CullContractRole = "hunter" | "pestController";

/** Ecology + death tier stored on contracts and used for pay. Injury is orthogonal. */
export type CullEcologyOutcome = "success" | "partial" | "fail" | "dead";

/** @deprecated name — use CullEcologyOutcome */
export type CullCombatOutcome = CullEcologyOutcome;

export interface CullJobPosting {
  i: number;
  burgId: number;
  stateId: number;
  target: CullTargetRef;
  /** ThreatCullProject.cellId when this is a join-macro post; otherwise null. */
  macroCellId: number | null;
  /** Full success bounty (target-only at post time). */
  bounty: number;
  bountyPartial: number;
  missionDays: number;
  /**
   * Display tier only (from rarity, clamped 1–5).
   * Never passed into combat — combat uses targetDifficulty(target).
   */
  uiDifficulty: number;
  /** Base open seats when posted (usually 1). Live free seats subtract pending/active. */
  openSeats: number;
  /** Simulation ordinal day when posted. */
  postedAtDay: number;
  /** Days until this post is removed from the board. */
  expiresInDays: number;
}

export interface CullHireApplication {
  i: number;
  postingId: number;
  burgId: number;
  /** Named character applying; null = anonymous NPC. */
  characterId: number | null;
  daysRemaining: number;
}

export interface CullActiveContract {
  i: number;
  postingId: number;
  burgId: number;
  stateId: number;
  /** Named hunter; null = anonymous NPC mission (K11). */
  characterId: number | null;
  target: CullTargetRef;
  macroCellId: number | null;
  bounty: number;
  bountyPartial: number;
  /** Days until the single combat resolve (v1). */
  missionDaysRemaining: number;
  /**
   * Treasury units already deducted on accept (K13).
   * Always 0 for anon (`characterId === null`).
   */
  escrow: number;
  role: CullContractRole;
  /** Ecology/death tier only — never "injured" (K19). */
  lastOutcome?: CullEcologyOutcome;
}

/** characterId (string key) → simulation ordinal day when cooldown ends. */
export type CullCooldowns = Record<string, number>;

export const CULL_ROLE_SOURCE = "economy";
export const CULL_HUNTER_ROLE_KIND = "cullHunter";
export const CULL_PEST_ROLE_KIND = "pestController";
