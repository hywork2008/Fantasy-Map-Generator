import type { State } from "../../hostTypes";
import { peopleToPoints, pointsToPeople } from "./craftScale";

/** Administrative employment at one state's capital Burg (docs/plan/urban-employment-demand.md §3.4). */
export interface AdministrationEmploymentRecord {
  burgId: number;
  stateId: number;
  workers: number;
}

/** Share of the state's total population devoted to administration (calibration TBD, §5.1 decision 3's tolerance applies). */
const REQUIRED_WORKERS_PER_STATE_POPULATION = 0.005;
/**
 * Most a capital's own adults can give to the state's central administration. The rest of the
 * realm's officials and garrisons work in the provinces and do not draw on the capital
 * (docs/analytics/economy-start-20261102.md §4): court and offices were some 5-10% of a small
 * residence town and 1-2% of a large capital.
 */
export const ADMINISTRATION_MAX_CAPITAL_ADULT_SHARE = 0.15;

/**
 * Population points a state's capital gives to administration (clerks, tax collectors, and the
 * capital's garrison — §5.1 decision 5), for the annual Burg-anchored reconciliation in
 * `basicEmployment.ts`. Counted in people, then capped by the capital's adults.
 */
export function getAdministrationRequiredWorkers(
  state: Pick<State, "rural" | "urban" | "burgs">,
  capitalAdults: number,
  populationRate: number
): number {
  const required = peopleToPoints(getAdministrationEmploymentPeople(state, populationRate), populationRate);
  return Math.min(required, Math.max(0, capitalAdults) * ADMINISTRATION_MAX_CAPITAL_ADULT_SHARE);
}

/**
 * Real-people headcount for a state's administration (docs/plan/craft-demand-calibration.md §2.0
 * P5). The reconcile slot, the closed-inventory academy-administration input (capped at
 * ACADEMY_ADMIN_KNOWLEDGE_CAP_PEOPLE) and Calibration Overview all read it.
 */
export const ADMINISTRATION_EMPLOYMENT_BASE_PEOPLE = 8;
export const ADMINISTRATION_EMPLOYMENT_PEOPLE_PER_BURG = 2;
/** Single-source academy-administration coverage cap: 8/16 = 0.50 (docs/plan/craft-demand-calibration.md §2.0). */
export const ACADEMY_ADMIN_KNOWLEDGE_CAP_PEOPLE = 8;

export function getAdministrationEmploymentPeople(
  state: Pick<State, "rural" | "urban" | "burgs">,
  populationRate: number
): number {
  const statePopulationPoints = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
  const burgCount = Math.max(0, state.burgs ?? 0);
  return (
    ADMINISTRATION_EMPLOYMENT_BASE_PEOPLE +
    burgCount * ADMINISTRATION_EMPLOYMENT_PEOPLE_PER_BURG +
    pointsToPeople(statePopulationPoints * REQUIRED_WORKERS_PER_STATE_POPULATION, populationRate)
  );
}
