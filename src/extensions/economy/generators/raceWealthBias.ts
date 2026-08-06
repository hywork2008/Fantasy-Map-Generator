import { getRaceById } from "../../../data/races";
import type { Character } from "../../characters/characterTypes";
import { getRaceMaturityAge } from "../../characters/raceAge";
import { getWorldContext } from "../economyContext";

/**
 * Species-level "hoarding" flavor for personal wealth, layered on top of the flat fixed-stipend
 * seed (characterStipends.ts's `backPayCycles()`) rather than replacing it.
 *
 * Unlike the flat seed, this term scales with how many *adult* years (age past the race's
 * maturity / `fertilityStart`) a character has actually lived — a hoarding species only ends up
 * with an unspendable pile once it has had the centuries to accumulate one, not on day one of
 * every generation. A freshly-matured Draconic market manager and a 1000-year-old Draconic elder
 * both get the same flat seed from characterStipends.ts; only the elder also gets this bonus, and
 * it can legitimately dwarf every other character's purse — that's intentional, not a bug (other
 * characters hold a few gold personally / a few dozen in a Public treasury; an ancient Draconic
 * hoarding 1000+ gold on its own is accepted game balance).
 *
 * SP hoarded per adult year lived. Applies to every generation-time personal-wealth seed (ruler,
 * central office, field commander, province lord, guild master, market manager/rival) via
 * `raceHoardBonus()`. Guild apprentices are always at or below maturity by construction
 * (`rollApprenticeAge`), so this is always 0 for them regardless of race — no special-casing
 * needed there.
 *
 * Rationale per race (ties to racePersonalityBias.ts's `greed` deltas where relevant):
 * - draconic: apex hoarder (greed +8, sociability -10) — the flagship "ancient wyrm sitting on an
 *   unspendable hoard" case. 1 SP/adult-year means a 1000-year-old (≈900 adult years past
 *   maturity 100) already clears 900 SP (~75 gold) from age alone, on top of its flat seed and
 *   role stipend, growing further toward the 1200–2000 lifespan ceiling.
 * - giant: long-lived god-line, but personality is aloof rather than acquisitive (greed -2) — a
 *   modest trickle, not a hoard.
 * - dark_elf: guile-driven trade and politics (guile +8) banks a small personal margin over time.
 * - elf, dwarf, human, unknown, orc, goblin, arachnid, amazones, wyrmkin: 0. Elves explicitly do
 *   *not* hoard despite a 750-year lifespan (greed -12, lives for other things); dwarves reinvest
 *   surplus into craft/institution rather than a personal pile (see characterStipends.ts's flat
 *   seed, which still pays them normally); the rest are short-lived or not thematically hoarders —
 *   unchanged from the already-tuned baseline.
 */
export const RACE_HOARD_SP_PER_ADULT_YEAR: Readonly<Record<string, number>> = {
  draconic: 1.0,
  giant: 0.2,
  dark_elf: 0.08
};

/** Adult years (age past race maturity) a character has lived, never negative. */
function adultYearsLived(character: Character): number {
  const maturity = getRaceMaturityAge(character.race);
  return Math.max(0, (character.age ?? 0) - maturity);
}

/**
 * One-time generation-time hoard bonus (SP, unrounded — callers fold it into their own `rn(...)`
 * total) to add on top of a role's flat stipend seed. Returns 0 for races without an entry in
 * `RACE_HOARD_SP_PER_ADULT_YEAR` — safe to call unconditionally for every role/race.
 */
export function raceHoardBonus(character: Character): number {
  const key = getRaceById(getWorldContext().pack.races, character.race)?.key;
  const rate = key ? RACE_HOARD_SP_PER_ADULT_YEAR[key] : undefined;
  if (!rate) return 0;
  return adultYearsLived(character) * rate;
}
