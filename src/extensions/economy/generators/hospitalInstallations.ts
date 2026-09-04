/**
 * Hospital installations and burg.medicalCare civic score.
 * Design: docs/plan/chemistry-medicine-knowledge-accumulation.md §8.1
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getHospitalInstallations,
  getSimulationYear,
  getWorldContext,
  setHospitalInstallations,
  setMedicalCareReliefByBurg,
  settleAnnualOnce
} from "../economyContext";
import type { HospitalInstallation, MedicalCareReliefRow } from "./chemistryTypes";
import {
  clamp01,
  consumeNamed,
  debitTreasury,
  HOSPITAL_BUDGET,
  marketIdForBurg,
  pickSponsorBurg
} from "./chemMedCommon";

export const MEDICAL_CARE_DEFAULT = 50;

export function medicalCareScoreFromRelief(relief: number): number {
  return rn(50 + clamp01(relief) * 50, 1);
}

export function writeBurgMedicalCareFromRelief(reliefByBurg: readonly MedicalCareReliefRow[]): void {
  const pack = getWorldContext().pack;
  const byBurg = new Map(reliefByBurg.map(row => [row.burgId, row.relief]));
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    if (!byBurg.has(burg.i) && typeof burg.medicalCare !== "number") burg.medicalCare = MEDICAL_CARE_DEFAULT;
    if (byBurg.has(burg.i)) burg.medicalCare = medicalCareScoreFromRelief(byBurg.get(burg.i) ?? 0);
  }
  rollupProvinceAndStateMedicalCare();
}

export function rollupProvinceAndStateMedicalCare(): void {
  const pack = getWorldContext().pack;
  const byProvince = new Map<number, { sum: number; n: number }>();
  const byState = new Map<number, { sum: number; n: number }>();

  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    const score = typeof burg.medicalCare === "number" ? burg.medicalCare : MEDICAL_CARE_DEFAULT;
    const provinceId = burg.province ?? 0;
    if (provinceId > 0) {
      const entry = byProvince.get(provinceId) ?? { sum: 0, n: 0 };
      entry.sum += score;
      entry.n += 1;
      byProvince.set(provinceId, entry);
    }
    const stateId = burg.state ?? 0;
    if (stateId > 0) {
      const entry = byState.get(stateId) ?? { sum: 0, n: 0 };
      entry.sum += score;
      entry.n += 1;
      byState.set(stateId, entry);
    }
  }

  for (const province of pack.provinces ?? []) {
    if (!province?.i || province.removed) continue;
    const entry = byProvince.get(province.i);
    if (entry && entry.n > 0) province.medicalCare = rn(entry.sum / entry.n, 1);
  }
  for (const state of pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    const entry = byState.get(state.i);
    if (entry && entry.n > 0) state.medicalCare = rn(entry.sum / entry.n, 1);
  }
}

function ratedCareFor(role: HospitalInstallation["role"]): number {
  return role === "service" ? 0.8 : 0.4;
}

export class HospitalInstallationsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.hospitalInstallations)) return false;

    const hospitals = [...getHospitalInstallations()];
    const states = getWorldContext().pack.states ?? [];
    const occupied = new Set(hospitals.filter(row => row.active).map(row => row.burgId));

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("hospitalMedicine", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      const stateHospitals = hospitals.filter(row => row.stateId === state.i);
      if (stateHospitals.length === 0) {
        const burgId = pickSponsorBurg(state.i);
        if (burgId && debitTreasury(state.i, HOSPITAL_BUDGET)) {
          hospitals.push({
            burgId,
            stateId: state.i,
            role: "trial",
            active: true,
            practitioners: 3,
            condition: 1,
            utilization: 0,
            ratedCare: ratedCareFor("trial"),
            documentedRuns: 0,
            lastFundedYear: year
          });
          occupied.add(burgId);
        }
      }

      if (isTechnologyStageAtLeast(stage, "adopted")) {
        for (const hospital of hospitals) {
          if (hospital.stateId === state.i && hospital.role === "trial") {
            hospital.role = "service";
            hospital.ratedCare = ratedCareFor("service");
            hospital.practitioners = 6;
          }
        }
      }

      const publicHealth = getTechnologyStage("earlyPublicHealth", state.i);
      const wantSecond =
        isTechnologyStageAtLeast(publicHealth, "known") &&
        hospitals.filter(row => row.stateId === state.i && row.active).length < 2;
      if (wantSecond) {
        const burgId = pickSponsorBurg(state.i);
        if (burgId && !occupied.has(burgId) && debitTreasury(state.i, HOSPITAL_BUDGET)) {
          hospitals.push({
            burgId,
            stateId: state.i,
            role: "service",
            active: true,
            practitioners: 6,
            condition: 1,
            utilization: 0,
            ratedCare: ratedCareFor("service"),
            documentedRuns: 0,
            lastFundedYear: year
          });
          occupied.add(burgId);
        }
      }
    }

    const relief: MedicalCareReliefRow[] = [];
    for (const hospital of hospitals) {
      if (!hospital.active) continue;
      if (!debitTreasury(hospital.stateId, HOSPITAL_BUDGET)) {
        hospital.active = false;
        hospital.utilization = 0;
        relief.push({ burgId: hospital.burgId, relief: 0 });
        continue;
      }
      hospital.lastFundedYear = year;
      const marketId = marketIdForBurg(hospital.burgId);
      const dose = hospital.role === "trial" ? 0.3 : 0.8;
      const medicines = consumeNamed(marketId, "Medicines", dose);
      const soap = consumeNamed(marketId, "Soap", dose * 0.5);
      const vinegar = consumeNamed(marketId, "Vinegar", dose * 0.5);
      const coverage = Math.min(1, medicines / dose, soap / (dose * 0.5 || 1), vinegar / (dose * 0.5 || 1));
      hospital.utilization = rn(Math.max(0, coverage), 4);
      hospital.condition = rn(Math.max(0.2, hospital.condition * 0.98 + hospital.utilization * 0.04), 4);
      if (hospital.utilization > 0.25) hospital.documentedRuns += 1;
      relief.push({
        burgId: hospital.burgId,
        relief: clamp01(hospital.condition * hospital.utilization * hospital.ratedCare)
      });
    }

    setHospitalInstallations(hospitals);
    setMedicalCareReliefByBurg(relief);
    writeBurgMedicalCareFromRelief(relief);
    return true;
  }
}

export const HospitalInstallations = new HospitalInstallationsModule();
