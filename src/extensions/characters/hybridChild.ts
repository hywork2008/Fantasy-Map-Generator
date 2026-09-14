import type { Race } from "../../types/models";
import { raceIdByKey } from "../hostRaces";

/**
 * Resolves offspring race key based on parent race keys:
 * - human + vampire (in either order) => dhampir
 * - human + elf (in either order) => half_elf
 * - identical parents => parent race
 * - otherwise 50/50 between parent races
 */
export function resolveChildRaceKey(
  parentAKey: string | undefined | null,
  parentBKey: string | undefined | null,
  chanceRoll: (p: number) => boolean = (p: number) => Math.random() < p
): string | undefined {
  if (!parentAKey && !parentBKey) return undefined;
  if (!parentAKey) return parentBKey ?? undefined;
  if (!parentBKey) return parentAKey;
  if (parentAKey === parentBKey) return parentAKey;

  if ((parentAKey === "human" && parentBKey === "vampire") || (parentAKey === "vampire" && parentBKey === "human")) {
    return "dhampir";
  }

  if ((parentAKey === "human" && parentBKey === "elf") || (parentAKey === "elf" && parentBKey === "human")) {
    return "half_elf";
  }

  return chanceRoll(0.5) ? parentAKey : parentBKey;
}

/**
 * Resolves offspring race id based on parent race ids:
 * - human + vampire => dhampir
 * - human + elf => half_elf
 * - identical parents => parent race id
 * - otherwise 50/50 between parent races
 */
export function resolveChildRaceId(
  parentARaceId: number | undefined,
  parentBRaceId: number | undefined,
  races: readonly Race[] | undefined | null,
  chanceRoll: (p: number) => boolean = (p: number) => Math.random() < p
): number | undefined {
  if (parentARaceId === undefined && parentBRaceId === undefined) return undefined;
  if (parentARaceId === undefined) return parentBRaceId;
  if (parentBRaceId === undefined) return parentARaceId;
  if (parentARaceId === parentBRaceId) return parentARaceId;
  if (!races?.length) return parentARaceId;

  const keyA = races[parentARaceId]?.key;
  const keyB = races[parentBRaceId]?.key;

  const childKey = resolveChildRaceKey(keyA, keyB, chanceRoll);
  if (!childKey) return parentARaceId;

  const childId = raceIdByKey(races, childKey);
  if (races[childId]?.key === childKey) {
    return childId;
  }

  return parentARaceId;
}
