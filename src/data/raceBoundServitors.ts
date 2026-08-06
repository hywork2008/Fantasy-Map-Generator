/**
 * Bound servitor races: inseparable from a host folk’s realm, never free polities.
 *
 * Wyrmkin live only under **draconic** cultures — markets, craft halls, and desk work
 * that dragons will not staff themselves. They share the host’s place-name culture
 * and language sphere; they do not get independent map cultures.
 *
 * Lore: docs/world/help/multi-race-geopolitics.md
 */
import type { Race, RaceKey } from "../types/models";
import { raceIdByKey } from "./races";

/** Host race key → bound servitor race key. */
export const BOUND_SERVITOR_BY_HOST: Readonly<Record<string, string>> = {
  draconic: "wyrmkin"
};

/** All bound servitor keys (never majority culture / mixed-court free agents). */
export const BOUND_SERVITOR_RACE_KEYS: ReadonlySet<string> = new Set(Object.values(BOUND_SERVITOR_BY_HOST));

export function isBoundServitorRaceKey(raceKey: RaceKey | string | undefined | null): boolean {
  return !!raceKey && BOUND_SERVITOR_RACE_KEYS.has(raceKey);
}

export function boundServitorKeyForHost(hostRaceKey: RaceKey | string | undefined | null): string | null {
  if (!hostRaceKey) return null;
  return BOUND_SERVITOR_BY_HOST[hostRaceKey] ?? null;
}

/**
 * Roles filled by bound servitors under a host mono culture.
 * Rulers, commanders, province lords, and court martial stay the host race.
 */
export type BoundServitorRoleClass =
  | "merchant"
  | "ordinary"
  | "central_officer"
  | "religious"
  | "ruler"
  | "commander"
  | "province_lord"
  | string;

export function roleUsesBoundServitor(roleClass: BoundServitorRoleClass | undefined | null): boolean {
  if (!roleClass) return false;
  // Commerce and everyday craft/desk work — the face of a dragon realm to outsiders.
  return roleClass === "merchant" || roleClass === "ordinary";
}

/**
 * If the culture’s majority race has a bound servitor stock and this role uses them,
 * return the servitor race id; otherwise return `hostRaceId`.
 */
export function resolveRaceIdWithBoundServitor(
  hostRaceId: number,
  roleClass: BoundServitorRoleClass | undefined | null,
  races: readonly Race[] | undefined | null
): number {
  if (!races?.length || !roleUsesBoundServitor(roleClass)) return hostRaceId;
  const host = races[hostRaceId];
  const servitorKey = boundServitorKeyForHost(host?.key);
  if (!servitorKey) return hostRaceId;
  const servitorId = raceIdByKey(races, servitorKey);
  return races[servitorId]?.key === servitorKey ? servitorId : hostRaceId;
}
