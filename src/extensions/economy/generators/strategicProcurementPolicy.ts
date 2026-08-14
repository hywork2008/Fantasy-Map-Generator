import type { Burg, State } from "../../hostTypes";
import type { Market } from "./marketTypes";

export type ForeignProcurementMode = "domesticOnly" | "alliesAndNeutral" | "unrestricted";

/**
 * Per-state policy data owned by Economy once strategic procurement orders arrive
 * in M9.2. The policy deliberately stores Good ids, keeping Good-name knowledge out
 * of the trade core.
 */
export interface StrategicGoodsPolicy {
  stateId: number;
  goodIds: number[];
  foreignProcurement: ForeignProcurementMode;
  enemyTrade: "prohibited";
  targetReserveDays: number;
  domesticPurchasePremium: number;
  maxProcurementDays: number;
}

export type StrategicMarketRelationship = "domestic" | "ally" | "neutral" | "enemy";

export interface StrategicProcurementCandidate {
  sourceMarketId: number;
  sourceStateId: number;
  relationship: StrategicMarketRelationship;
  landedUnitPrice: number;
  durationDays: number;
  availableUnits: number;
}

type MarketCenter = Pick<Market, "centerBurgId">;
type MarketCenterBurg = Pick<Burg, "state">;
type DiplomaticState = Pick<State, "diplomacy">;

/** State 0 (or a missing market center) is deliberately neutral, never domestic or Enemy. */
export function getMarketStateId(market: MarketCenter, burgs: readonly (MarketCenterBurg | undefined)[]): number {
  return burgs[market.centerBurgId]?.state ?? 0;
}

/**
 * Resolves the relationship relevant to a strategic purchase. Diplomacy generation
 * normally keeps its table symmetric, but checking both directions prevents a
 * half-written save from opening an Enemy trade route.
 */
export function getStrategicMarketRelationship(
  destination: MarketCenter,
  source: MarketCenter,
  burgs: readonly (MarketCenterBurg | undefined)[],
  states: readonly (DiplomaticState | undefined)[]
): StrategicMarketRelationship {
  const destinationStateId = getMarketStateId(destination, burgs);
  const sourceStateId = getMarketStateId(source, burgs);

  if (destinationStateId !== 0 && destinationStateId === sourceStateId) return "domestic";
  if (destinationStateId === 0 || sourceStateId === 0) return "neutral";

  const destinationRelation = states[destinationStateId]?.diplomacy?.[sourceStateId];
  const sourceRelation = states[sourceStateId]?.diplomacy?.[destinationStateId];
  if (destinationRelation === "Enemy" || sourceRelation === "Enemy") return "enemy";
  if (isFriendlyRelation(destinationRelation) && isFriendlyRelation(sourceRelation)) return "ally";
  return "neutral";
}

function isFriendlyRelation(relation: unknown): boolean {
  return relation === "Ally" || relation === "Friendly";
}

/** Enemy strategic-material trade is prohibited under every Phase 9 policy mode. */
export function isStrategicProcurementPermitted(
  relationship: StrategicMarketRelationship,
  foreignProcurement: ForeignProcurementMode
): boolean {
  if (relationship === "enemy") return false;
  return relationship === "domestic" || foreignProcurement !== "domesticOnly";
}

/**
 * Selects viable sources without mutating Economy state. `alliesAndNeutral` is
 * domestic-first, then allied and neutral sources; `unrestricted` retains the Enemy
 * embargo but compares every remaining source by landed price. Price, duration,
 * spare stock, then market id produce deterministic choices within the same tier.
 */
export function rankStrategicProcurementCandidates(
  candidates: readonly StrategicProcurementCandidate[],
  foreignProcurement: ForeignProcurementMode
): StrategicProcurementCandidate[] {
  return candidates
    .filter(
      candidate =>
        candidate.availableUnits > 0 &&
        Number.isFinite(candidate.landedUnitPrice) &&
        Number.isFinite(candidate.durationDays) &&
        isStrategicProcurementPermitted(candidate.relationship, foreignProcurement)
    )
    .toSorted((a, b) => {
      if (foreignProcurement === "alliesAndNeutral" && a.relationship !== b.relationship) {
        return getRelationshipPriority(a.relationship) - getRelationshipPriority(b.relationship);
      }

      return (
        a.landedUnitPrice - b.landedUnitPrice ||
        a.durationDays - b.durationDays ||
        b.availableUnits - a.availableUnits ||
        a.sourceMarketId - b.sourceMarketId
      );
    });
}

function getRelationshipPriority(relationship: StrategicMarketRelationship): number {
  if (relationship === "domestic") return 0;
  if (relationship === "ally") return 1;
  if (relationship === "neutral") return 2;
  return 3;
}
