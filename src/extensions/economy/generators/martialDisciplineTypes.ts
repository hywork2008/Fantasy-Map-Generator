/**
 * State-scoped standing-army training layer (docs/plan/knowledge-guild-system.md §2, §3-D,
 * §9 Phase 5). New domain cluster — absent from both source CSVs. Scope is State/standing-army,
 * not Burg, and headcount is drawn from `state.military[].u`, classified by each unit's `type`
 * field (options.military), not by matching unit display names.
 *
 * Only 3 of §3-D's 4 domains are wired up: swordsmanship ("melee"), archery ("ranged"),
 * horsemanship ("mounted"). "spearmanship" is deferred — the base game defines a single generic
 * "melee" unit type with no separate pike/sword split, so there is no data source that
 * distinguishes it from swordsmanship without inventing an arbitrary classification rule.
 */
export const MARTIAL_DISCIPLINE_DOMAINS = ["swordsmanship", "archery", "horsemanship"] as const;
export type MartialDisciplineDomain = (typeof MARTIAL_DISCIPLINE_DOMAINS)[number];

export interface MartialDisciplineStock {
  stateId: number;
  domain: MartialDisciplineDomain;
  stock: number; // 0..1 EWMA, driven by standing regiment headcount (martialDisciplineKnowledge.ts)
}
