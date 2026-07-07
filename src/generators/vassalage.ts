import type { MilitaryRegiment, State } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { rand, rn } from "../utils";

/** Grain-equivalent tribute rate range, mirroring the salesTax/pollTax convention (src/io/auto-update.ts). */
const TRIBUTE_RATE_MIN = 5;
const TRIBUTE_RATE_MAX = 15;

/** Share of the suzerain's land troops detached to garrison a single vassal. */
const GARRISON_SHARE_PER_VASSAL = 0.15;
/** Never detach more than this share of the suzerain's total land troops across all of its vassals combined. */
const MAX_TOTAL_GARRISON_SHARE = 0.5;
/** Skip garrisoning a vassal if the detachment would be this small or smaller (not worth a dedicated regiment). */
const MIN_GARRISON_TROOPS = 5;

function findSuzerainId(state: State): number | undefined {
  const diplomacy = state.diplomacy;
  if (!diplomacy) return undefined;
  for (let i = 0; i < diplomacy.length; i++) {
    if (diplomacy[i] === "Vassal") return i;
  }
  return undefined;
}

/**
 * Detaches up to `troopsToDetach` troops — spread proportionally across every land
 * (non-naval) regiment's *current* strength — into a new garrison regiment, mutating
 * the source regiments in place. Never removes a whole regiment (so the homeland is
 * never left at zero), and never touches naval regiments (so a fleet can't end up
 * stationed on land). `troopsToDetach` is computed by the caller against the suzerain's
 * *original* land troop total, so successive vassals each get their intended absolute
 * share instead of a share of an already-shrunk remainder.
 */
function detachGarrison(suzerain: State, troopsToDetach: number): MilitaryRegiment | null {
  // Exclude regiments already garrisoned in another vassal — they're stationed abroad,
  // not part of the home defense pool, and must not be raided again for the next vassal.
  // Also exclude the capital guard: it's the ruler's dedicated household force and never
  // ships out to garrison a vassal, no matter how large the suzerain's other armies are.
  const landRegiments = (suzerain.military ?? []).filter(
    r => !r.n && r.garrisonHost === undefined && !r.isCapitalGuard
  );
  if (!landRegiments.length) return null;

  const currentLandTotal = landRegiments.reduce((sum, r) => sum + r.a, 0);
  if (!currentLandTotal) return null;

  const fraction = Math.min(troopsToDetach, currentLandTotal) / currentLandTotal;

  // Compute every deduction first, without mutating anything, so we can bail out
  // cleanly if the total doesn't clear MIN_GARRISON_TROOPS.
  const plan = landRegiments.map(regiment => {
    const regimentDetachment = Math.round(regiment.a * fraction);
    const unitDetachments: Record<string, number> = {};
    for (const unitName of Object.keys(regiment.u)) {
      const unitDetachment = Math.round(regiment.u[unitName] * fraction);
      if (unitDetachment > 0) unitDetachments[unitName] = unitDetachment;
    }
    return { regiment, regimentDetachment, unitDetachments };
  });

  const detachedTotal = plan.reduce((sum, p) => sum + p.regimentDetachment, 0);
  if (detachedTotal < MIN_GARRISON_TROOPS) return null;

  const garrisonUnits: Record<string, number> = {};
  for (const { regiment, regimentDetachment, unitDetachments } of plan) {
    if (regimentDetachment <= 0) continue;
    regiment.a -= regimentDetachment;
    for (const [unitName, unitDetachment] of Object.entries(unitDetachments)) {
      regiment.u[unitName] -= unitDetachment;
      garrisonUnits[unitName] = (garrisonUnits[unitName] ?? 0) + unitDetachment;
    }
  }

  return {
    i: suzerain.military?.length ?? 0,
    t: 0,
    name: `${suzerain.name} Garrison`,
    a: detachedTotal,
    s: 0,
    cell: 0,
    x: 0,
    y: 0,
    bx: 0,
    by: 0,
    u: garrisonUnits,
    n: 0,
    type: "melee",
    state: suzerain.i,
    icon: "🛡️"
  };
}

/**
 * Core-only, one-shot governance baseline for Vassal/Suzerain relations: the vassal
 * pays a grain-equivalent tribute, and a bounded share of the suzerain's land troops
 * garrisons in the vassal's capital as a new dedicated regiment. Does not depend on
 * the Economy extension (no treasury/goods) or the Nobility extension (no ruler-driven
 * takeover) — those are later phases. States with no Vassal relation are left untouched.
 */
export function establishVassalage(pack: PackedGraph, populationRate: number): void {
  const { states, burgs } = pack;
  const garrisonedShareBySuzerain = new Map<number, number>();
  const originalLandTotalBySuzerain = new Map<number, number>();

  for (const state of states) {
    if (!state.i || state.removed) continue;

    const suzerainId = findSuzerainId(state);
    if (suzerainId === undefined) continue;

    const rural = state.rural ?? 0;
    const urban = state.urban ?? 0;
    state.tributeRate = rn(rand(TRIBUTE_RATE_MIN, TRIBUTE_RATE_MAX) / 100, 2);
    state.tributePaid = rn((rural + urban) * populationRate * state.tributeRate);

    const suzerain = states[suzerainId];
    if (!suzerain) continue;

    const capitalBurg = burgs[state.capital];
    if (!capitalBurg) continue;

    if (!originalLandTotalBySuzerain.has(suzerainId)) {
      const total = (suzerain.military ?? [])
        .filter(r => !r.n && r.garrisonHost === undefined && !r.isCapitalGuard)
        .reduce((sum, r) => sum + r.a, 0);
      originalLandTotalBySuzerain.set(suzerainId, total);
    }
    const originalLandTotal = originalLandTotalBySuzerain.get(suzerainId)!;
    if (!originalLandTotal) continue;

    const alreadyShared = garrisonedShareBySuzerain.get(suzerainId) ?? 0;
    const remainingShare = MAX_TOTAL_GARRISON_SHARE - alreadyShared;
    if (remainingShare <= 0) continue;

    const shareFraction = Math.min(GARRISON_SHARE_PER_VASSAL, remainingShare);
    const troopsToDetach = Math.round(originalLandTotal * shareFraction);
    const garrison = detachGarrison(suzerain, troopsToDetach);
    if (!garrison) continue;

    garrisonedShareBySuzerain.set(suzerainId, alreadyShared + shareFraction);

    garrison.i = suzerain.military!.length;
    garrison.cell = capitalBurg.cell;
    garrison.x = capitalBurg.x;
    garrison.y = capitalBurg.y;
    garrison.bx = capitalBurg.x;
    garrison.by = capitalBurg.y;
    garrison.garrisonHost = state.i;
    suzerain.military!.push(garrison);
  }
}
