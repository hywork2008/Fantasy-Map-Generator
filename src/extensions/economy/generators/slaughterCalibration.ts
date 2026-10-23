import type { CarcassProfile } from "./slaughterTransactions";

/** Historical scopes are explicit scenario assignments, never inferred from culture names. */
export interface SlaughterCalibrationContext {
  regionId: string | null;
  year: number;
  species: string;
  cohort: "young" | "breeding" | "old" | "mixed" | "unknown";
  husbandryId: string | null;
}

export interface SlaughterCalibrationEvidence {
  id: string;
  sourceUrl: string;
  locator: string;
  regionId: string;
  /** Null means the source has not yet established numerical date bounds. */
  years: readonly [number, number] | null;
  species: string;
  husbandryId: string | null;
  eligibleCohorts: readonly SlaughterCalibrationContext["cohort"][];
  profile: CarcassProfile | null;
  unresolved: readonly string[];
}

const poundKg = 0.45359237;

/** Reference estimates only: none currently qualifies as a production default. */
export const HISTORICAL_SLAUGHTER_EVIDENCE: readonly SlaughterCalibrationEvidence[] = [
  ...(["Cattle", "Sheep"] as const).map(species => {
    const [carcass, lean, fat, other] = species === "Cattle" ? [310, 206, 36, 68] : [30, 20, 3.5, 6.5];
    return {
      id: `gibson-1988-${species.toLowerCase()}`,
      sourceUrl: "https://www.bahs.org.uk/AGHR/ARTICLES/36n2a4.pdf",
      locator: species === "Cattle" ? "pp. 164, 168" : "pp. 164, 170",
      regionId: "historical:scotland",
      years: null,
      species,
      husbandryId: "pre-improvement",
      eligibleCohorts: [],
      profile: {
        id: `gibson-1988-${species.toLowerCase()}`,
        version: 1,
        species,
        calibration: "unknown" as const,
        carcassKgPerHead: carcass * poundKg,
        leanKgPerHead: lean * poundKg,
        edibleFatKgPerHead: fat * poundKg,
        otherCarcassKgPerHead: other * poundKg
      },
      unresolved: ["numerical-date-bounds", "cohort-specific-yield", "husbandry-scenario-mapping"]
    };
  }),
  {
    id: "biddick-1989-peterborough-pig",
    sourceUrl:
      "https://publishing.cdlib.org/ucpressebooks/public/book/the-other-economy-pastoral-husbandry-on-a-medieval-estate.html",
    locator: "pp. 121-125; chapter 6 note 8; bibliography: Biddick 1985, pp. 161-177",
    regionId: "historical:peterborough-abbey-estate",
    years: [1309, 1310],
    species: "Pig",
    husbandryId: "estate-sty",
    eligibleCohorts: [],
    profile: null,
    unresolved: ["original-dressed-weight-calculation", "disjoint-carcass-compartments", "cohort-specific-yield"]
  }
];

/** Pure eligibility gate. Missing evidence never falls back to another region or age group. */
export function assessSlaughterCalibration(
  evidence: SlaughterCalibrationEvidence,
  context: SlaughterCalibrationContext
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!context.regionId || context.regionId !== evidence.regionId) reasons.push("region-mismatch");
  if (!Number.isSafeInteger(context.year)) reasons.push("invalid-year");
  if (!evidence.years?.every(Number.isSafeInteger) || evidence.years[0] > evidence.years[1]) {
    reasons.push("unverified-date-bounds");
  } else if (context.year < evidence.years[0] || context.year > evidence.years[1]) {
    reasons.push("date-mismatch");
  }
  if (context.species !== evidence.species) reasons.push("species-mismatch");
  if (!context.husbandryId || context.husbandryId !== evidence.husbandryId) reasons.push("husbandry-mismatch");
  if (!evidence.eligibleCohorts.includes(context.cohort)) reasons.push("unverified-cohort");
  if (!evidence.sourceUrl || !evidence.locator) reasons.push("missing-source");
  if (evidence.profile?.calibration !== "verified") reasons.push("unverified-yield");
  if (evidence.profile && evidence.profile.species !== evidence.species) reasons.push("profile-species-mismatch");
  reasons.push(...evidence.unresolved);
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)] };
}
