import { getBurgDemographics } from "../../hostCore";
import { rn } from "../../hostUtils";
import {
  getAdministrationEmployment,
  getBasicEmploymentSummary,
  getConstructionOperations,
  getCraftEmploymentRecords,
  getMineOperations,
  getQuarryOperations,
  getSmelterOperations,
  getUrbanPregnancy,
  getVolcanicAshOperations,
  getWorldContext
} from "../economyContext";
import { getStrategicIndustryWorkersByBurg, getTradeWorkersByBurg } from "./basicEmployment";
import { getHousingBacklog, getRequiredDwellings, normalizeConstructionOperation } from "./constructionEmployment";

/**
 * Display-only adult labor ledger for a Burg (employment composition card).
 * Does not mutate simulation state. Units are population points unless noted.
 *
 * Goal: make residual market labor (and household-care band) visible so future
 * job-creation policy can target sectors without treating homemakers as unemployed.
 */

/** Share of female adults counted as household care / domestic work (non-market). */
const HOUSEHOLD_CARE_FEMALE_SHARE = 0.5;
/** Share of male adults in household care (small; most market-facing in this model). */
const HOUSEHOLD_CARE_MALE_SHARE = 0.08;
/** Cap care by household count so tiny female cohorts are not over-assigned. */
const CARE_PER_HOUSEHOLD_POINTS = 0.85 / 4.5; // ≈0.189 points per population-point of total pop
/** Extra care points per pregnant adult (already non-market). */
const CARE_PER_PREGNANT = 0.5;

export interface BurgEmploymentComposition {
  burgId: number;
  /** maleAdults + femaleAdults */
  adults: number;
  maleAdults: number;
  femaleAdults: number;
  /** Non-market domestic / care band */
  householdCare: number;
  /** Adults available for market work after household care */
  marketLaborForce: number;
  administration: number;
  mining: number;
  smelting: number;
  quarrying: number;
  construction: number;
  trade: number;
  strategicIndustry: number;
  craft: number;
  /**
   * Service demand supported by basic employment (not necessarily filled seats).
   * Shown separately so residual uses assigned basic workers only where possible.
   */
  serviceDemand: number;
  /** Sum of assigned sector workers (admin…craft + construction + quarry/ash). */
  assignedMarket: number;
  /**
   * marketLaborForce − assignedMarket − min(serviceDemand, remaining).
   * Positive ⇒ room to create jobs; near zero ⇒ balanced; negative ⇒ double-count risk.
   */
  residual: number;
  /** residual / marketLaborForce, 0..1 when residual ≥ 0 */
  marketUnemployment: number;
  housingGap: number;
  /** Short English hint for which sector to grow next */
  recommendedFocus: string;
}

function sumActiveWorkers(
  operations: readonly { active: boolean; burgId: number; workers: number }[],
  burgId: number
): number {
  let sum = 0;
  for (const operation of operations) {
    if (!operation.active || operation.burgId !== burgId) continue;
    sum += operation.workers;
  }
  return sum;
}

/**
 * Build a labor composition snapshot for one burg. Safe when economy slices are empty.
 */
