import { simEvents } from "../simulation/events";
/**
 * Option locks: a localStorage entry pins an option across randomized regeneration. Kept apart from
 * domUtils so generators can read a lock without importing dialog/DOM helpers (S1).
 */
export function unlock(id: string): void {
  localStorage.removeItem(id);
  simEvents.dispatchEvent(new CustomEvent("fmg:lock-changed", { detail: { id, locked: false } }));
}

export function locked(id: string): boolean {
  return localStorage.getItem(id) !== null;
}
