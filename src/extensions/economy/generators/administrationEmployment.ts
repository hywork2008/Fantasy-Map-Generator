import type { State } from "../../hostTypes";
import { pointsToPeople } from "./craftScale";

/** Administrative employment at one state's capital Burg (docs/plan/urban-employment-demand.md §3.4). */
export interface AdministrationEmploymentRecord {
  burgId: number;
  stateId: number;
  workers: number;
}

/** Baseline clerks/guards even for a fledgling one-burg state. */
const REQUIRED_WORKERS_BASE = 4;
/** Share of the state's total population devoted to administration (calibration TBD, §5.1 decision 3's tolerance applies). */
const REQUIRED_WORKERS_PER_STATE_POPULATION = 0.005;
/** Per-Burg liaison/record-keeping and, per §5.1 decision 5, the garrison this implies. */
const REQUIRED_WORKERS_PER_BURG = 1;

/**
 * Headcount a state's administration (clerks, tax collectors, and the capital's garrison —
 * §5.1 decision 5) needs to fully cover its population and Burg count. Reused by the annual
 * Burg-anchored reconciliation in `basicEmployment.ts`.
 */
export function getAdministrationRequiredWorkers(state: Pick<State, "rural" | "urban" | "burgs">): number {
  const statePopulation = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
  const burgCount = Math.max(0, state.burgs ?? 0);
  return (
    REQUIRED_WORKERS_BASE +
    statePopulation * REQUIRED_WORKERS_PER_STATE_POPULATION +
    burgCount * REQUIRED_WORKERS_PER_BURG
  );
}

/**
 * Real-people headcount for a state's administration, authored independently of
 * getAdministrationRequiredWorkers() (docs/plan/craft-demand-calibration.md §2.0 P5). Decoupled
 * from the population-point reconcile loop in basicEmployment.ts — used only for the
 * closed-inventory academy-administration input (capped at ACADEMY_ADMIN_KNOWLEDGE_CAP_PEOPLE)
 * and for Calibration Overview display.
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
