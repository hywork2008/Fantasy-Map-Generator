/** Coarse city-guild knowledge domains (docs/plan/knowledge-guild-system.md §3-A, §8.1 decision 1). */
export const CRAFT_KNOWLEDGE_DOMAINS = ["metallurgy"] as const;
export type CraftKnowledgeDomain = (typeof CRAFT_KNOWLEDGE_DOMAINS)[number];

/**
 * A Burg-scoped guild's accumulated technique for one craft domain. Any Burg with at least one
 * practitioner can carry a stock — there is no minimum population/burg.group gate
 * (docs/plan/knowledge-guild-system.md §8.1 decision 2): a handful of smiths in a small village
 * can found a modest guild chapter and, given time, reach the same technique quality as a large
 * city's guild hall. What differs by settlement size is headcount (aggregate output), not the
 * achievable stock ceiling.
 */
export interface GuildKnowledgeStock {
  burgId: number;
  domain: CraftKnowledgeDomain;
  /** 0..1 saturating EWMA, same shape as MineOperation/SmelterOperation.toolsInvestmentStock. */
  stock: number;
}
