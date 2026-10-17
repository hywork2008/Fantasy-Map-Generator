import type { FeudalRegime } from "./types";

/**
 * Which European holding procedure a state uses.
 * Only `gaelicProvincial` allocates land today. The other keys are the gate
 * from docs/plan/medieval-european-nobility-holdings.md and do not change generation.
 */

const MEDIEVAL_PERIODS = new Set(["earlyMedieval", "highMedieval", "lateMedieval"]);

const EXCLUDED_FORM_NAMES = new Set([
  "Khanate",
  "Khaganate",
  "Horde",
  "Ulus",
  "Beylik",
  "Shogunate",
  "Emirate",
  "Caliphate",
  "Satrapy",
  "Tsardom",
  "Despotate"
]);

/** nameBases index → regime, for bases that do not split on state form. Italian is special. */
const REGIME_BY_BASE: Readonly<Record<number, FeudalRegime>> = {
  0: "germanImmediate",
  1: "englishHonour",
  2: "frenchTerritorial",
  4: "iberianConcejo",
  6: "nordicOfficer",
  8: "frenchTerritorial",
  9: "nordicOfficer",
  13: "iberianConcejo",
  15: "hungarianCounty",
  20: "iberianConcejo",
  22: "gaelicProvincial"
};

const EUROPEAN_BASES = new Set<number>([3, ...Object.keys(REGIME_BY_BASE).map(Number)]);

export interface RegimeInput {
  cultureBase: number;
  form?: string;
  formName?: string;
  period?: string;
}

function isCommunal(form: string | undefined, formName: string | undefined): boolean {
  return form === "Republic" || formName === "Free City" || formName === "City-state";
}

export function regimeFor(input: RegimeInput): FeudalRegime | null {
  if (!input.period || !MEDIEVAL_PERIODS.has(input.period)) return null;
  if (input.form === "Anarchy") return null;
  if (input.formName && EXCLUDED_FORM_NAMES.has(input.formName)) return null;
  if (!EUROPEAN_BASES.has(input.cultureBase)) return null;
  if (input.form === "Theocracy") return "episcopal";
  if (isCommunal(input.form, input.formName)) {
    return input.cultureBase === 3 ? "italianCommunal" : "urbanCommunal";
  }
  if (input.cultureBase === 3) return "italianFeudal";
  return REGIME_BY_BASE[input.cultureBase] ?? null;
}
