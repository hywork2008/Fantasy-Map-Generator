import { getHusbandryMonthlyWorkDays, getHusbandryWorkers, getWorldContext } from "../economyContext";
import { WORKABLE_DAYS_PER_ADULT } from "./agriculturalLandUse";
import type { HusbandryDemand } from "./husbandryTypes";

/** One occupation reservation shared by care, haymaking and meat preparation. */
export function getHusbandryLaborBudget(cellId: number, month: number, demand: HusbandryDemand) {
  const calendar = getHusbandryMonthlyWorkDays();
  const hasCalendar = calendar.length === (getWorldContext().pack.cells.i?.length ?? 0) * 12 && calendar.length > 0;
  const assigned = Math.max(0, getHusbandryWorkers()[cellId] ?? 0);
  const value = hasCalendar ? calendar[cellId * 12 + month] : (assigned * WORKABLE_DAYS_PER_ADULT) / 12;
  const reservedDays = Number.isFinite(value) ? Math.max(0, value) : 0;
  const totalPlannedDays =
    demand.requiredWorkers * WORKABLE_DAYS_PER_ADULT * (demand.monthlyLaborWeights?.[month] ?? 1 / 12);
  const plannedHayDays =
    (demand.hayWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT * (demand.hayMonthlyLaborWeights?.[month] ?? 0);
  const plannedMeatDays =
    (demand.slaughterWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT * (demand.slaughterMonthlyLaborWeights?.[month] ?? 0);
  const plannedResidueDays =
    (demand.residueWorkers ?? 0) * WORKABLE_DAYS_PER_ADULT * (demand.residueMonthlyLaborWeights?.[month] ?? 0);
  const careRequiredDays = Math.max(0, totalPlannedDays - plannedHayDays - plannedMeatDays - plannedResidueDays);
  const careDays = Math.min(reservedDays, careRequiredDays);
  const hayShare = demand.requiredWorkers > 0 ? (demand.hayWorkers ?? 0) / demand.requiredWorkers : 0;
  const requestedHayDays = hasCalendar
    ? plannedHayDays
    : assigned * hayShare * WORKABLE_DAYS_PER_ADULT * (demand.hayMonthlyLaborWeights?.[month] ?? 0);
  return {
    basis: hasCalendar ? ("calendar" as const) : ("legacy-average" as const),
    reservedDays,
    workerMonths: hasCalendar ? reservedDays / (WORKABLE_DAYS_PER_ADULT / 12) : assigned,
    careRequiredDays,
    careDays,
    hayCapacityDays: Math.max(0, Math.min(requestedHayDays, reservedDays - careDays))
  };
}
