import { worldSettings } from "./worldSettings";

/**
 * Soap a town person uses in a year, white and soft together (docs/plan/town-soap.md §3.1). The
 * British soap excise of 1793 (2¼d. a pound on hard soap, 1¾d. on soft) yielded a little over
 * £400,000: 43-55 million pounds, 2.0-2.6 kg a head of about 9.7 million people, the clothiers'
 * soft soap included. Country households boiled their own soft soap from their hearth lye and
 * kitchen fat. 0 turns the town soap need off: soap is then bought from the luxury budget as
 * before. Saved with the world; the Simulation settings tab edits it.
 */
export const TOWN_SOAP_KEY = "fmg-town-soap-kg";

export const DEFAULT_TOWN_SOAP_KG = 2;

export const TOWN_SOAP_KG_LIMITS = { min: 0, max: 10, step: 0.1 } as const;

function clampKilograms(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TOWN_SOAP_KG;
  return Math.max(TOWN_SOAP_KG_LIMITS.min, Math.min(TOWN_SOAP_KG_LIMITS.max, value));
}

export function getTownSoapKilograms(): number {
  try {
    const stored = worldSettings.getItem(TOWN_SOAP_KEY);
    if (stored !== null) return clampKilograms(Number(stored));
  } catch {
    // Blocked storage: the code default applies.
  }
  return DEFAULT_TOWN_SOAP_KG;
}

export function setTownSoapKilograms(value: number): number {
  const kilograms = clampKilograms(value);
  worldSettings.setItem(TOWN_SOAP_KEY, String(kilograms));
  return kilograms;
}
