/** Coarse city-guild knowledge domains (docs/plan/knowledge-guild-system.md §3-A, §8.1 decision 1). */
export const CRAFT_KNOWLEDGE_DOMAINS = [
  "metallurgy",
  "woodworking",
  "masonry",
  "textiles",
  "leather",
  "glassware",
  "instruments",
  "printing"
] as const;
export type CraftKnowledgeDomain = (typeof CRAFT_KNOWLEDGE_DOMAINS)[number];

/**
 * A Burg-scoped guild's accumulated technique for one craft domain. Any Burg with at least one
 * practitioner can carry a technique stock — there is no minimum population/burg.group gate
 * (docs/plan/knowledge-guild-system.md §8.1 decision 2): a handful of smiths in a small village
 * can retain a modest technique stock and, given time, reach the same technique quality as a large
 * city's formal guild hall. What differs by settlement size is headcount (aggregate output), not the
 * achievable stock ceiling.
 */
export interface GuildKnowledgeStock {
  burgId: number;
  domain: CraftKnowledgeDomain;
  /** 0..1 saturating EWMA, same shape as MineOperation/SmelterOperation.toolsInvestmentStock. */
  stock: number;
  /**
   * The domain guild's own private capital at this Burg, separate from `burg.treasury`
   * (docs/plan/burg-treasury-equilibrium.md §3.1) — funded by a share of this guild's
   * craft-domain manufacturing profit (guildTreasury.ts's GUILD_PROFIT_SHARE) and trickled back to
   * the Burg when it falls below its comfortable level (GUILD_PAYOUT_RATE). Independent of `stock`
   * (technique) — a technique stock can be flush with capital while still unskilled, or vice versa.
   */
  treasury: number;
}

/**
 * Smoothed per-Burg manufacturing headcount for one craft domain, the domain-split counterpart
 * of `CraftEmploymentRecord` (`craftEmployment.ts`). Kept as a separate slice rather than adding
 * a `domain` field to `CraftEmploymentRecord` itself, so `basicEmployment.ts`'s and
 * `employment-overview.ts`'s existing single-total-per-Burg readers stay untouched
 * (docs/plan/knowledge-guild-system.md §9 Phase 2).
 */
export interface CraftDomainEmploymentRecord {
  burgId: number;
  domain: CraftKnowledgeDomain;
  workers: number;
}

/**
 * Which craft-guild domain a recipe-output Good's manufacturing belongs to (docs/plan/
 * knowledge-guild-system.md §3-A). Keyed by `Good.name` since `good.recipes` ingredient keys are
 * resolved to numeric ids at registration time but `Good.name` stays stable. Only recipe-bearing
 * Goods that map cleanly onto a single dominant craft are listed — Gunpowder/Artillery (state
 * secret domain, §3-C, Phase 4) and plain food/luxury draws (no guild in this taxonomy) are
 * deliberately absent and simply get no guild bonus. Ship hulls (Sloop/Caravel/Galleon) have no
 * `recipes` — they are produced by the shipbuilding extension, not this loop — so the
 * woodworking↔shipbuilding connection described in §3-A stays future work.
 */
export const CRAFT_DOMAIN_BY_GOOD_NAME: Readonly<Record<string, CraftKnowledgeDomain>> = {
  Bronze: "metallurgy",
  Tools: "metallurgy",
  Arms: "metallurgy",
  Bullets: "metallurgy",
  Harnesses: "metallurgy",
  Barrels: "woodworking",
  Ropes: "woodworking",
  Arrows: "woodworking",
  Lime: "masonry",
  "Roman Concrete": "masonry",
  Cloth: "textiles",
  Garments: "textiles",
  Sails: "textiles",
  Leather: "leather",
  Boots: "leather",
  Ceramics: "glassware",
  Glass: "glassware",
  "Lab Glassware": "glassware",
  Paper: "printing",
  Ink: "printing",
  Books: "printing",
  Liquor: "instruments"
};

/** null when the Good has no guild-craft domain (unmapped recipe good, or a raw resource). */
export function getCraftDomainForGood(goodName: string): CraftKnowledgeDomain | null {
  return CRAFT_DOMAIN_BY_GOOD_NAME[goodName] ?? null;
}
