import { getCharacters, getCurrentYear, replaceCharacters } from "./charactersContext";
import type { Character } from "./characterTypes";

/**
 * Years a dead character must stay untouched before becoming eligible for removal. Gives
 * Nobility's reactive cleanup (processResignationsAndSuccessions, assignOfficers,
 * assignProvinceLords, Economy's guildSuccession, …) plenty of ticks to reassign whatever
 * office/command/role the character held before the record itself disappears. Those systems
 * run every tick (or every year at worst), so even the minimum real gap — a character who died
 * on the last day of a year, pruned on day 1 of the next — is already many ticks of buffer.
 */
export const DEFAULT_PRUNE_GRACE_YEARS = 1;

export interface PruneDeadCharactersOptions {
  /** Overrides DEFAULT_PRUNE_GRACE_YEARS — mainly for tests. */
  graceYears?: number;
  /**
   * Character ids that must never be pruned, regardless of how long ago they died — e.g. a
   * state's current ruler, a regiment's current commander, or the player's own character. Those
   * are looked up elsewhere via a raw stored id (getRulerId, MilitaryRegiment.commanderId) that
   * isn't re-validated against `dead` by every caller, so removing the record out from under a
   * still-current id would change behavior. This module deliberately has no knowledge of
   * states/regiments/military — that's Nobility's domain (AGENTS.md §7.1: Nobility depends on
   * Characters, never the reverse) — so callers that know about those pointers build this set.
   */
  protectedIds?: ReadonlySet<number>;
}

/**
 * Removes characters who have been dead long enough that nothing in the simulation still needs
 * them.
 *
 * Without this, the character roster only ever grows: `advanceCharacterAging()` marks a
 * character `dead: true` and closes out their titles, but never removes them from the array, so
 * a long session (years of Advance Time) keeps every character ever created, living or not.
 * That array lives in the live `simulation.extensions.characters.characters` slice (see
 * charactersContext.ts's getCharacters()) and is deep-cloned in full at least once per Advance
 * action for rollback safety (timeEngine.ts's takeDaySnapshot()), so its unbounded growth
 * directly drives session-long browser memory growth on top of the simulation cost of scanning
 * an ever-larger roster every tick.
 *
 * Returns the number of characters removed (0 if nothing was eligible).
 */
export function pruneDeadCharacters(options: PruneDeadCharactersOptions = {}): number {
  const graceYears = options.graceYears ?? DEFAULT_PRUNE_GRACE_YEARS;
  const protectedIds = options.protectedIds;
  const characters = getCharacters();
  if (!characters.length) return 0;

  const currentYear = getCurrentYear();
  const survivors: Character[] = [];
  let removedCount = 0;

  for (const character of characters) {
    if (isPrunable(character, currentYear, graceYears, protectedIds)) {
      removedCount++;
    } else {
      survivors.push(character);
    }
  }

  if (removedCount > 0) replaceCharacters(survivors);
  return removedCount;
}

function isPrunable(
  character: Character,
  currentYear: number,
  graceYears: number,
  protectedIds: ReadonlySet<number> | undefined
): boolean {
  if (!character.dead) return false;
  if (protectedIds?.has(character.i)) return false;
  // No recorded death year — don't guess an age, just leave it for a future pass.
  if (character.deathYear === undefined) return false;
  if (currentYear - character.deathYear < graceYears) return false;
  // advanceCharacterAging() closes every title to pastTitles the instant a character dies —
  // one still open means something about this death hasn't been processed yet.
  if (character.titles.length > 0) return false;
  // Non-political roles (guild master, market manager, apprentice, …) are closed out reactively
  // by their owning subsystem (e.g. economy's guildSuccession.ts) — an open one means the same.
  if (character.roles?.some(role => role.endYear === undefined)) return false;
  return true;
}
