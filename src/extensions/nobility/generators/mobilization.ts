import {
  ANNUAL_DRAFT_SHARE,
  isManpowerSimEnabled,
  PEACE_TARGET_MOBILIZATION,
  simulationContext,
  WAR_TARGET_MOBILIZATION
} from "../../hostCore";
import type { PackedGraph, State } from "../../hostTypes";

/** Baseline peacetime conscription target — population share kept under arms. */
const BASE_MILITARY_RATIO = PEACE_TARGET_MOBILIZATION;
/** Elevated target when outnumbered by declared enemies. */
const EXISTENTIAL_MILITARY_RATIO = WAR_TARGET_MOBILIZATION;
const ANNUAL_GROWTH_SHARE = ANNUAL_DRAFT_SHARE;

/** Population estimate in raw headcount — `state.rural`/`urban` are in thousands. */
function statePopulation(state: State): number {
  return ((state.rural ?? 0) + (state.urban ?? 0)) * 1000;
}

/** Sum of every land regiment's current headcount. */
function currentLandTroops(state: State): number {
  return (state.military ?? []).filter(r => !r.n).reduce((sum, r) => sum + r.a, 0);
}

/** Sum of every land regiment's capacity (`t`). */
function currentLandCapacity(state: State): number {
  return (state.military ?? []).filter(r => !r.n).reduce((sum, r) => sum + r.t, 0);
}

/** Combined estimated military power of every declared Enemy. */
function hostilePower(state: State): number {
  const intel = simulationContext.intelligence[state.i] ?? {};
  let total = 0;
  for (const otherIdStr in intel) {
    const otherId = Number(otherIdStr);
    if (state.diplomacy?.[otherId] !== "Enemy") continue;
    total += intel[otherId]?.estimatedMilitaryPower ?? 0;
  }
  return total;
}

export class MobilizationGenerator {
  /**
   * Yearly conscription pass. When simManpower is on, core `tickManpower` in timeEngine
   * already raises capacity and draws civilian males each advance — this becomes a no-op
   * to avoid double-drafting. Legacy path (ledger off) only raises r.t.
   */
  conscript(pack: PackedGraph): void {
    if (isManpowerSimEnabled()) return;

    for (const state of pack.states) {
      if (!state.i || state.removed) continue;
      const landRegiments = (state.military ?? []).filter(r => !r.n);
      if (!landRegiments.length) continue;

      const population = statePopulation(state);
      if (population <= 0) continue;

      const outnumbered = hostilePower(state) > currentLandTroops(state);
      const ratio = outnumbered ? EXISTENTIAL_MILITARY_RATIO : BASE_MILITARY_RATIO;
      const targetCapacity = population * ratio;

      const capacity = currentLandCapacity(state);
      if (capacity >= targetCapacity) continue;

      const growth = (targetCapacity - capacity) * ANNUAL_GROWTH_SHARE;
      const perRegimentShare = growth / landRegiments.length;
      for (const r of landRegiments) {
        r.t += perRegimentShare;
      }
    }
  }
}

export const Mobilization = new MobilizationGenerator();
