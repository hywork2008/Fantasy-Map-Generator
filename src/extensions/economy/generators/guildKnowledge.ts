import { rn } from "../../hostUtils";
import {
  getCraftDomainEmploymentRecords,
  getGuildKnowledgeLastSettledYear,
  getGuildKnowledgeStocks,
  getSimulationYear,
  getSmelterOperations,
  setGuildKnowledgeLastSettledYear,
  setGuildKnowledgeStocks
} from "../economyContext";
import type { CraftKnowledgeDomain, GuildKnowledgeStock } from "./guildKnowledgeTypes";

/**
 * Drives every craft-guild domain's per-Burg GuildKnowledgeStock (docs/plan/
 * knowledge-guild-system.md §9). Metallurgy's practitioner pool combines SmelterOperation.workers
 * (ore→ingot refining, Phase 1) with the metallurgy-domain slice of CraftDomainEmploymentRecord
 * (ingot→goods smithing, Phase 2); every other domain is driven by CraftDomainEmploymentRecord
 * alone, since it has no dedicated site/operation module of its own.
 */

/**
 * Practitioner headcount that already counts as a "fully staffed" guild chapter for technique
 * purposes. Deliberately small: a handful of master craftspeople (docs/plan/
 * knowledge-guild-system.md §8.1 decision 2 — village chapters of a few practitioners are
 * explicitly allowed) can mature a domain's technique on their own. A big city's larger workforce
 * raises aggregate output through its higher worker count, not the achievable stock ceiling.
 */
export const GUILD_SATURATION_WORKERS = 6;
/** EWMA smoothing: ~7 simulated years of sustained full staffing to approach stock = 1. */
export const GUILD_ADOPTION_RATE = 0.15;
/** Undermanned/abandoned guild chapters lose technique at the same rate they would have gained it. */
export const GUILD_DECAY_RATE = 0.15;
/** How much stock=1 raises a domain's production efficiency (SmelterOperation.processingFactor, recipe yield). */
export const GUILD_BONUS_MAX = 0.25;
/** Below this a decayed stock is dropped instead of lingering at a near-zero value forever. */
const MIN_TRACKED_STOCK = 0.001;

function keyOf(burgId: number, domain: CraftKnowledgeDomain): string {
  return `${burgId}:${domain}`;
}

type Practitioners = { burgId: number; domain: CraftKnowledgeDomain; workers: number };

export class GuildKnowledgeModule {
  /**
   * Runs at most once per simulation year. Must run after reconcileAnnualBasicEmploymentWorkers()
   * within the same tick so this year's freshly-reconciled worker headcounts feed this year's
   * coverage calc instead of last year's stale figures (docs/plan/knowledge-guild-system.md §9
   * Phase 1).
   */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getGuildKnowledgeLastSettledYear() === year) return false;
    setGuildKnowledgeLastSettledYear(year);

    const practitioners = this.collectPractitioners();
    const remaining = new Map(getGuildKnowledgeStocks().map(entry => [keyOf(entry.burgId, entry.domain), entry]));

    const next: GuildKnowledgeStock[] = [];
    for (const { burgId, domain, workers } of practitioners.values()) {
      const key = keyOf(burgId, domain);
      const previousStock = remaining.get(key)?.stock ?? 0;
      remaining.delete(key);

      const coverage = Math.min(1, workers / GUILD_SATURATION_WORKERS);
      const stock = rn(previousStock * (1 - GUILD_ADOPTION_RATE) + coverage * GUILD_ADOPTION_RATE, 4);
      next.push({ burgId, domain, stock });
    }

    // A Burg whose practitioners vanished (site closed, workers reassigned) keeps its guild hall
    // decaying for a while instead of vanishing the instant its last worker leaves.
    for (const orphan of remaining.values()) {
      const stock = rn(orphan.stock * (1 - GUILD_DECAY_RATE), 4);
      if (stock > MIN_TRACKED_STOCK) next.push({ ...orphan, stock });
    }

    setGuildKnowledgeStocks(next);
    return true;
  }

  private collectPractitioners(): Map<string, Practitioners> {
    const practitioners = new Map<string, Practitioners>();
    const add = (burgId: number, domain: CraftKnowledgeDomain, workers: number) => {
      if (workers <= 0) return;
      const key = keyOf(burgId, domain);
      const entry = practitioners.get(key);
      if (entry) entry.workers += workers;
      else practitioners.set(key, { burgId, domain, workers });
    };

    for (const smelter of getSmelterOperations()) {
      if (smelter.active) add(smelter.burgId, "metallurgy", smelter.workers);
    }
    for (const record of getCraftDomainEmploymentRecords()) {
      add(record.burgId, record.domain, record.workers);
    }

    return practitioners;
  }
}

export const GuildKnowledge = new GuildKnowledgeModule();

/** 1 + technique bonus for a Burg's guild in the given domain; 1 (no bonus) when no stock is tracked yet. */
export function getGuildBonus(burgId: number, domain: CraftKnowledgeDomain): number {
  const stock = getGuildKnowledgeStocks().find(entry => entry.burgId === burgId && entry.domain === domain)?.stock ?? 0;
  return 1 + GUILD_BONUS_MAX * stock;
}
