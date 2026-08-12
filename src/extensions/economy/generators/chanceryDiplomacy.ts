import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { worsenRelation } from "./diplomacyRelations";

/**
 * PR-17g (docs/plan/department-budget-spending-effects.md §3.4) — Chancery's funding effect on
 * diplomacy. Chancery is diplomacy/law/treaty administration; a neglected Chancery erodes
 * `state.diplomaticReliability` (0..100), and a sustained slide below the risk threshold strains
 * one existing alliance — the state's own diplomats simply are not keeping up correspondence,
 * escorting envoys, or renewing terms.
 *
 * Same accumulate/decay shape as treasuryAllocation.ts's militaryDiscontent, mirrored: here high
 * is good (reliability), so "well-funded" recovers it and "underfunded" decays it.
 */

export const DIPLOMATIC_RELIABILITY_MAX = 100;
/** Chancery service level at/above this recovers reliability. */
export const DIPLOMATIC_RELIABILITY_WELL_FUNDED_LEVEL = 0.8;
/** Chancery service level at/above this (but below the well-funded tier) only mildly decays. */
export const DIPLOMATIC_RELIABILITY_UNDERFUNDED_LEVEL = 0.5;
export const DIPLOMATIC_RELIABILITY_RECOVERY_PER_CYCLE = 4;
export const DIPLOMATIC_RELIABILITY_MILD_DECAY_PER_CYCLE = 2;
export const DIPLOMATIC_RELIABILITY_STRONG_DECAY_PER_CYCLE = 6;
/** Below this, sustained Chancery neglect starts costing an existing alliance. */
export const DIPLOMATIC_RELIABILITY_ALLIANCE_RISK_THRESHOLD = 30;

export interface DiplomaticReliabilityResult {
  reliability: number;
  /** The one alliance strained this cycle, if reliability just crossed into the risk zone. */
  allianceStrained: { allyStateId: number; from: string; to: string } | null;
}

/**
 * Updates `state.diplomaticReliability` from this cycle's Chancery departmentServiceLevel, and —
 * only on the cycle reliability first crosses below DIPLOMATIC_RELIABILITY_ALLIANCE_RISK_THRESHOLD
 * (edge-triggered, not every cycle it stays low, so a single dip does not cascade through an
 * entire alliance network) — worsens relations with one existing Ally by one step on the shared
 * diplomacy ladder (diplomacyRelations.ts). Call once per state per collectTaxes() cycle, after
 * allocateTreasury() has refreshed departmentServiceLevel for this cycle.
 */
export function updateDiplomaticReliability(state: State): DiplomaticReliabilityResult {
  const chanceryLevel = state.departmentServiceLevel?.chancery ?? 1;
  const previous = state.diplomaticReliability ?? DIPLOMATIC_RELIABILITY_MAX;

  let next: number;
  if (chanceryLevel >= DIPLOMATIC_RELIABILITY_WELL_FUNDED_LEVEL) {
    next = Math.min(DIPLOMATIC_RELIABILITY_MAX, previous + DIPLOMATIC_RELIABILITY_RECOVERY_PER_CYCLE);
  } else if (chanceryLevel >= DIPLOMATIC_RELIABILITY_UNDERFUNDED_LEVEL) {
    next = Math.max(0, previous - DIPLOMATIC_RELIABILITY_MILD_DECAY_PER_CYCLE);
  } else {
    next = Math.max(0, previous - DIPLOMATIC_RELIABILITY_STRONG_DECAY_PER_CYCLE);
  }
  next = rn(next, 2);
  state.diplomaticReliability = next;

  let allianceStrained: DiplomaticReliabilityResult["allianceStrained"] = null;
  const crossedIntoRisk =
    previous >= DIPLOMATIC_RELIABILITY_ALLIANCE_RISK_THRESHOLD && next < DIPLOMATIC_RELIABILITY_ALLIANCE_RISK_THRESHOLD;
  if (crossedIntoRisk && state.i) {
    try {
      const { pack } = getWorldContext();
      const diplomacy = state.diplomacy;
      if (Array.isArray(diplomacy)) {
        for (let otherId = 0; otherId < diplomacy.length; otherId++) {
          if (diplomacy[otherId] !== "Ally") continue;
          const ally = pack.states?.[otherId];
          if (!ally?.i) continue;
          const change = worsenRelation(state, ally);
          if (change) {
            allianceStrained = { allyStateId: ally.i, from: change.from, to: change.to };
            if (typeof document !== "undefined") {
              document.dispatchEvent(
                new CustomEvent("fmg:diplomatic-reliability-alliance-strain", {
                  detail: { stateId: state.i, allyStateId: ally.i, from: change.from, to: change.to }
                })
              );
            }
          }
          break;
        }
      }
    } catch {
      // Unit tests / partial pack — reliability score itself still updated above.
    }
  }

  return { reliability: next, allianceStrained };
}
