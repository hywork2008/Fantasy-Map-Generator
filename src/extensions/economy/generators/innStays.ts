import type { Burg } from "../../hostTypes";
import {
  getInnStayLedgers,
  getMobileAdultCohorts,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext,
  setInnStayLedgers,
  setMobileAdultCohorts
} from "../economyContext";
import { getInnFacilitiesForBurg, getInnFacilityTotals } from "./innFacilities";
import type { InnStayLedger, InnTemporaryLodgerCohort } from "./innFacilityTypes";
import type { MobileAdultCohort } from "./urbanLaborIntakeTypes";

export const TEMPORARY_LODGER_MAX_STAY_MONTHS = 12;

function currentAbsoluteMonth(): number {
  return getSimulationYear() * 12 + getSimulationMonth() - 1;
}

function peoplePerPopulationPoint(): number {
  const world = getWorldContext();
  return Math.max(0, world.populationRate) * Math.max(0, world.urbanization);
}

function getCohortPopulationPoints(cohort: Pick<InnTemporaryLodgerCohort, "maleAdults" | "femaleAdults">): number {
  return Math.max(0, cohort.maleAdults) + Math.max(0, cohort.femaleAdults);
}

function getTemporaryLodgerPeople(ledger: InnStayLedger): number {
  return ledger.temporaryLodgerCohorts.reduce(
    (sum, cohort) => sum + getCohortPopulationPoints(cohort) * peoplePerPopulationPoint(),
    0
  );
}

export function getTemporaryLodgerPopulationPointsByBurg(): ReadonlyMap<number, number> {
  return new Map(
    getInnStayLedgers().map(ledger => [
      ledger.burgId,
      ledger.temporaryLodgerCohorts.reduce((sum, cohort) => sum + getCohortPopulationPoints(cohort), 0)
    ])
  );
}

export function getTemporaryLodgerPeopleByBurg(): ReadonlyMap<number, number> {
  return new Map(getInnStayLedgers().map(ledger => [ledger.burgId, getTemporaryLodgerPeople(ledger)]));
}

export function getAvailableTemporaryInnBeds(burgId: number): number {
  const beds = getInnFacilityTotals(getInnFacilitiesForBurg(burgId)).beds;
  const ledger = getInnStayLedgers().find(candidate => candidate.burgId === burgId);
  return Math.max(
    0,
    Math.floor(beds - (ledger?.transientGuests ?? 0) - (ledger ? getTemporaryLodgerPeople(ledger) : 0))
  );
}

function splitAdults(cohort: MobileAdultCohort, accepted: number): [number, number] {
  const total = Math.max(0, cohort.maleAdults) + Math.max(0, cohort.femaleAdults);
  if (total <= 0 || accepted <= 0) return [0, 0];
  const maleAdults = Math.min(cohort.maleAdults, accepted * (cohort.maleAdults / total));
  return [maleAdults, Math.min(cohort.femaleAdults, accepted - maleAdults)];
}

/**
 * Books a first-year mobile cohort into nearby inns only. The result remains outside burg
 * population and employment until a later permanent-residence rule accepts it.
 */
export function admitTemporaryLodgers(
  cohort: MobileAdultCohort,
  candidateBurgs: readonly Pick<Burg, "i">[]
): MobileAdultCohort {
  if (cohort.yearsSearching > 0) return cohort;
  const perPoint = peoplePerPopulationPoint();
  if (perPoint <= 0) return cohort;

  const ledgersByBurg = new Map(
    getInnStayLedgers().map(ledger => [
      ledger.burgId,
      { ...ledger, temporaryLodgerCohorts: [...ledger.temporaryLodgerCohorts] }
    ])
  );
  const unresolved = { ...cohort };
  const deadlineMonth = currentAbsoluteMonth() + TEMPORARY_LODGER_MAX_STAY_MONTHS;

  for (const burg of candidateBurgs) {
    const burgId = burg.i;
    if (!burgId) continue;
    if (getCohortPopulationPoints(unresolved) <= 0) break;
    const availablePeople = getAvailableTemporaryInnBeds(burgId);
    if (availablePeople <= 0) continue;
    const acceptedPoints = Math.min(getCohortPopulationPoints(unresolved), availablePeople / perPoint);
    const [maleAdults, femaleAdults] = splitAdults(unresolved, acceptedPoints);
    if (maleAdults + femaleAdults <= 0) continue;

    const ledger: InnStayLedger = ledgersByBurg.get(burgId) ?? {
      burgId,
      transientGuests: 0,
      temporaryLodgerCohorts: []
    };
    ledger.temporaryLodgerCohorts.push({
      originCell: cohort.originCell,
      originState: cohort.originState,
      maleAdults,
      femaleAdults,
      deadlineMonth
    });
    ledgersByBurg.set(burgId, ledger);
    unresolved.maleAdults -= maleAdults;
    unresolved.femaleAdults -= femaleAdults;
  }

  setInnStayLedgers([...ledgersByBurg.values()]);
  return unresolved;
}

/** Returns expired temporary lodgers to the ordinary mobile-cohort outcome path. */
export function settleInnStaysMonthly(): boolean {
  const currentMonth = currentAbsoluteMonth();
  const nextLedgers: InnStayLedger[] = [];
  const returningCohorts: MobileAdultCohort[] = [];
  let changed = false;

  for (const ledger of getInnStayLedgers()) {
    const remaining: InnTemporaryLodgerCohort[] = [];
    for (const cohort of ledger.temporaryLodgerCohorts) {
      if (cohort.deadlineMonth > currentMonth) {
        remaining.push(cohort);
        continue;
      }
      changed = true;
      returningCohorts.push({
        originCell: cohort.originCell,
        originState: cohort.originState,
        maleAdults: cohort.maleAdults,
        femaleAdults: cohort.femaleAdults,
        yearsSearching: 1
      });
    }
    if (remaining.length || ledger.transientGuests > 0) {
      nextLedgers.push({ ...ledger, temporaryLodgerCohorts: remaining });
    } else if (ledger.temporaryLodgerCohorts.length) {
      changed = true;
    }
  }

  if (!changed) return false;
  setInnStayLedgers(nextLedgers);
  setMobileAdultCohorts([...getMobileAdultCohorts(), ...returningCohorts]);
  return true;
}

export const InnStays = {
  admitTemporaryLodgers,
  clear: (): void => setInnStayLedgers([]),
  getAvailableTemporaryBeds: getAvailableTemporaryInnBeds,
  getTemporaryLodgerPeopleByBurg,
  getTemporaryLodgerPopulationPointsByBurg,
  settleMonthly: settleInnStaysMonthly
};
