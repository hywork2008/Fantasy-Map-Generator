/**
 * Burg-scoped civic discontent (docs/plan/economy-coupling-audit.md L9).
 *
 * Distinct from `state.militaryDiscontent` (marshalcy / debt coup) and `state.religiousUnrest`
 * (Ecclesiastica neglect → assembly support). Those stay state-scoped and are not merged here.
 *
 * Sources, per tax cycle: food stress (`Burg.foodSecurity`), effective tax (domain levy /
 * extract / sales & poll tax), and `BurgMarketLedger.warIntensity`.
 * Sinks: burg treasury slack and a well-funded Ecclesiastica.
 * Downstream: a small manufacture productivity haircut and annual urban adult outflow.
 */

import type { Burg, State } from "../../hostTypes";
import { minmax, rn } from "../../hostUtils";
import { getBurgMarketLedgers, getWorldContext } from "../economyContext";
import { clampDomainLevyRate, DOMAIN_LEVY_RATE_DEFAULT, DOMAIN_LEVY_RATE_MAX } from "./domainFiscalPolicy";
import { getEconomyStartProfile } from "./economyStartMode";

export const DISCONTENT_MAX = 100;
/** Below this, discontent does not cut manufacture output or push urban adults out. */
export const DISCONTENT_EFFECT_FLOOR = 40;
/** Manufacture output multiplier at discontent 100. Plan: "小さな減衰". */
export const DISCONTENT_LABOR_MULTIPLIER_FLOOR = 0.85;
/** Annual share of burg adults who leave at discontent 100. */
export const DISCONTENT_OUTFLOW_MAX_RATE = 0.02;

/** Monthly gain at `foodSecurity` 0. */
export const FOOD_DISCONTENT_GAIN_MAX = 5;
/** Monthly gain at `warIntensity` 2.5. */
export const WAR_DISCONTENT_GAIN_MAX = 5;
export const WAR_INTENSITY_MAX = 2.5;
/** Monthly gain at `domainLevyRate` 1.5. */
export const LEVY_DISCONTENT_GAIN_MAX = 5;
/** Extra monthly gain when the seat's policy is extract. */
export const EXTRACT_DISCONTENT_GAIN = 1;
/** Sales-tax rate at which sales-tax discontent starts. Typical monarchy default. */
export const SALES_TAX_DISCONTENT_BASELINE = 0.15;
export const SALES_TAX_DISCONTENT_GAIN_MAX = 2;
/** Poll-tax rate at which poll-tax discontent starts. Typical monarchy default. */
export const POLL_TAX_DISCONTENT_BASELINE = 0.6;
export const POLL_TAX_DISCONTENT_GAIN_MAX = 1;

export const DISCONTENT_BASE_DECAY = 0.5;
/** Ecclesiastica service level at/above this adds the church-calm decay. */
export const ECCLESIASTICA_CALM_LEVEL = 0.8;
export const ECCLESIASTICA_DISCONTENT_DECAY = 2;
export const TREASURY_SLACK_DISCONTENT_DECAY_MAX = 1.5;

export interface BurgDiscontentInputs {
  foodSecurity: number;
  warIntensity: number;
  levyRate: number;
  extract: boolean;
  salesTax: number;
  pollTax: number;
  ecclesiasticaLevel: number;
  treasurySlack: number;
}

export function clampBurgDiscontent(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return rn(minmax(value, 0, DISCONTENT_MAX), 2);
}

/** Manufacture output multiplier. Unset / below the floor is 1. */
export function getDiscontentLaborMultiplier(discontent: number | undefined): number {
  const value = clampBurgDiscontent(discontent);
  if (value <= DISCONTENT_EFFECT_FLOOR) return 1;
  const t = (value - DISCONTENT_EFFECT_FLOOR) / (DISCONTENT_MAX - DISCONTENT_EFFECT_FLOOR);
  return rn(1 - t * (1 - DISCONTENT_LABOR_MULTIPLIER_FLOOR), 4);
}

