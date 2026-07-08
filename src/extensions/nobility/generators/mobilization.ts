import { simulationContext } from "../../../context/simulationContext";
import type { State } from "../../../types/models";
import type { PackedGraph } from "../../../types/PackedGraph";

/** Baseline peacetime conscription target — population share kept under arms (docs/plan/strategy.md: "兵士の人口比が1%未満のところは徴兵すべき"). */
const BASE_MILITARY_RATIO = 0.01;

/**
 * Elevated target when a state is outnumbered by its declared enemies (docs/plan/strategy.md:
 * "周りが敵国で兵数が拮抗していないなら1%を超えて徴兵する") — mobilize harder than the peacetime
 * baseline instead of quietly waiting to be overrun. Marriage/alliance/vassalage-seeking for
 * states that still can't keep up is deferred to a later phase.
 */
const EXISTENTIAL_MILITARY_RATIO = 0.03;

/**
 * Share of the gap between current capacity and the target closed per year — gradual
 * mobilization (recruiting/training/equipping takes time) rather than an instant jump to the
 * target size. `Military.updateDynamic()`'s existing recovery mechanic (~20%/year) then grows
 * each regiment's actual headcount (`r.a`) up toward this newly-raised ceiling (`r.t`) on its
 * own — this function only ever raises the ceiling. Unit-quality/new-recruit weakness is
 * deliberately out of scope, matching docs/plan/strategy.md's "新兵ばかりの軍隊の弱さは現時点では
 * 考慮しない", as is ruler-personality/theocracy weighting (also mentioned in the same doc as a
 * future refinement).
 */
const ANNUAL_GROWTH_SHARE = 0.5;

/** Population estimate in raw headcount — `state.rural`/`urban` are in thousands, the same convention `burg.population`/`cells.pop` use elsewhere in this codebase. */
function statePopulation(state: State): number {
  return ((state.rural ?? 0) + (state.urban ?? 0)) * 1000;
}

/** Sum of every land regiment's current headcount — the ratio a player actually observes in-game (docs/plan/strategy.md's "兵士253(0.01%)"), as opposed to each regiment's `t` capacity. */
function currentLandTroops(state: State): number {
  return (state.military ?? []).filter(r => !r.n).reduce((sum, r) => sum + r.a, 0);
}

/** Sum of every land regiment's *capacity* (`t`) — what conscription actually raises; `Military.updateDynamic()`'s recovery then grows `a` toward it over time. */
function currentLandCapacity(state: State): number {
  return (state.military ?? []).filter(r => !r.n).reduce((sum, r) => sum + r.t, 0);
}

/** Combined estimated military power of every state `state` has a declared "Enemy" relation with, per the same espionage estimates strategic-planner.ts's deterrence check uses. */
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
   * Yearly conscription pass (docs/plan/strategy.md) — the missing counterpart to
   * `Military.generate()`, which only sizes a state's military once at map generation/manual
   * regeneration and never again, leaving population growth (or catastrophic war losses) with
   * no ongoing response — a state can sit at a fraction of a percent of its population under
   * arms indefinitely. Raises each land regiment's capacity (`r.t`) toward a population-based
   * target; `Military.updateDynamic()`'s existing recovery mechanic does the actual headcount
   * growth. States with no military at all are left untouched (nothing to grow onto yet — same
   * scope limitation `advanceAllRegimentMovement`/`updateDynamic` already have).
   */
  conscript(pack: PackedGraph): void {
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
