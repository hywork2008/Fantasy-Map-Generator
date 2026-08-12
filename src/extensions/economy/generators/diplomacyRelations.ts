import type { State } from "../../hostTypes";

/**
 * Shared bilateral diplomacy-ladder primitives, extracted from foreignDebtDiplomacy.ts (multi-ledger
 * PR-14) so more than one fiscal consequence can step relations up/down the same ladder without
 * duplicating (and risking drift on) the step table. PR-17g (Chancery → diplomatic reliability,
 * docs/plan/department-budget-spending-effects.md §3.4) is the second consumer.
 */

export const DIPLOMACY_DOWNGRADE: Record<string, string> = {
  Ally: "Friendly",
  Friendly: "Neutral",
  Neutral: "Suspicion",
  Suspicion: "Rival",
  Rival: "Enemy",
  Vassal: "Suspicion",
  Suzerain: "Rival"
};

export const DIPLOMACY_UPGRADE: Record<string, string> = {
  Enemy: "Rival",
  Rival: "Suspicion",
  Suspicion: "Neutral",
  Neutral: "Friendly",
  Friendly: "Ally"
};

export function readRelation(from: State, toId: number): string {
  const raw = from.diplomacy?.[toId];
  return typeof raw === "string" ? raw : "Neutral";
}

export function writeBilateralRelation(a: State, b: State, rel: string): void {
  if (!a.i || !b.i) return;
  a.diplomacy = Array.isArray(a.diplomacy) ? [...a.diplomacy] : [];
  b.diplomacy = Array.isArray(b.diplomacy) ? [...b.diplomacy] : [];
  // Ensure sparse arrays can hold the index.
  while (a.diplomacy.length <= b.i) a.diplomacy.push("Unknown");
  while (b.diplomacy.length <= a.i) b.diplomacy.push("Unknown");
  a.diplomacy[b.i] = rel;
  // Mirror common pairs.
  if (
    rel === "Enemy" ||
    rel === "Ally" ||
    rel === "Friendly" ||
    rel === "Neutral" ||
    rel === "Suspicion" ||
    rel === "Rival"
  ) {
    b.diplomacy[a.i] = rel;
  } else if (rel === "Vassal") {
    b.diplomacy[a.i] = "Suzerain";
  } else if (rel === "Suzerain") {
    b.diplomacy[a.i] = "Vassal";
  }
}

export function worsenRelation(a: State, b: State): { from: string; to: string } | null {
  const from = readRelation(a, b.i!);
  const to = DIPLOMACY_DOWNGRADE[from];
  if (!to || to === from) return null;
  writeBilateralRelation(a, b, to);
  return { from, to };
}

export function improveRelation(a: State, b: State): { from: string; to: string } | null {
  const from = readRelation(a, b.i!);
  // Do not auto-heal Enemy (that would end wars too cheaply).
  if (from === "Enemy") return null;
  const to = DIPLOMACY_UPGRADE[from];
  if (!to || to === from) return null;
  writeBilateralRelation(a, b, to);
  return { from, to };
}
