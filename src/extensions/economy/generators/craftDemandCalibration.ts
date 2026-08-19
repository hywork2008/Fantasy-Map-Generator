/**
 * Authored per-good demand and labor intensity (docs/plan/craft-demand-calibration.md §3).
 * laborPointsPerLot is an authored constant (policy A) — not solved at runtime from expected/lots.
 */

import { DEFAULT_PEOPLE_PER_POPULATION_POINT, REFERENCE_FIXTURE_LABOR_PEOPLE } from "./craftScale";
import type { DemandCategory } from "./goodsGeneratorTypes";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";

export type DemandProvenanceKind =
  | "householdPerCapita"
  | "recipeDerived"
  | "militaryLedger"
  | "strategicOrder"
  | "categoryResidual";

export interface GoodDemandCalibrationRow {
  goodName: string;
  domain: CraftKnowledgeDomain;
  inlandShare: number;
  portShare: number;
  provenances: readonly DemandProvenanceKind[];
  /** Annual lots per labor-person when provenance is household; omitted when lots are a floor. */
  annualLotsPerPerson?: number;
  fixtureLotsPerMonth: number;
  laborPointsPerLotAtDefaultRate: number;
  residualWeight: number;
  residualCategory?: "hunting" | "luxury";
  typicalRecipeIndex?: number;
  sources: readonly string[];
}

