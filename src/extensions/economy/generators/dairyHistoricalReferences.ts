import { ANNUAL_LITERS_PER_LACTATING_FEMALE, LACTATING_SHARE_OF_BREEDING_COHORT } from "./dairyProductionPolicy";
import { DAIRY_TARGETS } from "./foodLots";

/** Native source units are retained where a defensible conversion has not been established. */
export const DAIRY_HISTORICAL_REFERENCES = {
  biddickPeterborough: {
    citation: "Kathleen Biddick (1989), The Other Economy, pp. 94-95, Table 26",
    url: "https://publishing.cdlib.org/ucpressebooks/public/book/the-other-economy-pastoral-husbandry-on-a-medieval-estate.html",
    region: "Peterborough Abbey estate, England",
    accountYears: [1300, 1307, 1309],
    subject: "Estate dairy production; lactating cows recorded; some ewe milk not separately recorded",
    seasonalMilkGallonsPerCow: { minimum: 100, maximum: 130 },
    nativeGallonLiters: null,
    humanFoodAvailableShare: null,
    // This is an estate-output ratio, not an isolated cow-milk biological yield.
    account1307: { recordedLactatingCows: 247, cheesePounds: 16342, butterPounds: 3290, reservedMilkGallons: 2110 }
  },
  deWitteSlavin: {
    citation: "Sharon DeWitte and Philip Slavin (2013), Between Famine and Death, Appendix 1, p. 58",
    url: "https://sharondewitte.wordpress.com/wp-content/uploads/2014/03/dewitte-and-slavin-2013-between-famine-and-death.pdf",
    region: "England",
    years: { minimum: 1318, maximum: 1350 },
    subject: "Reconstruction assumptions per milk-producing animal, not all breeding animals",
    annualNativeGallons: { Cattle: 100, Sheep: 10, Goats: 18 },
    nativeGallonLiters: null
  },
  horrellHouseholds: {
    citation: "Sara Horrell (2023), Household consumption patterns, section II.I and Table 1",
    url: "https://onlinelibrary.wiley.com/doi/10.1111/ehr.13236",
    region: "England, reconstructed households",
    benchmarkYear: 1299,
    measure: "Expenditure shares; not physical quantities per resident",
    cheeseKilogramsPerPersonYear: null,
    freshMilkLitersPerPersonYear: null
  }
} as const;

/** Scoped evidence comparison only. No fictional market is inferred to be medieval England. */
export function getDairyCalibrationAssessment(
  annualLitersPerLactatingFemale: Readonly<Record<string, number>> = ANNUAL_LITERS_PER_LACTATING_FEMALE
) {
  const reference = DAIRY_HISTORICAL_REFERENCES.deWitteSlavin;
  const modelCow = annualLitersPerLactatingFemale.Cattle;
  const relativeYield = Object.fromEntries(
    ["Sheep", "Goats"].map(species => {
      const yieldLiters = annualLitersPerLactatingFemale[species];
      const modelRatio =
        modelCow > 0 && Number.isFinite(modelCow) && yieldLiters >= 0 && Number.isFinite(yieldLiters)
          ? yieldLiters / modelCow
          : null;
      const sourceRatio =
        reference.annualNativeGallons[species as "Sheep" | "Goats"] / reference.annualNativeGallons.Cattle;
      return [
        species,
        { modelRatio, sourceRatio, modelToSourceRatio: modelRatio === null ? null : modelRatio / sourceRatio }
      ];
    })
  );
  return {
    status: "Authored model parameters; scoped historical references do not establish universal targets",
    references: DAIRY_HISTORICAL_REFERENCES,
    currentTargets: { ...DAIRY_TARGETS },
    lactatingShareOfBreedingCohort: LACTATING_SHARE_OF_BREEDING_COHORT,
    relativeYield,
    confirmedCheeseKilogramsPerPersonYear: null,
    confirmedFreshMilkLitersPerPersonYear: null,
    calibratedStandingHerdTargetHeads: null,
    unresolved: [
      "Market region/period/production-system attribution",
      "Native historical gallon conversion and whole-milk versus processed outputs",
      "Breeding-cohort sex/lactation denominator and milk reserved for offspring",
      "Physical per-person consumption by household/income group; expenditure is not kg",
      "Butter and other joint dairy outputs and losses"
    ]
  };
}