export function getBurgEmploymentComposition(burgId: number): BurgEmploymentComposition | null {
  if (!burgId) return null;
  const { pack, populationRate } = getWorldContext();
  const burg = pack.burgs?.[burgId];
  if (!burg?.i || burg.removed) return null;

  // Without a demographics block, the ledger is not meaningful (zeros are not "full unemployment").
  if (!burg.demographics) return null;

  const demographics = getBurgDemographics(burg);
  const maleAdults = Math.max(0, demographics.maleAdults);
  const femaleAdults = Math.max(0, demographics.femaleAdults);
  const adults = maleAdults + femaleAdults;

  const pregnant = Math.max(0, getUrbanPregnancy().find(record => record.burgId === burgId)?.pregnant ?? 0);
  const popPoints = Math.max(0, burg.population ?? 0);
  const careFromSex = femaleAdults * HOUSEHOLD_CARE_FEMALE_SHARE + maleAdults * HOUSEHOLD_CARE_MALE_SHARE;
  const careFromHouseholds = popPoints * CARE_PER_HOUSEHOLD_POINTS;
  const careFromPregnancy = pregnant * CARE_PER_PREGNANT;
  // Care cannot exceed adults; prefer the tighter of sex-share vs household cap, then add pregnancy gently.
  const householdCare = Math.min(adults, Math.min(careFromSex, careFromHouseholds) + careFromPregnancy * 0.25);

  const marketLaborForce = Math.max(0, adults - householdCare);

  const administration = getAdministrationEmployment().find(record => record.burgId === burgId)?.workers ?? 0;
  const mining = sumActiveWorkers(getMineOperations(), burgId);
  const smelting = sumActiveWorkers(getSmelterOperations(), burgId);
  let quarrying = 0;
  for (const quarry of getQuarryOperations()) {
    if (quarry.active && quarry.burgId === burgId) quarrying += quarry.quarryWorkers;
  }
  for (const ash of getVolcanicAshOperations()) {
    if (ash.active && ash.burgId === burgId) quarrying += ash.ashWorkers;
  }
  let construction = 0;
  for (const operation of getConstructionOperations()) {
    if (operation.active && operation.burgId === burgId) {
      construction += operation.masonWorkers + operation.carpenterWorkers;
    }
  }
  const trade = getTradeWorkersByBurg().get(burgId) ?? 0;
  const strategicIndustry = getStrategicIndustryWorkersByBurg().get(burgId) ?? 0;
  const craft = getCraftEmploymentRecords().find(record => record.burgId === burgId)?.workers ?? 0;

  const summary = getBasicEmploymentSummary().find(record => record.burgId === burgId);
  const serviceDemand = summary?.serviceEmploymentDemand ?? 0;

  const assignedBasic =
    administration + mining + smelting + quarrying + construction + trade + strategicIndustry + craft;
  // Services absorb residual market labor up to demand (display model; not a separate worker ledger).
  const afterBasic = Math.max(0, marketLaborForce - assignedBasic);
  const serviceAssigned = Math.min(serviceDemand, afterBasic);
  const assignedMarket = assignedBasic + serviceAssigned;
  const residual = marketLaborForce - assignedMarket;
  const marketUnemployment =
    marketLaborForce > 0 && residual > 0 ? Math.min(1, residual / marketLaborForce) : residual < 0 ? 0 : 0;

  let housingGap = 0;
  const constructionOp = getConstructionOperations().find(op => op.active && op.burgId === burgId);
  if (constructionOp) {
    const rate = Math.max(0, populationRate ?? 0) || 1;
    const normalized = normalizeConstructionOperation(constructionOp, burg, rate);
    const required = getRequiredDwellings(burg.population ?? 0, rate);
    housingGap = getHousingBacklog(normalized.dwellingStock, required);
  }

  const recommendedFocus = recommendEmploymentFocus({
    residual,
    housingGap,
    construction,
    mining,
    trade,
    craft,
    serviceDemand,
    serviceAssigned,
    marketLaborForce
  });

  return {
    burgId,
    adults: rn(adults, 2),
    maleAdults: rn(maleAdults, 2),
    femaleAdults: rn(femaleAdults, 2),
    householdCare: rn(householdCare, 2),
    marketLaborForce: rn(marketLaborForce, 2),
    administration: rn(administration, 2),
    mining: rn(mining, 2),
    smelting: rn(smelting, 2),
    quarrying: rn(quarrying, 2),
    construction: rn(construction, 2),
    trade: rn(trade, 2),
    strategicIndustry: rn(strategicIndustry, 2),
    craft: rn(craft, 2),
    serviceDemand: rn(serviceDemand, 2),
    assignedMarket: rn(assignedMarket, 2),
    residual: rn(residual, 2),
    marketUnemployment: rn(marketUnemployment, 4),
    housingGap: rn(housingGap, 4),
    recommendedFocus
  };
}

function recommendEmploymentFocus(args: {
  residual: number;
  housingGap: number;
  construction: number;
  mining: number;
  trade: number;
  craft: number;
  serviceDemand: number;
  serviceAssigned: number;
  marketLaborForce: number;
}): string {
  if (args.marketLaborForce <= 0) return "No adult market labor";
  if (args.residual <= 0.5) {
    if (args.residual < -0.5) return "Over-assigned (check double-counting)";
    return "Balanced";
  }
  // Physical backlog first
  if (args.housingGap >= 0.15) return "Construction / housing materials";
  if (args.serviceDemand > args.serviceAssigned + 0.5) return "Services (inns, shops, care trades)";
  if (args.trade < args.marketLaborForce * 0.05) return "Trade / markets";
  if (args.craft < args.marketLaborForce * 0.05) return "Craft / manufacturing";
  if (args.mining + args.construction < 1) return "Resource work or construction";
  return "Expand basic industry or public works";
}

/** Compact multi-line text for Burg Editor / tooltips (English UI). */
export function formatEmploymentCompositionSummary(composition: BurgEmploymentComposition): string {
  const u = rn(composition.marketUnemployment * 100, 1);
  return [
    `Adults ${composition.adults} (care ${composition.householdCare} → market ${composition.marketLaborForce})`,
    `Assigned ${composition.assignedMarket} · residual ${composition.residual} · market u ${u}%`,
    `Focus: ${composition.recommendedFocus}`
  ].join("\n");
}
