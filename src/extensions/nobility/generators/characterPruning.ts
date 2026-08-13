import { pruneDeadCharacters } from "../../characters/characterPruning";
import { usePlayerCharacterState } from "../../characters/store/playerCharacterState";
import type { State } from "../../hostTypes";
import { getRulerId, getWorldContext } from "../nobilityContext";

/**
 * Ids that must never be pruned, no matter how long dead: a state's current ruler and every
 * regiment's current commander are looked up elsewhere via a raw stored id
 * (getRulerId/MilitaryRegiment.commanderId) that isn't re-validated against `dead` by every
 * caller, and the player's own character must stay resolvable regardless of how long ago they
 * died. Every other character-id lookup in Nobility/Economy already filters `!c.dead` or checks
 * `.dead` after finding, so pruning a corpse there is indistinguishable from never finding it.
 */
function collectProtectedCharacterIds(states: readonly State[]): Set<number> {
  const ids = new Set<number>();

  for (const state of states) {
    if (!state.i || state.removed) continue;

    const rulerId = getRulerId(state);
    if (rulerId !== undefined) ids.add(rulerId);

    for (const regiment of state.military ?? []) {
      if (regiment.commanderId !== undefined) ids.add(regiment.commanderId);
    }
  }

  const playerCharacterId = usePlayerCharacterState.getState().playerCharacterId;
  if (playerCharacterId !== null) ids.add(playerCharacterId);

  return ids;
}

/**
 * Annual maintenance pass: removes long-dead characters nothing still references. See
 * characterPruning.ts (Characters extension) for the eligibility rules — this function's only
 * job is supplying the Nobility-specific "still referenced" exclusions that module can't know
 * about on its own (state rulers, regiment commanders, the player's character).
 *
 * Called once a year (day 1 of month 1) from the nobility.tick system — a "just accumulated too
 * many corpses" cleanup has no reason to run more often than that.
 */
export function pruneDeadCharactersAnnual(): number {
  const { pack } = getWorldContext();
  if (!pack.states?.length) return 0;

  const protectedIds = collectProtectedCharacterIds(pack.states);
  return pruneDeadCharacters({ protectedIds });
}
