/**
 * Naval strength bonus driven by the (optional) Shipbuilding extension's completed
 * state-owned hulls. Military never imports Shipbuilding directly — it only listens
 * for a documented CustomEvent contract, so it works unchanged whether or not the
 * extension is installed or enabled (see AGENTS.md §7: core must not hardcode
 * extension-awareness).
 *
 * Event contract (dispatched by shipbuilding/generators/shipyardQueue.ts):
 *   fmg:shipbuilding-ship-completed
 *   detail: { burgId: number; stateId: number | null; owner: "state" | "market"; shipClassId: string }
 */

const BONUS_PER_HULL = 0.1;
const MAX_BONUS = 3;

const _bonusByState = new Map<number, number>();

document.addEventListener("fmg:shipbuilding-ship-completed", e => {
  const detail = (e as CustomEvent).detail as { stateId: number | null; owner: "state" | "market" } | undefined;
  if (!detail || detail.owner !== "state" || !detail.stateId) return;

  const current = _bonusByState.get(detail.stateId) ?? 1;
  _bonusByState.set(detail.stateId, Math.min(MAX_BONUS, current + BONUS_PER_HULL));
});

// A brand-new map reuses state ids from 0, so a bonus tied to the previous map's
// state ids must not carry over.
document.addEventListener("fmg:generate-post-core", () => _bonusByState.clear());

/**
 * Naval strength multiplier for a state (defaults to 1 — no bonus). Grows as that
 * state's shipyards complete state-owned hulls (Shipbuilding extension, if enabled).
 */
export function getNavalTechBonus(stateId: number): number {
  return _bonusByState.get(stateId) ?? 1;
}

export function resetNavalTechBonuses(): void {
  _bonusByState.clear();
}
