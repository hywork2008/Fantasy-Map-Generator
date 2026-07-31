/**
 * State-scoped "national secrets" knowledge layer (docs/plan/knowledge-guild-system.md §2, §3-C,
 * §9 Phase 4). Distinct from GuildKnowledgeStock/AcademyKnowledgeStock: scope is State rather than
 * Burg, and growth is driven by continuous Treasury investment (§8.1 decision 2's "財源+常備インフラ"),
 * not practitioner headcount.
 *
 * Only "pyrotechnics" is wired up. §3-C's other two domains (militaryEngineering,
 * fortificationScience) have no existing consumer anywhere in the codebase — siege/fortress
 * mechanics live in the Nobility extension, and Economy must not depend on Nobility (AGENTS.md §7.1
 * import direction) — so they are deferred until Nobility exposes a read path for this stock (§7).
 */
export const STATE_SECRET_DOMAINS = ["pyrotechnics"] as const;
export type StateSecretDomain = (typeof STATE_SECRET_DOMAINS)[number];

export interface StateSecretStock {
  stateId: number;
  domain: StateSecretDomain;
  stock: number; // 0..1 EWMA, driven by annual Treasury investment (stateSecretKnowledge.ts)
}
