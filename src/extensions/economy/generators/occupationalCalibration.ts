/**
 * Historical occupational targets per urban labor-people (docs/plan/craft-demand-calibration.md §2).
 * Authored tables only — does not write world state.
 */

import { peopleToPoints, REFERENCE_FIXTURE_LABOR_PEOPLE } from "./craftScale";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import type { HousingRecipe } from "./housingRecipes";

export const CONSTRUCTION_TOTAL_PER_THOUSAND = 22;

export type OccupationalPool =
  | CraftKnowledgeDomain
  | "constructionCarpenter"
  | "constructionMason"
  | "administration"
  | "mining"
  | "smelting"
  | "trade";

export interface OccupationalCalibrationRow {
  pool: OccupationalPool;
  peoplePerThousandUrban: {
    min: number;
    max: number;
    inlandTypicalPerThousand: number;
  };
  modifiers?: {
    port?: number;
    capital?: number;
    hasQuarry?: number;
    cultureWoodShare?: boolean;
  };
  goodNames: readonly string[];
  guildDomain: CraftKnowledgeDomain | null;
  sources: readonly string[];
}

export const OCCUPATIONAL_CALIBRATION: readonly OccupationalCalibrationRow[] = [
  {
    pool: "woodworking",
    peoplePerThousandUrban: { min: 1, max: 5, inlandTypicalPerThousand: 2.2 },
    modifiers: { port: 2 },
    goodNames: ["Barrels", "Ropes", "Arrows"],
    guildDomain: "woodworking",
    sources: ["Laumonier Montpellier 1435-46 (fustiers are housing+furniture; this row is cooper/rope/bowyer only)"]
  },
  {
    pool: "textiles",
    peoplePerThousandUrban: { min: 15, max: 40, inlandTypicalPerThousand: 27 },
    goodNames: ["Cloth", "Garments", "Sails"],
    guildDomain: "textiles",
    sources: ["urban clothing replacement + sail loft share"]
  },
  {
    pool: "leather",
    peoplePerThousandUrban: { min: 20, max: 40, inlandTypicalPerThousand: 30 },
    goodNames: ["Leather", "Boots"],
    guildDomain: "leather",
    sources: ["Montpellier cobblers ~4% of known occupations; band is tanners+cobblers"]
  },
  {
    pool: "metallurgy",
    peoplePerThousandUrban: { min: 8, max: 20, inlandTypicalPerThousand: 12 },
    goodNames: ["Bronze", "Tools", "Arms", "Bullets", "Harnesses"],
    guildDomain: "metallurgy",
    sources: ["urban smithing; smelter site labor is added separately and is not this row"]
  },
  {
    pool: "masonry",
    peoplePerThousandUrban: { min: 1, max: 3, inlandTypicalPerThousand: 2 },
    goodNames: ["Lime", "Roman Concrete"],
    guildDomain: "masonry",
    sources: ["lime/concrete manufacture only; house masons stay on constructionMason"]
  },
  {
    pool: "glassware",
    peoplePerThousandUrban: { min: 8, max: 20, inlandTypicalPerThousand: 12 },
    goodNames: ["Ceramics", "Glass", "Lab Glassware"],
    guildDomain: "glassware",
    sources: ["urban pottery + glass"]
  },
  {
    pool: "printing",
    peoplePerThousandUrban: { min: 1, max: 5, inlandTypicalPerThousand: 2.5 },
    goodNames: ["Paper", "Ink", "Books"],
    guildDomain: "printing",
    sources: ["urban stationery; capital books use the capital modifier on demand rows"]
  },
  {
    pool: "instruments",
    peoplePerThousandUrban: { min: 0.5, max: 2, inlandTypicalPerThousand: 1 },
    goodNames: ["Liquor"],
    guildDomain: "instruments",
    sources: ["provisional — Liquor mapped until a clockmaker good exists"]
  },
  {
    pool: "constructionCarpenter",
    peoplePerThousandUrban: { min: 5, max: 18, inlandTypicalPerThousand: 10 },
    modifiers: { cultureWoodShare: true },
    goodNames: [],
    guildDomain: null,
    sources: ["housingRecipes wood share of constructionTotalPerThousand 22"]
  },
  {
    pool: "constructionMason",
    peoplePerThousandUrban: { min: 5, max: 18, inlandTypicalPerThousand: 12 },
    modifiers: { cultureWoodShare: true },
    goodNames: [],
    guildDomain: null,
    sources: ["housingRecipes stone+brick share of constructionTotalPerThousand 22"]
  },
  {
    pool: "administration",
    peoplePerThousandUrban: { min: 8, max: 25, inlandTypicalPerThousand: 15 },
    modifiers: { capital: 1 },
    goodNames: [],
    guildDomain: null,
    sources: ["capital clerks only"]
  },
  {
    pool: "mining",
    peoplePerThousandUrban: { min: 0, max: 0, inlandTypicalPerThousand: 0 },
    modifiers: { hasQuarry: 1 },
    goodNames: [],
    guildDomain: null,
    sources: ["site labor; expected 0 from the urban table"]
  },
  {
    pool: "smelting",
    peoplePerThousandUrban: { min: 0, max: 0, inlandTypicalPerThousand: 0 },
    goodNames: [],
    guildDomain: null,
    sources: ["site labor; expected 0 from the urban table"]
  },
  {
    pool: "trade",
    peoplePerThousandUrban: { min: 40, max: 120, inlandTypicalPerThousand: 80 },
    goodNames: [],
    guildDomain: null,
    sources: ["market-centre merchants; diagnostic only"]
  }
];

