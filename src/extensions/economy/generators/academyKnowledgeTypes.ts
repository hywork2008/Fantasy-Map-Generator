/**
 * Coarse Academy/monastery knowledge domains (docs/plan/knowledge-guild-system.md §3-B).
 * Only "administration" is wired up so far: medicine, theology, and naturalPhilosophy have no
 * existing per-Burg practitioner headcount or bonus consumer anywhere in the codebase (unlike the
 * craft domains in guildKnowledgeTypes.ts, which reuse SmelterOperation/CraftDomainEmploymentRecord
 * worker loops that were already simulated) — inventing headcount/consumer mechanics for them from
 * scratch is deferred to a later phase (docs/plan/knowledge-guild-system.md §9 Phase 3 state note).
 */
export const SCHOLARLY_KNOWLEDGE_DOMAINS = ["administration"] as const;
export type ScholarlyKnowledgeDomain = (typeof SCHOLARLY_KNOWLEDGE_DOMAINS)[number];

/**
 * A Burg-scoped academy/chancery's accumulated technique for one scholarly domain, same shape as
 * `GuildKnowledgeStock` (`guildKnowledgeTypes.ts`) — 0..1 saturating EWMA driven by practitioner
 * headcount, no population/burg.group gate.
 */
export interface AcademyKnowledgeStock {
  burgId: number;
  domain: ScholarlyKnowledgeDomain;
  stock: number;
}
