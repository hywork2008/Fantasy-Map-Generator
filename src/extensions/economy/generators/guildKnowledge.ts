import { rn } from "../../hostUtils";
import {
  getGuildKnowledgeLastSettledYear,
  getGuildKnowledgeStocks,
  getSimulationYear,
  getSmelterOperations,
  setGuildKnowledgeLastSettledYear,
  setGuildKnowledgeStocks
} from "../economyContext";
import type { GuildKnowledgeStock } from "./guildKnowledgeTypes";

/**
 * Drives the Metallurgy domain's per-Burg GuildKnowledgeStock from SmelterOperation.workers —
 * the Phase 1 vertical slice of docs/plan/knowledge-guild-system.md (§9). Later domains (§3-A)
 * will need their own practitioner source once craft employment is tracked per-domain rather than
 * as one aggregate CraftEmploymentRecord (docs/plan/knowledge-guild-system.md §9 Phase 2 note).
 */

/**
 * Practitioner headcount that already counts as a "fully staffed" guild chapter for technique
 * purposes. Deliberately small: a handful of master smiths (docs/plan/knowledge-guild-system.md
 * §8.1 decision 2 — village chapters of a few practitioners are explicitly allowed) can mature a
 * domain's technique on their own. A big city's larger smelting workforce raises aggregate
 * output through its higher worker count, not the achievable stock ceiling.
 */
export const METALLURGY_GUILD_SATURATION_WORKERS = 6;
/** EWMA smoothing: ~7 simulated years of sustained full staffing to approach stock = 1. */
export const METALLURGY_GUILD_ADOPTION_RATE = 0.15;
/** Undermanned/abandoned guild chapters lose technique at the same rate they would have gained it. */
export const METALLURGY_GUILD_DECAY_RATE = 0.15;
/** How much stock=1 raises SmelterOperation.processingFactor, alongside toolsInvestmentStock. */
export const METALLURGY_GUILD_BONUS_MAX = 0.25;
/** Below this a decayed stock is dropped instead of lingering at a near-zero value forever. */
const MIN_TRACKED_STOCK = 0.001;

export class GuildKnowledgeModule {
  /**
   * Runs at most once per simulation year. Must run after reconcileAnnualBasicEmploymentWorkers()
   * within the same tick so this year's freshly-reconciled SmelterOperation.workers headcount
   * feeds this year's coverage calc instead of last year's stale figure
   * (docs/plan/knowledge-guild-system.md §9 Phase 1).
   */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getGuildKnowledgeLastSettledYear() === year) return false;
    setGuildKnowledgeLastSettledYear(year);

    const remainingByBurg = new Map(
      getGuildKnowledgeStocks()
        .filter(entry => entry.domain === "metallurgy")
        .map(entry => [entry.burgId, entry])
    );

    const next: GuildKnowledgeStock[] = [];
    for (const smelter of getSmelterOperations()) {
      const previous = remainingByBurg.get(smelter.burgId);
      remainingByBurg.delete(smelter.burgId);
      const previousStock = previous?.stock ?? 0;

      if (!smelter.active) {
        const stock = rn(previousStock * (1 - METALLURGY_GUILD_DECAY_RATE), 4);
        if (stock > MIN_TRACKED_STOCK) next.push({ burgId: smelter.burgId, domain: "metallurgy", stock });
        continue;
      }

      const coverage = Math.min(1, smelter.workers / METALLURGY_GUILD_SATURATION_WORKERS);
      const stock = rn(
        previousStock * (1 - METALLURGY_GUILD_ADOPTION_RATE) + coverage * METALLURGY_GUILD_ADOPTION_RATE,
        4
      );
      next.push({ burgId: smelter.burgId, domain: "metallurgy", stock });
    }

    // A Burg whose smelter site disappeared (deposit exhausted, mine closed) keeps its guild hall
    // decaying for a while instead of vanishing the instant the physical site is gone.
    for (const orphan of remainingByBurg.values()) {
      const stock = rn(orphan.stock * (1 - METALLURGY_GUILD_DECAY_RATE), 4);
      if (stock > MIN_TRACKED_STOCK) next.push({ ...orphan, stock });
    }

    setGuildKnowledgeStocks(next);
    return true;
  }
}

export const GuildKnowledge = new GuildKnowledgeModule();

/** 1 + technique bonus for a Burg's Metallurgy guild; 1 (no bonus) when no stock is tracked yet. */
export function getMetallurgyGuildBonus(burgId: number): number {
  const stock =
    getGuildKnowledgeStocks().find(entry => entry.burgId === burgId && entry.domain === "metallurgy")?.stock ?? 0;
  return 1 + METALLURGY_GUILD_BONUS_MAX * stock;
}
