import type { BanditCohort, MobileAdultCohort, UrbanLaborIntake } from "../generators/urbanLaborIntakeTypes";
import type { UrbanPregnancyRecord } from "../generators/urbanPregnancyTypes";
import { getSliceArray, setSliceArray } from "./economyApi";

/** Yearly burg-level intake ledgers; these model only new worker acceptance, not incumbent occupations. */
export function getUrbanLaborIntakes(): UrbanLaborIntake[] {
  return getSliceArray<UrbanLaborIntake>("urbanLaborIntakes");
}

export function setUrbanLaborIntakes(value: readonly UrbanLaborIntake[]): void {
  setSliceArray("urbanLaborIntakes", value);
}

/** Rural adult cohorts that have left their origin but have not yet found a permanent outcome. */
export function getMobileAdultCohorts(): MobileAdultCohort[] {
  return getSliceArray<MobileAdultCohort>("mobileAdultCohorts");
}

export function setMobileAdultCohorts(value: readonly MobileAdultCohort[]): void {
  setSliceArray("mobileAdultCohorts", value);
}

/** Settlers awaiting a Frontier Expansion project; they remain population accounted for in the extension slice. */
export function getFrontierAdultCohorts(): MobileAdultCohort[] {
  return getSliceArray<MobileAdultCohort>("frontierAdultCohorts");
}

export function setFrontierAdultCohorts(value: readonly MobileAdultCohort[]): void {
  setSliceArray("frontierAdultCohorts", value);
}

/** Aggregate outlaw cohorts. Their per-state pressure is consumed by TradeSecurity. */
export function getBanditCohorts(): BanditCohort[] {
  return getSliceArray<BanditCohort>("banditCohorts");
}

export function setBanditCohorts(value: readonly BanditCohort[]): void {
  setSliceArray("banditCohorts", value);
}

/** Urban pregnancy pipeline stock (docs/plan/urban-housing-system.md PR-P1). */
export function getUrbanPregnancy(): UrbanPregnancyRecord[] {
  return getSliceArray<UrbanPregnancyRecord>("urbanPregnancy");
}

export function setUrbanPregnancy(records: readonly UrbanPregnancyRecord[]): void {
  setSliceArray("urbanPregnancy", records);
}
