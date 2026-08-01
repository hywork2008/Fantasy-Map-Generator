import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getRulerId } from "../../nobility/nobilityContext";

/**
 * Share of this cycle's domestic income (poll tax + voyage income, the same base
 * getStateMilitaryUpkeep() is deducted from in collectTaxes()) paid out as the ruler's
 * household stipend, credited to Character.wealth rather than banked as state.treasury.
 * See docs/plan/state-treasury-department-budget.md §3/§5 — a Monarchy's court draws
 * directly and heavily on crown income, while a Republic's doge is a salaried official kept
 * deliberately modest by the councils that check him. Values are placeholders (§3), not yet
 * calibrated against real income magnitudes.
 */
const HOUSEHOLD_STIPEND_RATE_BY_FORM: Record<string, number> = {
  Monarchy: 0.25,
  Theocracy: 0.08,
  Union: 0.08,
  Republic: 0.05,
  Anarchy: 0.15
};
const DEFAULT_HOUSEHOLD_STIPEND_RATE = HOUSEHOLD_STIPEND_RATE_BY_FORM.Monarchy;

export function getHouseholdStipendRate(state: Pick<State, "form">): number {
  return HOUSEHOLD_STIPEND_RATE_BY_FORM[state.form || ""] ?? DEFAULT_HOUSEHOLD_STIPEND_RATE;
}

/**
 * Pays this cycle's household stipend to the state's ruler and returns the amount to
 * deduct from domestic income — same call shape as getStateMilitaryUpkeep(), so
 * collectTaxes() folds both into one treasury update. If no living ruler is on file
 * (Characters/Nobility disabled, or between successions), the stipend is skipped and the
 * income stays banked in state.treasury instead of disappearing. getRulerId() already
 * degrades to `undefined` when Nobility is inactive; hasCharactersContext() covers the
 * independent case of Characters being disabled while Nobility still holds a stale
 * rulerId, since getCharacters() throws without an initialized Characters context.
 */
export function payRulerHouseholdStipend(state: State, domesticIncome: number): number {
  if (!(domesticIncome > 0) || !hasCharactersContext()) return 0;

  const rulerId = getRulerId(state);
  if (rulerId === undefined) return 0;
  const ruler = getCharacters().find(character => character.i === rulerId && !character.dead);
  if (!ruler) return 0;

  const stipend = rn(domesticIncome * getHouseholdStipendRate(state), 2);
  if (stipend <= 0) return 0;

  ruler.wealth = rn((ruler.wealth || 0) + stipend, 2);
  return stipend;
}
