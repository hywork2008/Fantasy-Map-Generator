import { rn } from "../../hostUtils";
import {
  getMartialDisciplineLastSettledYear,
  getMartialDisciplineStocks,
  getSimulationYear,
  getWorldContext,
  isEconomyContextReady,
  setMartialDisciplineLastSettledYear,
  setMartialDisciplineStocks
} from "../economyContext";
import type { MartialDisciplineDomain, MartialDisciplineStock } from "./martialDisciplineTypes";

/**
 * Drives MartialDisciplineStock (docs/plan/knowledge-guild-system.md §9 Phase 5). State-scoped,
 * headcount-driven EWMA like Guild/Academy, but the "practitioners" are each State's own standing
 * regiments (`state.military[].u`), classified by unit `type` (options.military) rather than by
 * a dedicated employment record. Only swordsmanship/archery/horsemanship are wired up — see
 * martialDisciplineTypes.ts for why spearmanship is deferred.
 */

/** "calibration TBD" — state-wide standing headcount in one domain that counts as full (1.0) coverage. */
export const MARTIAL_SATURATION_HEADCOUNT = 500;
export const MARTIAL_ADOPTION_RATE = 0.15;
export const MARTIAL_DECAY_RATE = 0.15;
/** How much stock=1 raises a regiment's effective combat power, weighted by its own unit-type mix. */
export const MARTIAL_BONUS_MAX = 0.25;
/** Below this a decayed stock is dropped instead of lingering at a near-zero value forever. */
const MIN_TRACKED_STOCK = 0.001;

function keyOf(stateId: number, domain: MartialDisciplineDomain): string {
  return `${stateId}:${domain}`;
}

function classifyUnitType(unitType: string | undefined): MartialDisciplineDomain | null {
  if (unitType === "melee") return "swordsmanship";
  if (unitType === "ranged") return "archery";
  if (unitType === "mounted") return "horsemanship";
  return null;
}

type Practitioners = { stateId: number; domain: MartialDisciplineDomain; headcount: number };

export class MartialDisciplineKnowledgeModule {
  /** Runs at most once per simulation year. Self-gates regardless of how often the caller's tick runs. */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getMartialDisciplineLastSettledYear() === year) return false;
    setMartialDisciplineLastSettledYear(year);

    const practitioners = this.collectPractitioners();
    const remaining = new Map(getMartialDisciplineStocks().map(entry => [keyOf(entry.stateId, entry.domain), entry]));

    const next: MartialDisciplineStock[] = [];
    for (const { stateId, domain, headcount } of practitioners.values()) {
      const key = keyOf(stateId, domain);
      const previousStock = remaining.get(key)?.stock ?? 0;
      remaining.delete(key);

      const coverage = Math.min(1, headcount / MARTIAL_SATURATION_HEADCOUNT);
      const stock = rn(previousStock * (1 - MARTIAL_ADOPTION_RATE) + coverage * MARTIAL_ADOPTION_RATE, 4);
      next.push({ stateId, domain, stock });
    }

    // A state whose standing headcount in a domain drops to zero (disbanded regiments, state
    // removed) keeps its stock decaying instead of vanishing outright — same lingering-orphan
    // behavior as GuildKnowledge/AcademyKnowledge.
    for (const orphan of remaining.values()) {
      const stock = rn(orphan.stock * (1 - MARTIAL_DECAY_RATE), 4);
      if (stock > MIN_TRACKED_STOCK) next.push({ ...orphan, stock });
    }

    setMartialDisciplineStocks(next);
    return true;
  }

  private collectPractitioners(): Map<string, Practitioners> {
    const practitioners = new Map<string, Practitioners>();
    const militaryOptions = getWorldContext().options.military || [];
    const typeByUnitName = new Map(militaryOptions.map(unit => [unit.name, unit.type]));

    for (const state of getWorldContext().pack.states) {
      if (!state.i || state.removed) continue;
      for (const regiment of state.military || []) {
        for (const [unitName, count] of Object.entries(regiment.u || {})) {
          if (count <= 0) continue;
          const domain = classifyUnitType(typeByUnitName.get(unitName));
          if (!domain) continue;

          const key = keyOf(state.i, domain);
          const entry = practitioners.get(key);
          if (entry) entry.headcount += count;
          else practitioners.set(key, { stateId: state.i, domain, headcount: count });
        }
      }
    }
    return practitioners;
  }
}

export const MartialDisciplineKnowledge = new MartialDisciplineKnowledgeModule();

function getStock(stateId: number, domain: MartialDisciplineDomain): number {
  return getMartialDisciplineStocks().find(entry => entry.stateId === stateId && entry.domain === domain)?.stock ?? 0;
}

/**
 * Weighted combat-power multiplier for one regiment, based on its own unit-type composition and
 * the owning State's MartialDisciplineStock in each represented domain. Consumed by Nobility's
 * commanderPowerMultiplier() (localDefense.ts) alongside the officer-quality bonus (docs/plan/
 * knowledge-guild-system.md §9 Phase 5) — well-drilled troops fight above their raw headcount the
 * same way a good commander does, and the two stack. Unit types with no domain (artillery, fleet)
 * contribute no bonus, diluting the weighted average for mixed regiments; 1 (no bonus) for an
 * empty/all-unclassified regiment or a State with no tracked stock. Cross-extension callers may
 * run before (or entirely without) this extension's own init having run — degrades to 1 instead
 * of throwing when economy's context isn't ready (economy disabled, or a Nobility unit test that
 * only sets up its own context).
 */
export function getMartialDisciplineMultiplier(stateId: number, unitCounts: Readonly<Record<string, number>>): number {
  if (!isEconomyContextReady()) return 1;

  const militaryOptions = getWorldContext().options.military || [];
  const typeByUnitName = new Map(militaryOptions.map(unit => [unit.name, unit.type]));

  let total = 0;
  let bonusSum = 0;
  for (const [unitName, count] of Object.entries(unitCounts)) {
    if (count <= 0) continue;
    total += count;
    const domain = classifyUnitType(typeByUnitName.get(unitName));
    if (!domain) continue;
    bonusSum += count * MARTIAL_BONUS_MAX * getStock(stateId, domain);
  }
  return total > 0 ? 1 + bonusSum / total : 1;
}