export const GOOD_DEMAND_CALIBRATION: readonly GoodDemandCalibrationRow[] = [
  {
    goodName: "Barrels",
    domain: "woodworking",
    inlandShare: 0.5,
    portShare: 0.3,
    provenances: ["recipeDerived"],
    annualLotsPerPerson: 0.01248,
    fixtureLotsPerMonth: 9.36,
    laborPointsPerLotAtDefaultRate: 0.00106,
    residualWeight: 0,
    sources: ["urban ale fillings: 0.65 adults × 48 L / 200 L cask × 0.08 turnover"]
  },
  {
    goodName: "Ropes",
    domain: "woodworking",
    inlandShare: 0.3,
    portShare: 0.5,
    provenances: ["householdPerCapita", "strategicOrder"],
    annualLotsPerPerson: 0.002,
    fixtureLotsPerMonth: 1.5,
    laborPointsPerLotAtDefaultRate: 0.00396,
    residualWeight: 0,
    sources: ["0.002 coil/person/year; port adds strategic shipbuilding orders at runtime"]
  },
  {
    goodName: "Arrows",
    domain: "woodworking",
    inlandShare: 0.2,
    portShare: 0.2,
    provenances: ["householdPerCapita", "militaryLedger"],
    annualLotsPerPerson: 0.0010666667,
    fixtureLotsPerMonth: 0.8,
    laborPointsPerLotAtDefaultRate: 0.00495,
    residualWeight: 0.5,
    residualCategory: "hunting",
    sources: ["peacetime 0.8 quiver/month at the 9000-person fixture; military ledger adds at runtime"]
  },
  {
    goodName: "Garments",
    domain: "textiles",
    inlandShare: 0.75,
    portShare: 0.6,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 0.00025,
    fixtureLotsPerMonth: 0.1875,
    laborPointsPerLotAtDefaultRate: 0.972,
    residualWeight: 1,
    sources: ["existing textileDemand people/1000/4/12"]
  },
  {
    goodName: "Cloth",
    domain: "textiles",
    inlandShare: 0.2,
    portShare: 0.15,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 0.1875,
    laborPointsPerLotAtDefaultRate: 0.259,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: ["Garments+Sails recipe input"]
  },
  {
    goodName: "Sails",
    domain: "textiles",
    inlandShare: 0.05,
    portShare: 0.25,
    provenances: ["strategicOrder"],
    fixtureLotsPerMonth: 0.05,
    laborPointsPerLotAtDefaultRate: 0.243,
    residualWeight: 0,
    sources: ["inland floor 0.05 lot/month; port uses shipbuilding orders at runtime"]
  },
  {
    goodName: "Boots",
    domain: "leather",
    inlandShare: 0.7,
    portShare: 0.7,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 0.0125,
    fixtureLotsPerMonth: 9.375,
    laborPointsPerLotAtDefaultRate: 0.0202,
    residualWeight: 0,
    sources: ["0.25 pair/person/year ÷ itemsPerUnit 20"]
  },
  {
    goodName: "Leather",
    domain: "leather",
    inlandShare: 0.3,
    portShare: 0.3,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 9.375,
    laborPointsPerLotAtDefaultRate: 0.00864,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: ["Boots + Harnesses input"]
  },
  {
    goodName: "Tools",
    domain: "metallurgy",
    inlandShare: 0.35,
    portShare: 0.35,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 0.02,
    fixtureLotsPerMonth: 15,
    laborPointsPerLotAtDefaultRate: 0.00252,
    residualWeight: 0,
    sources: ["0.02 set/person/year replacement"]
  },
  {
    goodName: "Arms",
    domain: "metallurgy",
    inlandShare: 0.25,
    portShare: 0.25,
    provenances: ["militaryLedger"],
    fixtureLotsPerMonth: 0.4,
    laborPointsPerLotAtDefaultRate: 0.0675,
    residualWeight: 0,
    sources: ["peacetime floor; military ledger at runtime"]
  },
  {
    goodName: "Harnesses",
    domain: "metallurgy",
    inlandShare: 0.15,
    portShare: 0.15,
    provenances: ["militaryLedger"],
    fixtureLotsPerMonth: 0.3,
    laborPointsPerLotAtDefaultRate: 0.054,
    residualWeight: 0,
    sources: ["mounted demand floor"]
  },
  {
    goodName: "Bullets",
    domain: "metallurgy",
    inlandShare: 0.15,
    portShare: 0.15,
    provenances: ["militaryLedger", "categoryResidual"],
    fixtureLotsPerMonth: 0.3,
    laborPointsPerLotAtDefaultRate: 0.054,
    residualWeight: 0.4,
    residualCategory: "hunting",
    sources: ["military ledger + hunting residual 0.4"]
  },
  {
    goodName: "Bronze",
    domain: "metallurgy",
    inlandShare: 0.1,
    portShare: 0.1,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 2,
    laborPointsPerLotAtDefaultRate: 0.0054,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: ["Tools/Arms bronze recipes"]
  },
  {
    goodName: "Roman Concrete",
    domain: "masonry",
    inlandShare: 0.55,
    portShare: 0.55,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 0.2,
    laborPointsPerLotAtDefaultRate: 0.0495,
    residualWeight: 0,
    sources: ["construction-op stone substitute; not house masons"]
  },
  {
    goodName: "Lime",
    domain: "masonry",
    inlandShare: 0.45,
    portShare: 0.45,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 0.2,
    laborPointsPerLotAtDefaultRate: 0.0405,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: ["Roman Concrete input"]
  },
  {
    goodName: "Ceramics",
    domain: "glassware",
    inlandShare: 0.7,
    portShare: 0.7,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 0.15,
    fixtureLotsPerMonth: 112.5,
    laborPointsPerLotAtDefaultRate: 0.000672,
    residualWeight: 0,
    sources: ["0.15 wain/person/year"]
  },
  {
    goodName: "Glass",
    domain: "glassware",
    inlandShare: 0.25,
    portShare: 0.25,
    provenances: ["categoryResidual"],
    fixtureLotsPerMonth: 1,
    laborPointsPerLotAtDefaultRate: 0.027,
    residualWeight: 1,
    residualCategory: "luxury",
    sources: ["luxury residual + liquor 0.25 derived"]
  },
  {
    goodName: "Lab Glassware",
    domain: "glassware",
    inlandShare: 0.05,
    portShare: 0.05,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 0.05,
    laborPointsPerLotAtDefaultRate: 0.108,
    residualWeight: 0,
    sources: ["authored floor 0.108 pt/lot; ratio misses when workshop consumption is 0"]
  },
  {
    goodName: "Books",
    domain: "printing",
    inlandShare: 0.6,
    portShare: 0.6,
    provenances: ["categoryResidual"],
    fixtureLotsPerMonth: 0.4,
    laborPointsPerLotAtDefaultRate: 0.0338,
    residualWeight: 1,
    residualCategory: "luxury",
    sources: ["luxury residual; capital ×2 applied by the caller"]
  },
  {
    goodName: "Paper",
    domain: "printing",
    inlandShare: 0.25,
    portShare: 0.25,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 0.4,
    laborPointsPerLotAtDefaultRate: 0.0141,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: ["Books input"]
  },
  {
    goodName: "Ink",
    domain: "printing",
    inlandShare: 0.15,
    portShare: 0.15,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 0.2,
    laborPointsPerLotAtDefaultRate: 0.0169,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: ["Books × 0.5"]
  },
  {
    goodName: "Liquor",
    domain: "instruments",
    inlandShare: 1,
    portShare: 1,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 0.000333,
    fixtureLotsPerMonth: 0.25,
    laborPointsPerLotAtDefaultRate: 0.036,
    residualWeight: 0,
    sources: ["provisional instruments map; annualLotsPerPerson authored, no vessel-liter contract"]
  }
];

