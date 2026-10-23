/**
 * Shared type for the Fauna Population Stock Model
 * (docs/plan/biome-goods-producer-ecosystem.md §4, Phase 2). Split out from faunaPopulation.ts so
 * economyContext.ts can type its sparse storage getters without importing the generator module
 * itself (mirrors mineralResourcesTypes.ts/guildKnowledgeTypes.ts and friends).
 */

/**
 * A per-(cell, species) headcount split into three age classes, no sex split (§4.1 — most species
 * don't need the male/female ratio to be the limiting factor for this first cut). `young` hasn't
 * reached breeding age; `breeding` is the reproducing cohort carrying capacity is sized against;
 * `old` has aged out of breeding but is still alive (and, for wild stock, still huntable).
 */
export interface FaunaCohorts {
  young: number;
  breeding: number;
  old: number;
}

/** Latest source-cell dispatch receipt and fractional demand, never a bank of real animals. */
export interface LivestockDispatchState {
  period: number;
  remainderHeads: number;
  /** Latest read-only observation, excluded from archive serialization. */
  observation?: LivestockDispatchObservation;
}

export interface LivestockDispatchObservation {
  heads: number;
  marketUnits: number;
  stockTracked: boolean;
  herdBeforeHeads: number | null;
  herdAfterHeads: number | null;
}