/** Annual adult-outflow rate. Unset / below the floor is 0. */
export function getDiscontentOutflowRate(discontent: number | undefined): number {
  const value = clampBurgDiscontent(discontent);
  if (value <= DISCONTENT_EFFECT_FLOOR) return 0;
  const t = (value - DISCONTENT_EFFECT_FLOOR) / (DISCONTENT_MAX - DISCONTENT_EFFECT_FLOOR);
  return t * DISCONTENT_OUTFLOW_MAX_RATE;
}

function unit(value: number): number {
  return minmax(value, 0, 1);
}

export function computeBurgDiscontentDelta(input: BurgDiscontentInputs): number {
  const foodStress = 1 - unit(input.foodSecurity);
  const war = unit(input.warIntensity / WAR_INTENSITY_MAX);
  const levySpan = DOMAIN_LEVY_RATE_MAX - DOMAIN_LEVY_RATE_DEFAULT;
  const levyExcess = levySpan > 0 ? unit((input.levyRate - DOMAIN_LEVY_RATE_DEFAULT) / levySpan) : 0;
  const salesExcess = unit((input.salesTax - SALES_TAX_DISCONTENT_BASELINE) / SALES_TAX_DISCONTENT_BASELINE);
  const pollExcess = unit((input.pollTax - POLL_TAX_DISCONTENT_BASELINE) / POLL_TAX_DISCONTENT_BASELINE);

  const gain =
    foodStress * FOOD_DISCONTENT_GAIN_MAX +
    war * WAR_DISCONTENT_GAIN_MAX +
    levyExcess * LEVY_DISCONTENT_GAIN_MAX +
    (input.extract ? EXTRACT_DISCONTENT_GAIN : 0) +
    salesExcess * SALES_TAX_DISCONTENT_GAIN_MAX +
    pollExcess * POLL_TAX_DISCONTENT_GAIN_MAX;

  const ecclesiasticaDecay = input.ecclesiasticaLevel >= ECCLESIASTICA_CALM_LEVEL ? ECCLESIASTICA_DISCONTENT_DECAY : 0;
  const treasuryDecay = unit(input.treasurySlack) * TREASURY_SLACK_DISCONTENT_DECAY_MAX;
  const decay = DISCONTENT_BASE_DECAY + ecclesiasticaDecay + treasuryDecay;

  return rn(gain - decay, 2);
}

function treasurySlack(burg: Burg): number {
  const profile = getEconomyStartProfile(getWorldContext().options ?? {});
  const comfortable = Math.max(
    (burg.population ?? 0) * profile.burgTreasuryPerPopulation,
    (burg.product ?? 0) * profile.comfortableTreasuryMultiplier
  );
  if (!(comfortable > 0)) return 0;
  return unit((burg.treasury || 0) / comfortable);
}

export function settleBurgDiscontent(burg: Burg, state: State | undefined): number {
  const delta = computeBurgDiscontentDelta({
    foodSecurity: typeof burg.foodSecurity === "number" ? burg.foodSecurity : 1,
    warIntensity: getBurgMarketLedgers().find(ledger => ledger.burgId === burg.i)?.warIntensity ?? 0,
    levyRate: clampDomainLevyRate(burg.domainLevyRate),
    extract: burg.domainFiscalPolicy === "extract",
    salesTax: state?.salesTax || 0,
    pollTax: state?.pollTax || 0,
    ecclesiasticaLevel: state?.departmentServiceLevel?.ecclesiastica ?? 1,
    treasurySlack: treasurySlack(burg)
  });
  const next = clampBurgDiscontent((burg.discontent || 0) + delta);
  burg.discontent = next;
  return next;
}

/** One pass over every live burg. Call once per collectTaxes() cycle. */
export function settleAllBurgDiscontent(): void {
  const { pack } = getWorldContext();
  const burgs = pack.burgs || [];
  const states = pack.states || [];
  for (const burg of burgs) {
    if (!burg?.i || burg.removed) continue;
    const state = typeof burg.state === "number" ? states[burg.state] : undefined;
    settleBurgDiscontent(burg, state && !state.removed ? state : undefined);
  }
}
