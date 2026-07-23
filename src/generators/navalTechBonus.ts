/**
 * Naval strength bonus driven by the (optional) Shipbuilding extension's completed
 * state-owned hulls. Military never imports Shipbuilding directly — it only listens
 * for a documented CustomEvent contract, so it works unchanged whether or not the
 * extension is installed or enabled (see AGENTS.md §7: core must not hardcode
 * extension-awareness).
 *
 * Canonical storage is `simulationContext.navalTechBonus` so mid-session save/load
 * keeps the multiplier a state has already earned.
 *
 * Event contract (dispatched by shipbuilding/generators/shipyardQueue.ts):
 *   fmg:shipbuilding-ship-completed
 *   detail: { burgId: number; stateId: number | null; owner: "state" | "market"; shipClassId: string }
 */

import { simulationContext } from "../context/simulationContext";

const BONUS_PER_HULL = 0.1;
const MAX_BONUS = 10;

function getBonusTable(): Record<number, number> {
  if (!simulationContext.navalTechBonus || typeof simulationContext.navalTechBonus !== "object") {
    simulationContext.navalTechBonus = {};
  }
  return simulationContext.navalTechBonus;
}

document.addEventListener("fmg:shipbuilding-ship-completed", e => {
  const detail = (e as CustomEvent).detail as { stateId: number | null; owner: "state" | "market" } | undefined;
  if (detail?.owner !== "state" || !detail.stateId) return;

  const table = getBonusTable();
  const current = table[detail.stateId] ?? 1;
  table[detail.stateId] = Math.min(MAX_BONUS, current + BONUS_PER_HULL);
});

// A brand-new map reuses state ids from 0, so a bonus tied to the previous map's
// state ids must not carry over.
document.addEventListener("fmg:generate-post-core", () => {
  simulationContext.navalTechBonus = {};
});

/**
 * Naval strength multiplier for a state (defaults to 1 — no bonus). Grows as that
 * state's shipyards complete state-owned hulls (Shipbuilding extension, if enabled).
 */
export function getNavalTechBonus(stateId: number): number {
  return getBonusTable()[stateId] ?? 1;
}

export function resetNavalTechBonuses(): void {
  simulationContext.navalTechBonus = {};
}