export function getGoodDemandCalibration(goodName: string): GoodDemandCalibrationRow | undefined {
  return GOOD_DEMAND_CALIBRATION.find(row => row.goodName === goodName);
}

export function goodsForDomain(domain: CraftKnowledgeDomain): readonly GoodDemandCalibrationRow[] {
  return GOOD_DEMAND_CALIBRATION.filter(row => row.domain === domain);
}

export function domainShare(goodName: string, port: boolean): number {
  const row = getGoodDemandCalibration(goodName);
  if (!row) return 0;
  return port ? row.portShare : row.inlandShare;
}

export function laborPointsForLots(goodName: string, lots: number, populationRate: number): number {
  const row = getGoodDemandCalibration(goodName);
  if (!row) return lots;
  const rate = Math.max(1, populationRate);
  return Math.max(0, lots) * row.laborPointsPerLotAtDefaultRate * (DEFAULT_PEOPLE_PER_POPULATION_POINT / rate);
}

/**
 * PR 1 household / floor lots. Military, shipbuilding, and hinterland fillings are added by
 * later PRs; they must not return 0 for a mapped good just because those ledgers are empty.
 */
export function getCalibratedMonthlyLots(args: {
  goodName: string;
  laborPeopleBurg: number;
  port: boolean;
  capital?: boolean;
}): number {
  void args.port;
  const row = getGoodDemandCalibration(args.goodName);
  if (!row) return 0;
  const people = Math.max(0, args.laborPeopleBurg);
  if (row.annualLotsPerPerson != null) {
    return (people * row.annualLotsPerPerson) / 12;
  }
  const scale = people / REFERENCE_FIXTURE_LABOR_PEOPLE;
  let lots = row.fixtureLotsPerMonth * scale;
  if (args.capital && row.goodName === "Books") lots *= 2;
  return lots;
}

/**
 * Consumer-category share used by `collectConsumerDemand`. When calibration is on, rows with
 * residualWeight 0 leave the denominator (Barrels, Ropes, Tools, …). Rows with a residualCategory
 * keep only that category (Arrows hunting 0.5, Books luxury 1).
 */
export function consumerCoverageForCategory(
  good: { name: string; demandCoverage?: Partial<Record<DemandCategory, number>> },
  category: DemandCategory,
  applyCalibration: boolean
): number {
  const catalogue = good.demandCoverage?.[category] ?? 0;
  if (!applyCalibration) return catalogue;
  const row = getGoodDemandCalibration(good.name);
  if (!row) return catalogue;
  if (row.residualWeight <= 0) return 0;
  if (row.residualCategory) return row.residualCategory === category ? row.residualWeight : 0;
  return catalogue;
}

/**
 * Recipes that drive industrial (ingredient) demand. Calibration uses one representative recipe
 * so Beer's four grain paths do not quadruple Barrels 0.08. Uncalibrated goods still collapse to
 * the cheapest enabled recipe when the flag is on.
 */
export function recipesForIndustrialDemand<T extends Record<string, number>>(
  good: { name: string; recipes?: readonly T[] },
  applyCalibration: boolean,
  recipeCost: (recipe: T) => number
): readonly T[] {
  const recipes = good.recipes;
  if (!recipes?.length) return [];
  if (!applyCalibration) return recipes;
  const row = getGoodDemandCalibration(good.name);
  if (row?.typicalRecipeIndex != null) {
    const picked = recipes[row.typicalRecipeIndex];
    if (picked) return [picked];
  }
  let best = recipes[0];
  let bestCost = Number.POSITIVE_INFINITY;
  for (const recipe of recipes) {
    const cost = recipeCost(recipe);
    if (cost < bestCost) {
      bestCost = cost;
      best = recipe;
    }
  }
  return [best];
}
