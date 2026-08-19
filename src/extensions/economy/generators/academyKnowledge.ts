import { applyKnowledgeEwma, rn } from "../../hostUtils";
import {
  getAcademyKnowledgeLastSettledYear,
  getAcademyKnowledgeStocks,
  getAdministrationEmployment,
  getApothecaryWorkshops,
  getExperimentalWorkshops,
  getHospitalInstallations,
  getSimulationYear,
  setAcademyKnowledgeLastSettledYear,
  setAcademyKnowledgeStocks
} from "../economyContext";
import type { AcademyKnowledgeStock, ScholarlyKnowledgeDomain } from "./academyKnowledgeTypes";
import { getDerivedExtraWorkers, isScholarlyKnowledgeDomain } from "./technologyBiasApply";

/**
 * Drives every scholarly-academy domain's per-Burg AcademyKnowledgeStock (docs/plan/
 * knowledge-guild-system.md §9 Phase 3). Only "administration" is wired up: its practitioner pool
 * is AdministrationEmploymentRecord.workers (clerks/notaries/judges at each State's capital,
 * administrationEmployment.ts) — the only existing per-Burg headcount in this scholarly cluster.
 * Structurally identical to GuildKnowledgeModule (guildKnowledge.ts) so future domains (medicine,
 * theology, naturalPhilosophy) can slot in the same way once they get a real headcount source.
 */

/**
 * Practitioner headcount that counts as a "fully staffed" chancery for technique purposes. Same
 * "no population gate, quality ceiling is democratized" reasoning as GUILD_SATURATION_WORKERS
 * (guildKnowledge.ts, docs/plan/knowledge-guild-system.md §8.1 decision 2) — a modest one-burg
 * state's baseline clerk count (REQUIRED_WORKERS_BASE = 4, administrationEmployment.ts) can still
 * mature this domain given time; a big state's larger chancery raises aggregate coverage speed,
 * not the achievable stock ceiling.
 */
export const ACADEMY_SATURATION_WORKERS = 8;
/** EWMA smoothing: same cadence as GuildKnowledge's adoption/decay rates. */
export const ACADEMY_ADOPTION_RATE = 0.15;
export const ACADEMY_DECAY_RATE = 0.15;
/** How much stock=1 raises poll-tax collection efficiency (taxes-generator.ts collectTaxes()). */
export const ACADEMY_BONUS_MAX = 0.2;
/** Below this a decayed stock is dropped instead of lingering at a near-zero value forever. */
const MIN_TRACKED_STOCK = 0.001;
/** Same conquest-disruption reasoning as GUILD_CONQUEST_DISRUPTION_PENALTY (guildKnowledge.ts, §9 Phase 7). */
export const ACADEMY_CONQUEST_DISRUPTION_PENALTY = 0.4;

function keyOf(burgId: number, domain: ScholarlyKnowledgeDomain): string {
  return `${burgId}:${domain}`;
}

type Practitioners = { burgId: number; domain: ScholarlyKnowledgeDomain; workers: number };

export class AcademyKnowledgeModule {
  /**
   * Runs at most once per simulation year. Must run after reconcileAnnualBasicEmploymentWorkers()
   * within the same tick so this year's freshly-reconciled AdministrationEmploymentRecord headcount
   * feeds this year's coverage calc instead of last year's stale figure — same ordering constraint
   * as GuildKnowledge.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 3).
   */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getAcademyKnowledgeLastSettledYear() === year) return false;
    setAcademyKnowledgeLastSettledYear(year);

    const practitioners = this.collectPractitioners();
    const remaining = new Map(getAcademyKnowledgeStocks().map(entry => [keyOf(entry.burgId, entry.domain), entry]));

    const next: AcademyKnowledgeStock[] = [];
    for (const { burgId, domain, workers } of practitioners.values()) {
      const key = keyOf(burgId, domain);
      const previousStock = remaining.get(key)?.stock ?? 0;
      remaining.delete(key);

      const coverage = Math.min(1, workers / ACADEMY_SATURATION_WORKERS);
      const stock = rn(applyKnowledgeEwma(previousStock, coverage, ACADEMY_ADOPTION_RATE), 4);
      next.push({ burgId, domain, stock });
    }

    // A capital whose administration headcount drops (or whose state is removed) keeps its
    // chancery's stock decaying for a while instead of vanishing the instant staffing dips —
    // same lingering-orphan behavior as GuildKnowledge.
    for (const orphan of remaining.values()) {
      const stock = rn(applyKnowledgeEwma(orphan.stock, 0, ACADEMY_DECAY_RATE), 4);
      if (stock > MIN_TRACKED_STOCK) next.push({ ...orphan, stock });
    }

    setAcademyKnowledgeStocks(next);
    return true;
  }

  private collectPractitioners(): Map<string, Practitioners> {
    const practitioners = new Map<string, Practitioners>();
    const add = (burgId: number, domain: ScholarlyKnowledgeDomain, workers: number) => {
      if (workers <= 0) return;
      const key = keyOf(burgId, domain);
      const entry = practitioners.get(key);
      if (entry) entry.workers += workers;
      else practitioners.set(key, { burgId, domain, workers });
    };

    for (const record of getAdministrationEmployment()) {
      add(record.burgId, "administration", record.workers);
    }
    for (const workshop of getApothecaryWorkshops()) {
      if (workshop.active) add(workshop.burgId, "medicine", workshop.practitioners);
    }
    for (const hospital of getHospitalInstallations()) {
      if (hospital.active) add(hospital.burgId, "medicine", hospital.practitioners);
    }
    for (const workshop of getExperimentalWorkshops()) {
      if (workshop.active) add(workshop.burgId, "naturalPhilosophy", workshop.researchers);
    }
    for (const { burgId, domain, extraWorkers } of getDerivedExtraWorkers().values()) {
      if (isScholarlyKnowledgeDomain(domain)) add(burgId, domain, extraWorkers);
    }

    return practitioners;
  }
}

export const AcademyKnowledge = new AcademyKnowledgeModule();

/** 1 + technique bonus for a Burg's academy in the given domain; 1 (no bonus) when no stock is tracked yet. */
export function getAcademyBonus(burgId: number, domain: ScholarlyKnowledgeDomain): number {
  const stock =
    getAcademyKnowledgeStocks().find(entry => entry.burgId === burgId && entry.domain === domain)?.stock ?? 0;
  return 1 + ACADEMY_BONUS_MAX * stock;
}

/**
 * Applies ACADEMY_CONQUEST_DISRUPTION_PENALTY to every domain a Burg has a tracked academy stock
 * in. Called by conquestDisruption.ts on a genuine new conquest (docs/plan/knowledge-guild-system.md
 * §9 Phase 7). No-op if the Burg has no tracked stock in any domain.
 */
export function applyConquestDisruptionToAcademies(burgId: number): void {
  const stocks = getAcademyKnowledgeStocks();
  let changed = false;
  for (const entry of stocks) {
    if (entry.burgId !== burgId) continue;
    entry.stock = rn(entry.stock * (1 - ACADEMY_CONQUEST_DISRUPTION_PENALTY), 4);
    changed = true;
  }
  if (changed) setAcademyKnowledgeStocks(stocks);
}
