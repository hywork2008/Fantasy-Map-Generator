import { applyKnowledgeEwma, rn } from "../../hostUtils";
import {
  getMilitaryResourceLedgers,
  getSimulationYear,
  getStateSecretLastSettledYear,
  getStateSecretStocks,
  getWorldContext,
  setStateSecretLastSettledYear,
  setStateSecretStocks
} from "../economyContext";
import type { StateSecretDomain, StateSecretStock } from "./stateSecretTypes";

/**
 * Drives StateSecretStock (docs/plan/knowledge-guild-system.md §9 Phase 4). Only "pyrotechnics" is
 * wired up (see stateSecretTypes.ts). Unlike GuildKnowledge/AcademyKnowledge, this module spends
 * Treasury itself as the "investment" that grows the stock, mirroring IndustrialTechInvestment's
 * self-contained invest-and-mutate shape rather than the read-only-headcount shape the other two
 * knowledge layers use — per §8.1 decision 2 ("国家機密は財源+常備インフラが前提"), growth requires
 * continuous funding rather than practitioner headcount, so a richer state outpaces a poorer rival
 * fielding the same size army.
 */

/** Share of a State's treasury spent on pyrotechnics research each simulation year it has an active gunpowder program. */
export const STATE_SECRET_BUDGET_SHARE_OF_TREASURY = 0.05;
/** "calibration TBD" — annual spend that counts as full (1.0) investment coverage for one state's program. */
export const STATE_SECRET_TARGET_ANNUAL_SPEND = 20;
/** EWMA smoothing: slower than Guild/Academy — state secrets are meant to accumulate gradually. */
export const STATE_SECRET_ADOPTION_RATE = 0.1;
export const STATE_SECRET_DECAY_RATE = 0.1;
/** How much stock=1 reduces gunpowder-chain material demand (militaryResources.ts getAnnualDemand()). */
export const STATE_SECRET_BONUS_MAX = 0.3;
/** Below this a decayed stock is dropped instead of lingering at a near-zero value forever. */
const MIN_TRACKED_STOCK = 0.001;

function keyOf(stateId: number, domain: StateSecretDomain): string {
  return `${stateId}:${domain}`;
}

export class StateSecretKnowledgeModule {
  /**
   * Runs at most once per simulation year. Reads MilitaryResourceLedger.annualDemand.gunpowder as
   * the "does this state have an active firearm/artillery program worth funding" gate — a state
   * with no gunpowder demand lets its pyrotechnics stock idle/decay instead of investing. Self-gates
   * to once per simulation year regardless of how often the caller's tick runs.
   */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getStateSecretLastSettledYear() === year) return false;
    setStateSecretLastSettledYear(year);

    const states = getWorldContext().pack.states;
    const remaining = new Map(getStateSecretStocks().map(entry => [keyOf(entry.stateId, entry.domain), entry]));

    const next: StateSecretStock[] = [];
    for (const ledger of getMilitaryResourceLedgers()) {
      const key = keyOf(ledger.stateId, "pyrotechnics");
      const previous = remaining.get(key);
      remaining.delete(key);

      const state = states[ledger.stateId];
      const demand = ledger.annualDemand.gunpowder ?? 0;
      if (demand <= 0 || !state || !state.i || state.removed) {
        if (previous) {
          const stock = rn(applyKnowledgeEwma(previous.stock, 0, STATE_SECRET_DECAY_RATE), 4);
          if (stock > MIN_TRACKED_STOCK) next.push({ ...previous, stock });
        }
        continue;
      }

      const previousStock = previous?.stock ?? 0;
      const budget = Math.max(0, state.treasury || 0) * STATE_SECRET_BUDGET_SHARE_OF_TREASURY;
      const spend = Math.min(budget, STATE_SECRET_TARGET_ANNUAL_SPEND);
      if (spend > 0) state.treasury = rn((state.treasury || 0) - spend, 2);

      const coverageThisYear = spend / STATE_SECRET_TARGET_ANNUAL_SPEND;
      const stock = rn(applyKnowledgeEwma(previousStock, coverageThisYear, STATE_SECRET_ADOPTION_RATE), 4);
      next.push({ stateId: ledger.stateId, domain: "pyrotechnics", stock });
    }

    // A state whose ledger disappeared entirely (e.g. removed before the next MilitaryResources
    // regeneration) keeps its stock decaying instead of vanishing outright.
    for (const orphan of remaining.values()) {
      const stock = rn(applyKnowledgeEwma(orphan.stock, 0, STATE_SECRET_DECAY_RATE), 4);
      if (stock > MIN_TRACKED_STOCK) next.push({ ...orphan, stock });
    }

    setStateSecretStocks(next);
    return true;
  }
}

export const StateSecretKnowledge = new StateSecretKnowledgeModule();

/** Material-demand multiplier (<=1) for a State's state-secret stock; 1 (no reduction) when no stock is tracked yet. */
export function getStateSecretMaterialMultiplier(stateId: number, domain: StateSecretDomain): number {
  const stock = getStateSecretStocks().find(entry => entry.stateId === stateId && entry.domain === domain)?.stock ?? 0;
  return 1 - STATE_SECRET_BONUS_MAX * stock;
}
