import { NON_NAVIGABLE_LAKE_GROUPS } from "../data/waterNavigation";

/** A formal lake port requires at least this share of the packed map. */
export const MIN_LAKE_PORT_SHARE = 0.003;
/** Prevents a tiny map or a malformed feature from promoting puddles. */
export const MIN_LAKE_PORT_CELLS = 4;
export const MIN_LAKE_PORTS = 2;
export const MAX_LAKE_PORTS = 6;

/**
 * Lake ports a lake may hold: 0 for small lakes (crossing a few cells by boat is never worth the
 * wagon→boat→wagon transfer), then 2–6 growing with the lake's share of the map.
 */
export function lakePortCapacity(lake: { cells: number }, totalCells: number): number {
  const lakeShare = lake.cells / Math.max(totalCells, 1);
  if (lake.cells < MIN_LAKE_PORT_CELLS || lakeShare < MIN_LAKE_PORT_SHARE) return 0;
  const growthSteps = Math.floor(Math.log2(lakeShare / MIN_LAKE_PORT_SHARE));
  return Math.min(MAX_LAKE_PORTS, MIN_LAKE_PORTS + Math.max(0, growthSteps));
}

/** Whether a lake can be sailed and is large enough to host lake ports at all. */
export function lakeCanHostPorts(lake: { cells: number; group?: string }, totalCells: number): boolean {
  return !NON_NAVIGABLE_LAKE_GROUPS.has(lake.group ?? "") && lakePortCapacity(lake, totalCells) > 0;
}
