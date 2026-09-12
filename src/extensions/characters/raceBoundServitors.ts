/**
 * Bound servitor races: inseparable from a host folk’s realm, never free polities.
 *
 * Wyrmkin live only under **draconic** cultures — markets, craft halls, and desk work
 * that dragons will not staff themselves. They share the host’s place-name culture
 * and language sphere; they do not get independent map cultures.
 *
 * Half Elves live only under **elf** cultures as rare slave-folk (same named-character
 * rate as Human infernal atavism / 「青い血」). Desk and common roles may resolve to
 * them; rulers, commanders, and province lords stay Elf.
 *
 * Fallen Angels live only under **demon** cultures as bound slave-warriors and thralls.
 * Most commanders are Fallen Angels (with Demons occasionally commanding); merchants
 * and artisans are mostly Humans (unformed slave-folk), rarely Fallen Angels, and
 * extremely rarely Demons. Common soldiers and unformed slave-folk remain Human.
 * Rulers and province lords remain Demon.
 *
 * Lore: docs/world/help/multi-race-geopolitics.md
 */
import type { Race, RaceKey } from "../../types/models";
import { raceIdByKey } from "../hostRaces";
import { raceCatalog } from "./data/raceCatalog";

export interface BoundServitorSpec {
  raceKey: string;
  /**
   * Roles that may resolve to the servitor. Default: merchant + ordinary
   * (Wyrmkin staff of a dragon realm).
   */
  roles?: readonly string[];
  /**
   * Probability of using the servitor for a matching role. Omitted = always (1).
   * Half Elf uses the Human 「青い血」 named-character rate.
   */
  chance?: number;
}

/** Same rare named-character rate as Human infernal atavism (`HUMAN_INFERNAL_ATAVISM_CHANCE`). */
export const HALF_ELF_SERVITOR_CHANCE =
  raceCatalog.find(def => def.boundServitor?.raceKey === "half_elf")?.boundServitor?.chance ?? 0;

/** Majority of Demon realm commanders are Fallen Angels (~85%); occasional/rare Demon (~15%). */
export const DEMON_COMMANDER_FALLEN_ANGEL_CHANCE = 0.85;

/** Demon merchants/artisans are extremely rare (~3%). */
export const DEMON_CIVILIAN_DEMON_CHANCE = 0.03;

/** Fallen Angel merchants/artisans are occasional/rare (~15%). */
export const DEMON_CIVILIAN_FALLEN_ANGEL_CHANCE = 0.15;

const DEFAULT_BOUND_SERVITOR_ROLES = ["merchant", "ordinary"] as const;

/** Host race key → bound servitor spec. */
export const BOUND_SERVITOR_BY_HOST: Readonly<Record<string, BoundServitorSpec>> = Object.fromEntries(
  raceCatalog.filter(def => def.boundServitor).map(def => [def.key, def.boundServitor!])
);

/** All bound servitor keys (never majority culture / mixed-court free agents). */
export const BOUND_SERVITOR_RACE_KEYS: ReadonlySet<string> = new Set(
  Object.values(BOUND_SERVITOR_BY_HOST).map(spec => spec.raceKey)
);

export function isBoundServitorRaceKey(raceKey: RaceKey | string | undefined | null): boolean {
  return !!raceKey && BOUND_SERVITOR_RACE_KEYS.has(raceKey);
}

export function boundServitorKeyForHost(hostRaceKey: RaceKey | string | undefined | null): string | null {
  if (!hostRaceKey) return null;
  return BOUND_SERVITOR_BY_HOST[hostRaceKey]?.raceKey ?? null;
}

export function boundServitorSpecForHost(hostRaceKey: RaceKey | string | undefined | null): BoundServitorSpec | null {
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

export function roleUsesBoundServitor(
  roleClass: BoundServitorRoleClass | undefined | null,
  hostRaceKey?: string | null
): boolean {
  if (!roleClass) return false;
  if (hostRaceKey === "demon") {
    // Under Demon realm: commanders (fallen angels), merchants and ordinary artisans/civilians (humans/fallen angels)
    return roleClass === "commander" || roleClass === "merchant" || roleClass === "ordinary";
  }
  // Commerce and everyday craft/desk work — the face of a dragon realm to outsiders.
  // Half Elf rare spawn also uses `ordinary` (see spec.roles).
  return roleClass === "merchant" || roleClass === "ordinary";
}

function defaultChanceRoll(p: number): boolean {
  return Math.random() < p;
}

/**
 * If the culture’s majority race has a bound servitor stock and this role uses them,
 * return the servitor race id; otherwise return `hostRaceId`.
 *
 * `chanceRoll` is injectable so tests can force or forbid the rare Half Elf swap.
 */
export function resolveRaceIdWithBoundServitor(
  hostRaceId: number,
  roleClass: BoundServitorRoleClass | undefined | null,
  races: readonly Race[] | undefined | null,
  chanceRoll: (p: number) => boolean = defaultChanceRoll
): number {
  if (!races?.length || !roleClass) return hostRaceId;
  const host = races[hostRaceId];

  // Demon realms have specialized role stratifications:
  // - Commanders: majority Fallen Angel, occasional Demon
  // - Merchants / artisans (ordinary): vast majority Human, occasional Fallen Angel, extremely rare Demon
  // - Rulers, lords: pure Demon
  if (host?.key === "demon") {
    const fallenAngelId = raceIdByKey(races, "fallen_angel");
    const humanId = raceIdByKey(races, "human");
    const hasFallenAngel = races[fallenAngelId]?.key === "fallen_angel";
    const hasHuman = races[humanId]?.key === "human";

    if (roleClass === "commander") {
      if (hasFallenAngel && chanceRoll(DEMON_COMMANDER_FALLEN_ANGEL_CHANCE)) {
        return fallenAngelId;
      }
      return hostRaceId;
    }

    if (roleClass === "merchant" || roleClass === "ordinary") {
      if (chanceRoll(DEMON_CIVILIAN_DEMON_CHANCE)) {
        return hostRaceId;
      }
      const pFallen = DEMON_CIVILIAN_FALLEN_ANGEL_CHANCE / (1 - DEMON_CIVILIAN_DEMON_CHANCE);
      if (hasFallenAngel && chanceRoll(pFallen)) {
        return fallenAngelId;
      }
      if (hasHuman) {
        return humanId;
      }
      return raceIdByKey(races, "human");
    }

    return hostRaceId;
  }

  const spec = boundServitorSpecForHost(host?.key);
  if (!spec) return hostRaceId;
  const roles = spec.roles ?? DEFAULT_BOUND_SERVITOR_ROLES;
  if (!roles.includes(roleClass)) return hostRaceId;
  const chance = spec.chance ?? 1;
  if (chance < 1 && !chanceRoll(chance)) return hostRaceId;
  const servitorId = raceIdByKey(races, spec.raceKey);
  return races[servitorId]?.key === spec.raceKey ? servitorId : hostRaceId;
}
