import { applyKnowledgeEwma, rn } from "../../hostUtils";
import {
  getCraftDomainEmploymentRecords,
  getGuildKnowledgeLastSettledYear,
  getGuildKnowledgeStocks,
  getSimulationYear,
  getSmelterOperations,
  getWorldContext,
  setGuildKnowledgeLastSettledYear,
  setGuildKnowledgeStocks
} from "../economyContext";
import { getEconomyCalibrationState } from "../store/economyCalibrationState";
import { guildSaturationPoints, peopleToPoints } from "./craftScale";
import type { CraftKnowledgeDomain, GuildKnowledgeStock } from "./guildKnowledgeTypes";
import { GUILD_SITE_KNOWLEDGE_CAP_PEOPLE, getSmelterEmploymentPeople } from "./smelterOperationsTypes";
import { getDerivedExtraWorkers, isCraftKnowledgeDomain } from "./technologyBiasApply";

/**
 * Drives every craft-guild domain's per-Burg GuildKnowledgeStock (docs/plan/
 * knowledge-guild-system.md §9). Metallurgy's practitioner pool combines SmelterOperation.workers
 * (ore→ingot refining, Phase 1) with the metallurgy-domain slice of CraftDomainEmploymentRecord
 * (ingot→goods smithing, Phase 2); every other domain is driven by CraftDomainEmploymentRecord
 * alone, since it has no dedicated site/operation module of its own.
 */

/**
 * Practitioner headcount sufficient for a technique stock to reach its full maturity
 * purposes. Deliberately small: a handful of master craftspeople (docs/plan/
 * knowledge-guild-system.md §8.1 decision 2 — village chapters of a few practitioners are
 * explicitly allowed) can mature a domain's technique on their own. A big city's larger workforce
 * raises aggregate output through its higher worker count, not the achievable stock ceiling.
 */
export const GUILD_SATURATION_WORKERS = 6;
/** EWMA smoothing: ~7 simulated years of sustained full staffing to approach stock = 1. */
export const GUILD_ADOPTION_RATE = 0.15;
/** Undermanned/abandoned technique stocks lose technique at the same rate they would have gained it. */
export const GUILD_DECAY_RATE = 0.15;
/** How much stock=1 raises a domain's production efficiency (SmelterOperation.processingFactor, recipe yield). */
export const GUILD_BONUS_MAX = 0.25;
/** Below this a decayed stock is dropped instead of lingering at a near-zero value forever. */
const MIN_TRACKED_STOCK = 0.001;
/**
 * One-time hit applied when a guild master dies with no apprentice to inherit their technique
 * ("secrets were lost") — steeper than the routine annual GUILD_DECAY_RATE since this is a
 * discrete event, not gradual understaffing (docs/plan/knowledge-guild-system.md §5, §9 Phase 6).
 */
export const GUILD_MASTERLESS_DEATH_PENALTY = 0.3;
/**
 * One-time hit applied to every domain a conquered Burg has a tracked guild stock in, the instant
 * it changes hands to a State that never held it before — GuildKnowledgeStock is Burg-scoped, so
 * without this a conqueror would get the captured guild's full accumulated technique for free the
 * moment the burg falls. §8.1 decision 3 ("not instant full absorption, integrate gradually over
 * years, with room for loss in the immediate post-conquest chaos") is realized by this penalty
 * plus the existing annual EWMA simply doing its normal job under the new owner — no separate
 * "integration" logic is needed (docs/plan/knowledge-guild-system.md §9 Phase 7).
 */
export const GUILD_CONQUEST_DISRUPTION_PENALTY = 0.4;

function keyOf(burgId: number, domain: CraftKnowledgeDomain): string {
  return `${burgId}:${domain}`;
}

export type GuildPractitioners = { burgId: number; domain: CraftKnowledgeDomain; workers: number };

/**
 * Live practitioner headcount that drives guild technique coverage (`workers / 6`).
 * Metallurgy sums active smelter workers with metallurgy craft employment; other domains use
 * craft-domain employment plus any player-bias extra seats.
 */
