import type { MilitaryRegiment } from "../types/models";

export function isUndeadMilitaryUnit(name: string): boolean {
  return name === "skeletons" || name === "zombies";
}

export function undeadTroops(regiment: Pick<MilitaryRegiment, "u">): number {
  return Math.max(0, regiment.u.skeletons ?? 0) + Math.max(0, regiment.u.zombies ?? 0);
}

/** Mixed regiments keep a as total strength and t as their living recruitment ceiling. */
export function livingTroops(regiment: Pick<MilitaryRegiment, "a" | "u" | "isRisen">): number {
  return regiment.isRisen ? 0 : Math.max(0, regiment.a - undeadTroops(regiment));
}
