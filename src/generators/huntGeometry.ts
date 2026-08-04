/**
 * Shared hunt / cull geometry helpers.
 * Spec: docs/plan/player-threat-cull-jobs.md (PR-1); used by wildernessEcology + future board.
 *
 * Does not mutate pack ownership (`cells.state`).
 */
import type { WorldContext } from "../context/worldContext";
import { STATE_EXPAND_DANGER_BAN } from "./dangerExpandPolicy";
import { WILD_LAND_MARGIN_DANGER_MIN } from "./wildLandTags";

/** Max graph hops from a state border to a hunt target (macro + PC board). */
export const MAX_HUNT_HOPS = 4;

export type HuntGeometryCells = WorldContext["pack"]["cells"];

/** Land cells of `stateId` that touch unclaimed land (h ≥ 20). */
export function collectStateBorderCells(stateId: number, cells: HuntGeometryCells): number[] {
  const borders: number[] = [];
  for (let i = 0; i < cells.i.length; i++) {
    if (cells.state[i] !== stateId || cells.h[i] < 20) continue;
    const touchesWild = (cells.c[i] ?? []).some(
      neighbor => cells.h[neighbor] >= 20 && (cells.state[neighbor] ?? 0) === 0
    );
    if (touchesWild) borders.push(i);
  }
  return borders;
}

/**
 * BFS hop distance from `start` to any cell in `goals`, skipping ocean (h < 20).
 * Returns null when unreachable within `maxHops`.
 */
export function minHopsToSet(
  start: number,
  goals: readonly number[],
  cells: HuntGeometryCells,
  maxHops: number
): number | null {
  const goalSet = new Set(goals);
  if (goalSet.has(start)) return 0;
  const queue = [{ cell: start, hops: 0 }];
  const visited = new Set<number>([start]);
  while (queue.length) {
    const { cell, hops } = queue.shift()!;
    if (hops >= maxHops) continue;
    for (const neighbor of cells.c[cell] ?? []) {
      if (visited.has(neighbor) || cells.h[neighbor] < 20) continue;
      if (goalSet.has(neighbor)) return hops + 1;
      visited.add(neighbor);
      queue.push({ cell: neighbor, hops: hops + 1 });
    }
  }
  return null;
}

/**
 * Macro / board scoring spirit from wildernessEcology selectHuntTarget:
 * prefer high-danger, high-rarity threats near the realm border.
 */
export function scoreHuntCandidate(args: { danger: number; rarity: number; hops: number; noise?: number }): number {
  const { danger, rarity, hops, noise = 0 } = args;
  return (
    danger * 2 +
    rarity * 12 -
    hops * 8 +
    (danger >= STATE_EXPAND_DANGER_BAN ? 30 : danger >= WILD_LAND_MARGIN_DANGER_MIN ? 10 : 0) +
    noise
  );
}

/** Hop distance between two land cells (null if beyond maxHops). */
export function minHopsBetween(
  from: number,
  to: number,
  cells: HuntGeometryCells,
  maxHops: number = MAX_HUNT_HOPS
): number | null {
  return minHopsToSet(from, [to], cells, maxHops);
}