export function collectGuildPractitioners(): Map<string, GuildPractitioners> {
  const practitioners = new Map<string, GuildPractitioners>();
  const add = (burgId: number, domain: CraftKnowledgeDomain, workers: number) => {
    if (workers <= 0) return;
    const key = keyOf(burgId, domain);
    const entry = practitioners.get(key);
    if (entry) entry.workers += workers;
    else practitioners.set(key, { burgId, domain, workers });
  };

  const applyCalibration = getEconomyCalibrationState().applyCalibration;
  const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;

  for (const smelter of getSmelterOperations()) {
    if (!smelter.active) continue;
    // Closed-inventory site cap (docs/plan/craft-demand-calibration.md §2.0 P3): the smelter's
    // authored, real-people Employment figure — decoupled from smelter.workers' population-point
    // reconcile loop — capped at GUILD_SITE_KNOWLEDGE_CAP_PEOPLE and converted back to points so
    // it fits the same points-denominated sum as every other source here.
    const workers = applyCalibration
      ? peopleToPoints(Math.min(getSmelterEmploymentPeople(smelter), GUILD_SITE_KNOWLEDGE_CAP_PEOPLE), populationRate)
      : smelter.workers;
    add(smelter.burgId, "metallurgy", workers);
  }
  for (const record of getCraftDomainEmploymentRecords()) {
    // Manufacture-only employment (P1) is never capped here — it is the real, uncontested guild
    // labor signal. The sole exception is "instruments": it has no manufacture-craft-employment
    // source of its own today (CRAFT_DOMAIN_BY_GOOD_NAME maps only Liquor to it), so its entries in
    // this table come entirely from authored real-people headcounts — experimentalWorkshops.ts's
    // upsertInstruments() (P9/P12 researcher count) and, since docs/plan/electric-power-and-
    // telegraph.md §3.11, powerStations.ts's own upsertInstruments() call — not manufacturing
    // labor, and must be converted like any other closed-inventory source.
    const workers =
      applyCalibration && record.domain === "instruments"
        ? peopleToPoints(record.workers, populationRate)
        : record.workers;
    add(record.burgId, record.domain, workers);
  }
  for (const { burgId, domain, extraWorkers } of getDerivedExtraWorkers().values()) {
    if (isCraftKnowledgeDomain(domain)) add(burgId, domain, extraWorkers);
  }

  return practitioners;
}

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

    const practitioners = collectGuildPractitioners();
    const remaining = new Map(getGuildKnowledgeStocks().map(entry => [keyOf(entry.burgId, entry.domain), entry]));
    const applyCalibration = getEconomyCalibrationState().applyCalibration;
    const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
    const saturation = applyCalibration ? guildSaturationPoints(populationRate) : GUILD_SATURATION_WORKERS;

    const next: GuildKnowledgeStock[] = [];
    for (const { burgId, domain, workers } of practitioners.values()) {
      const key = keyOf(burgId, domain);
      const previous = remaining.get(key);
      remaining.delete(key);

      const coverage = Math.min(1, workers / saturation);
      const stock = rn(applyKnowledgeEwma(previous?.stock ?? 0, coverage, GUILD_ADOPTION_RATE), 4);
      // Rebuilding this entry from scratch each year must not drop its accumulated guild capital
      // (docs/plan/burg-treasury-equilibrium.md §3.1) — only `stock` (technique) is recomputed here.
      next.push({ burgId, domain, stock, treasury: previous?.treasury ?? 0 });
    }

    // A Burg whose practitioners vanished (site closed, workers reassigned) keeps its guild hall
    // decaying for a while instead of vanishing the instant its last worker leaves.
    for (const orphan of remaining.values()) {
      const stock = rn(applyKnowledgeEwma(orphan.stock, 0, GUILD_DECAY_RATE), 4);
      if (stock > MIN_TRACKED_STOCK) next.push({ ...orphan, stock });
    }

    setGuildKnowledgeStocks(next);
    return true;
  }
}

export const GuildKnowledge = new GuildKnowledgeModule();

/** 1 + technique bonus for a Burg's guild in the given domain; 1 (no bonus) when no stock is tracked yet. */
export function getGuildBonus(burgId: number, domain: CraftKnowledgeDomain): number {
  const stock = getGuildKnowledgeStocks().find(entry => entry.burgId === burgId && entry.domain === domain)?.stock ?? 0;
  return 1 + GUILD_BONUS_MAX * stock;
}

/**
 * Applies GUILD_MASTERLESS_DEATH_PENALTY to a Burg's guild stock — called by guildSuccession.ts
 * when a guild master (docs/plan/knowledge-guild-system.md §5, §9 Phase 6) dies without an
 * apprentice to hand their technique down to. No-op if the Burg has no tracked stock yet.
 */
export function applyMasterlessGuildPenalty(burgId: number, domain: CraftKnowledgeDomain): void {
  const stocks = getGuildKnowledgeStocks();
  const entry = stocks.find(candidate => candidate.burgId === burgId && candidate.domain === domain);
  if (!entry) return;

  entry.stock = rn(entry.stock * (1 - GUILD_MASTERLESS_DEATH_PENALTY), 4);
  setGuildKnowledgeStocks(stocks);
}

/**
 * Applies GUILD_CONQUEST_DISRUPTION_PENALTY to every domain a Burg has a tracked guild stock in.
 * Called by conquestDisruption.ts on a genuine new conquest (docs/plan/knowledge-guild-system.md
 * §9 Phase 7). No-op if the Burg has no tracked stock in any domain.
 */
export function applyConquestDisruptionToGuilds(burgId: number): void {
  const stocks = getGuildKnowledgeStocks();
  let changed = false;
  for (const entry of stocks) {
    if (entry.burgId !== burgId) continue;
    entry.stock = rn(entry.stock * (1 - GUILD_CONQUEST_DISRUPTION_PENALTY), 4);
    changed = true;
  }
  if (changed) setGuildKnowledgeStocks(stocks);
}
