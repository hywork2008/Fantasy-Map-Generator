/**
 * Wild land classification for unclaimed cells (Phase 3 wild oikoumene).
 * Spec: docs/plan/wild-oikoumene-frontier.md
 *
 * Governed land (state > 0) and ocean are `none`.
 * Unclaimed land is claimable_frontier | wild_margin | monster_domain by danger.
 */
import { STATE_EXPAND_DANGER_BAN } from "./dangerExpandPolicy";

/** Stored in pack.cells.wildLand (Uint8Array). */
export const WILD_LAND = {
  /** Ocean or state-owned territory — not a wilderness claim class. */
  none: 0,
  /** Unclaimed, low danger — valid frontier expansion target. */
  claimable: 1,
  /** Unclaimed buffer with moderate danger — keep distance; expansion discouraged. */
  margin: 2,
  /** High-danger core (beasts/monsters) — no state claim; survival zone. */
  monster: 3
} as const;

export type WildLandCode = (typeof WILD_LAND)[keyof typeof WILD_LAND];

/** Lower bound for wild_margin (inclusive); below is claimable_frontier. */
export const WILD_LAND_MARGIN_DANGER_MIN = 25;

export const WILD_LAND_LABELS: Record<WildLandCode, string> = {
  [WILD_LAND.none]: "none",
  [WILD_LAND.claimable]: "claimable_frontier",
  [WILD_LAND.margin]: "wild_margin",
  [WILD_LAND.monster]: "monster_domain"
};

export interface WildLandTagCells {
  readonly i: ArrayLike<number>;
  readonly h: ArrayLike<number>;
  readonly state: ArrayLike<number>;
  readonly danger?: ArrayLike<number>;
  /** Written as Uint8Array; typed loosely so pack.cells (TypedArray) is accepted. */
  wildLand?: ArrayLike<number> | null;
}

/** Classify one cell. */
export function classifyWildLand(height: number, stateId: number, danger: number | undefined | null): WildLandCode {
  if (height < 20) return WILD_LAND.none;
  if (stateId > 0) return WILD_LAND.none;
  const d = danger ?? 0;
  if (d >= STATE_EXPAND_DANGER_BAN) return WILD_LAND.monster;
  if (d >= WILD_LAND_MARGIN_DANGER_MIN) return WILD_LAND.margin;
  return WILD_LAND.claimable;
}

/**
 * Write pack.cells.wildLand for all cells. Safe to call repeatedly after politics change.
 */
export function assignWildLandTags(cells: WildLandTagCells): Uint8Array {
  const n = cells.i.length;
  const prev = cells.wildLand;
  const out = prev instanceof Uint8Array && prev.length === n ? prev : new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = classifyWildLand(cells.h[i], cells.state[i] ?? 0, cells.danger?.[i]);
  }
  cells.wildLand = out;
  return out;
}

export function wildLandLabel(code: number | undefined | null): string {
  if (code === WILD_LAND.claimable || code === WILD_LAND.margin || code === WILD_LAND.monster) {
    return WILD_LAND_LABELS[code];
  }
  return WILD_LAND_LABELS[WILD_LAND.none];
}

export function isMonsterDomain(code: number | undefined | null): boolean {
  return code === WILD_LAND.monster;
}

export function isClaimableFrontier(code: number | undefined | null): boolean {
  return code === WILD_LAND.claimable;
}

/** Outposts only on claimable; margin/monster banned (survival distance). */
export function allowsFrontierOutpost(code: number | undefined | null): boolean {
  return code === WILD_LAND.claimable;
}
