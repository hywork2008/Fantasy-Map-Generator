import type { MilitaryRegiment } from "../types/models";

/**
 * Regiments currently captured by a pending UI-driven attack (regiment-editor.ts's
 * attackRegimentOnClick delays `new Battle(attacker, defender)` until a ~1s d3 transition
 * completes, per commit 0d85bb2e). Advance Time is asynchronous (requestAnimationFrame-driven)
 * and can run in that same window — Military.updateDynamic() and regimentMovement.ts's
 * detachment-merge pass both splice regiments out of `state.military`, which would leave the
 * captured attacker/defender references stale by the time Battle is finally instantiated.
 * Locked regiments are skipped by that cleanup/merge until the animation finishes and releases
 * the lock, so the captured references stay valid for the pending Battle.
 */
const lockedRegiments = new Set<MilitaryRegiment>();

export function lockRegimentForBattle(regiment: MilitaryRegiment): void {
  lockedRegiments.add(regiment);
}

export function unlockRegimentForBattle(regiment: MilitaryRegiment): void {
  lockedRegiments.delete(regiment);
}

export function isRegimentLockedForBattle(regiment: MilitaryRegiment): boolean {
  return lockedRegiments.has(regiment);
}
