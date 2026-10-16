import type { WorldOptions } from "../types/WorldState";

/**
 * Versions of the load-time repairs that are not idempotent (docs/plan/simulation-core-separation.md
 * §23). Each repair records the version it brought the world to in `world.options.loadRepairs`;
 * a load runs a repair only while the saved version is older than the code's. A save/load
 * therefore continues the same world instead of rebuilding roads and re-siting ports every time.
 *
 * Bump a version when that repair's algorithm changes, so existing saves receive it once.
 * New maps record the current versions as they are generated (they are already up to date).
 */
export const LOAD_REPAIR_VERSIONS = {
  /** Route network rebuild for archives that record a route generation mode (normalizeLoadedWorld). */
  routes: 1,
  /** River/sea port re-siting and waterfront check (dualPortPlacementTask). */
  dualPortPlacement: 1
} as const;

export type LoadRepairId = keyof typeof LOAD_REPAIR_VERSIONS;

/**
 * Generic form for repairs owned elsewhere (an extension passes its own id and version, e.g.
 * `economy.developmentPotential`). Ids share the one `world.options.loadRepairs` record.
 */
export function isRepairAtVersion(options: Readonly<WorldOptions>, id: string, version: number): boolean {
  return (options.loadRepairs?.[id] ?? 0) >= version;
}

export function markRepairAtVersion(options: WorldOptions, id: string, version: number): void {
  if (options.loadRepairs?.[id] === version) return;
  options.loadRepairs = { ...options.loadRepairs, [id]: version };
}

export function isLoadRepairCurrent(options: Readonly<WorldOptions>, id: LoadRepairId): boolean {
  return isRepairAtVersion(options, id, LOAD_REPAIR_VERSIONS[id]);
}

export function markLoadRepairCurrent(options: WorldOptions, id: LoadRepairId): void {
  markRepairAtVersion(options, id, LOAD_REPAIR_VERSIONS[id]);
}