export function getOccupationalRow(pool: OccupationalPool): OccupationalCalibrationRow {
  const row = OCCUPATIONAL_CALIBRATION.find(candidate => candidate.pool === pool);
  if (!row) throw new Error(`Missing occupational calibration row: ${pool}`);
  return row;
}

export function expectedWorkerPeople(args: {
  row: OccupationalCalibrationRow;
  laborPeople: number;
  port: boolean;
  capital: boolean;
  hasQuarry: boolean;
  housingRecipe?: HousingRecipe;
}): number {
  const perK = args.row.peoplePerThousandUrban.inlandTypicalPerThousand;
  let people = (args.laborPeople / 1000) * perK;
  if (args.port && args.row.modifiers?.port) people *= args.row.modifiers.port;
  if (args.capital && args.row.modifiers?.capital) people *= args.row.modifiers.capital;
  if (args.hasQuarry && args.row.modifiers?.hasQuarry) people *= args.row.modifiers.hasQuarry;
  if (args.row.modifiers?.cultureWoodShare && args.housingRecipe) {
    const total = (args.laborPeople / 1000) * CONSTRUCTION_TOTAL_PER_THOUSAND;
    if (args.row.pool === "constructionCarpenter") people = total * args.housingRecipe.wood;
    if (args.row.pool === "constructionMason") {
      people = total * (args.housingRecipe.stone + args.housingRecipe.brick);
    }
  }
  if (args.row.modifiers?.capital && !args.capital && args.row.pool === "administration") people = 0;
  return people;
}

export function expectedWorkerPoints(args: {
  row: OccupationalCalibrationRow;
  laborPeople: number;
  populationRate: number;
  port: boolean;
  capital: boolean;
  hasQuarry: boolean;
  housingRecipe?: HousingRecipe;
}): number {
  return peopleToPoints(expectedWorkerPeople(args), args.populationRate);
}

/** Fixture identity: Generic inland 9000 labor-people at rate 1000. */
export function referenceFixtureExpectedPeople(pool: OccupationalPool): number {
  return expectedWorkerPeople({
    row: getOccupationalRow(pool),
    laborPeople: REFERENCE_FIXTURE_LABOR_PEOPLE,
    port: false,
    capital: false,
    hasQuarry: false
  });
}
