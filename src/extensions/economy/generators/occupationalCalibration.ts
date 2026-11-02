/**
 * Historical occupational targets per urban labor-people (docs/plan/craft-demand-calibration.md §2,
 * docs/plan/urban-craft-staffing.md §5.2).
 * Authored tables only — does not write world state.
 */

import { type HistoricalPeriod, historicalPeriodIndex } from "../../../types/historicalPeriod";
import { peopleToPoints, REFERENCE_FIXTURE_LABOR_PEOPLE } from "./craftScale";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import type { HousingRecipe } from "./housingRecipes";

export const CONSTRUCTION_TOTAL_PER_THOUSAND = 22;

/**
 * One craft inside a guild domain (docs/plan/urban-craft-staffing.md §5.2). The urban table is
 * authored per craft; a domain's expected workforce is the sum of its crafts.
 */
export type CraftTrade =
  | "tailoring"
  | "weaving"
  | "shoemaking"
  | "tanning"
  | "furriery"
  | "leatherGoods"
  | "saddlery"
  | "smithing"
  | "cutlery"
  | "metalwares"
  | "goldsmithing"
  | "cooperage"
  | "joinery"
  | "bowyery"
  | "ropemaking"
  | "limeAndTile"
  | "pottery"
  | "glazing"
  | "bookTrades"
  | "printing"
  | "instrumentMaking"
  | "butchery"
  | "fishmongery"
  | "chandlery"
  | "brewing"
  | "baking"
  | "milling";

export type OccupationalPool =
  | CraftTrade
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
    /** Per-thousand in a market that grows grapes: wine replaces ale (§5.2 brewing). */
    wineRegionPerThousand?: number;
  };
  /** The craft is absent before this period (printing before the age of exploration). */
  fromPeriod?: HistoricalPeriod;
  /** The craft is absent until its state has adopted this technology. */
  requiredTechnology?: string;
  goodNames: readonly string[];
  guildDomain: CraftKnowledgeDomain | null;
  sources: readonly string[];
}

/**
 * Sources (docs/plan/urban-craft-staffing.md §4.1): E1 Clark 2010 table 6 (urban poll tax
 * 1379-81, share of employed × 0.45 employed share), E2 Swanson 1980 tables 1:1 and 3:3 (York
 * freemen 1301-50), F1 Sussman table 16 (Paris 1297, ratio to shoemakers), F2/F3 Laumonier
 * (Montpellier, Toulouse butchers). "provisional" rows await a primary source (§12).
 */
export const OCCUPATIONAL_CALIBRATION: readonly OccupationalCalibrationRow[] = [
  {
    pool: "tailoring",
    peoplePerThousandUrban: { min: 20, max: 40, inlandTypicalPerThousand: 30 },
    goodNames: ["Garments", "Wool Garments", "Linen Garments", "Fine Wool Garments"],
    guildDomain: "textiles",
    sources: ["E1 tailors, hatters, hosiers 6.6% of urban employed"]
  },
  {
    pool: "weaving",
    peoplePerThousandUrban: { min: 5, max: 38, inlandTypicalPerThousand: 10 },
    goodNames: ["Cloth", "Wool Cloth", "Fine Wool Cloth", "Linen", "Wool Blankets", "Sails"],
    guildDomain: "textiles",
    sources: ["F1 weavers 0.67 × shoemakers; E1 cloth manufacture 8.5% (38/1000) is a cloth-exporting town"]
  },
  {
    pool: "shoemaking",
    peoplePerThousandUrban: { min: 10, max: 20, inlandTypicalPerThousand: 15 },
    goodNames: ["Boots"],
    guildDomain: "leather",
    sources: ["E1 shoemakers 3.3%; F1 3.7% of known taxpayers; F2 4%"]
  },
  {
    pool: "tanning",
    peoplePerThousandUrban: { min: 6, max: 15, inlandTypicalPerThousand: 11 },
    goodNames: ["Leather"],
    guildDomain: "leather",
    sources: ["E2 tanners+curriers+tawers 25.1% vs cordwainers 34.8% of leather freemen, × 15 shoemakers"]
  },
  {
    pool: "furriery",
    peoplePerThousandUrban: { min: 3, max: 10, inlandTypicalPerThousand: 7 },
    goodNames: [],
    guildDomain: "leather",
    sources: ["E1 skinners 1.6%"]
  },
  {
    pool: "leatherGoods",
    peoplePerThousandUrban: { min: 3, max: 10, inlandTypicalPerThousand: 7 },
    goodNames: [],
    guildDomain: "leather",
    sources: ["E2 girdlers+glovers+pouchmakers 16.6% vs cordwainers 34.8%; F1 belt makers 0.36 × shoemakers"]
  },
  {
    pool: "saddlery",
    peoplePerThousandUrban: { min: 1, max: 5, inlandTypicalPerThousand: 3 },
    goodNames: [],
    guildDomain: "leather",
    sources: ["E2 saddlers 6.5% vs cordwainers 34.8%"]
  },
  {
    pool: "smithing",
    peoplePerThousandUrban: { min: 2, max: 5, inlandTypicalPerThousand: 3 },
    goodNames: ["Tools", "Arms", "Harnesses"],
    guildDomain: "metallurgy",
    sources: ["E1 smiths 0.6%; smelter site labor is added separately and is not this row"]
  },
  {
    pool: "cutlery",
    peoplePerThousandUrban: { min: 0.5, max: 3, inlandTypicalPerThousand: 1.5 },
    goodNames: [],
    guildDomain: "metallurgy",
    sources: ["E1 cutlers 0.3%"]
  },
  {
    pool: "metalwares",
    peoplePerThousandUrban: { min: 2, max: 20, inlandTypicalPerThousand: 4 },
    goodNames: ["Bronze", "Bullets"],
    guildDomain: "metallurgy",
    sources: ["provisional: pewter, brass, nails, locks, pins; E2 metal 0.5 × leather includes export work"]
  },
  {
    pool: "goldsmithing",
    peoplePerThousandUrban: { min: 0.3, max: 3, inlandTypicalPerThousand: 1 },
    goodNames: [],
    guildDomain: "metallurgy",
    sources: ["F1 goldsmiths 0.79 × shoemakers is the capital's; E1 0.12% of national employed"]
  },
  {
    pool: "cooperage",
    peoplePerThousandUrban: { min: 2, max: 8, inlandTypicalPerThousand: 5 },
    goodNames: ["Barrels"],
    guildDomain: "woodworking",
    sources: ["F1 barrel makers 0.32 × shoemakers"]
  },
  {
    pool: "joinery",
    peoplePerThousandUrban: { min: 1, max: 6, inlandTypicalPerThousand: 3 },
    goodNames: [],
    guildDomain: "woodworking",
    sources: ["provisional: joiners and turners (furniture, wooden ware)"]
  },
  {
    pool: "bowyery",
    peoplePerThousandUrban: { min: 0.5, max: 2, inlandTypicalPerThousand: 1 },
    goodNames: ["Arrows"],
    guildDomain: "woodworking",
    sources: ["craft-demand-calibration.md fletcher band (peacetime 0.8 quiver/month at 9000 people)"]
  },
  {
    pool: "ropemaking",
    peoplePerThousandUrban: { min: 0.5, max: 2, inlandTypicalPerThousand: 1 },
    modifiers: { port: 2 },
    goodNames: ["Ropes"],
    guildDomain: "woodworking",
    sources: ["craft-demand-calibration.md roper band; ports double for rigging"]
  },
  {
    pool: "limeAndTile",
    peoplePerThousandUrban: { min: 1, max: 3, inlandTypicalPerThousand: 2 },
    goodNames: ["Lime", "Roman Concrete"],
    guildDomain: "masonry",
    sources: ["lime, brick and tile manufacture only; house masons stay on constructionMason"]
  },
  {
    pool: "pottery",
    peoplePerThousandUrban: { min: 1, max: 4, inlandTypicalPerThousand: 2 },
    goodNames: ["Ceramics"],
    guildDomain: "glassware",
    sources: ["provisional: town potters and tilers; most pottery came from village kilns"]
  },
  {
    pool: "glazing",
    peoplePerThousandUrban: { min: 0, max: 1, inlandTypicalPerThousand: 0.3 },
    goodNames: ["Glass", "Lab Glassware"],
    guildDomain: "glassware",
    sources: ["provisional: glaziers; glass itself came from forest glasshouses"]
  },
  {
    pool: "bookTrades",
    peoplePerThousandUrban: { min: 0.2, max: 1.5, inlandTypicalPerThousand: 0.5 },
    goodNames: ["Paper", "Ink", "Books"],
    guildDomain: "printing",
    sources: ["provisional: scriveners, parchmenters, bookbinders; E2 parchment+bookbinders ~1.3% of leather freemen"]
  },
  {
    pool: "printing",
    peoplePerThousandUrban: { min: 1, max: 4, inlandTypicalPerThousand: 2 },
    fromPeriod: "ageOfExploration",
    goodNames: [],
    guildDomain: "printing",
    sources: ["press work after the 1450s; with bookTrades it keeps the former 2.5 stationery band"]
  },
  {
    pool: "instrumentMaking",
    peoplePerThousandUrban: { min: 0.5, max: 2, inlandTypicalPerThousand: 1 },
    requiredTechnology: "precisionInstrumentMaking",
    goodNames: ["Liquor"],
    guildDomain: "instruments",
    sources: ["provisional — Liquor mapped until a clockmaker good exists; none before the technology"]
  },
  {
    pool: "butchery",
    peoplePerThousandUrban: { min: 3, max: 10, inlandTypicalPerThousand: 6 },
    goodNames: ["Preserved food"],
    guildDomain: "victualling",
    sources: ["F2 Montpellier 1/300, F3 Toulouse 1/225, E1 butchers 2.1% (9.5/1000, a meat-eating England)"]
  },
  {
    pool: "fishmongery",
    peoplePerThousandUrban: { min: 1, max: 6, inlandTypicalPerThousand: 2 },
    modifiers: { port: 2 },
    goodNames: [],
    guildDomain: "victualling",
    sources: ["provisional: fishmongers and salters; Swanson table 4:3 to check"]
  },
  {
    pool: "chandlery",
    peoplePerThousandUrban: { min: 1, max: 4, inlandTypicalPerThousand: 2 },
    goodNames: ["Candles"],
    guildDomain: "victualling",
    sources: ["F1 candle makers 0.27 × shoemakers (4/1000), local share with soap boilers"]
  },
  {
    pool: "brewing",
    peoplePerThousandUrban: { min: 2, max: 15, inlandTypicalPerThousand: 12 },
    modifiers: { wineRegionPerThousand: 2 },
    goodNames: [],
    guildDomain: "brewing",
    sources: ["E1 brewers and maltsters 2.7%; wine regions drink wine from taverns instead (F1 taverniers)"]
  },
  {
    pool: "baking",
    peoplePerThousandUrban: { min: 6, max: 15, inlandTypicalPerThousand: 12 },
    goodNames: [],
    guildDomain: "baking",
    sources: ["E1 bakers 2.7%; F1 bakers 0.54 × shoemakers (8/1000)"]
  },
  {
    pool: "milling",
    peoplePerThousandUrban: { min: 0.5, max: 3, inlandTypicalPerThousand: 1.8 },
    goodNames: [],
    guildDomain: "baking",
    sources: ["E1 millers 0.4%; most mills stood in the villages"]
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

/** The crafts of one guild domain. */
export function getDomainOccupationalRows(domain: CraftKnowledgeDomain): readonly OccupationalCalibrationRow[] {
  return OCCUPATIONAL_CALIBRATION.filter(row => row.guildDomain === domain);
}

export interface ExpectedWorkerArgs {
  laborPeople: number;
  port: boolean;
  capital: boolean;
  hasQuarry: boolean;
  housingRecipe?: HousingRecipe;
  /** Legacy maps without a period read as high medieval. */
  period?: HistoricalPeriod;
  /** Whether the burg's state has adopted a technology. Without it, technology-gated crafts are absent. */
  technologyAdopted?: (technologyId: string) => boolean;
  /** The burg's market grows grapes. */
  wineRegion?: boolean;
  /** Employed share of the world over the authored default (`getCraftEmploymentScale`); guild crafts only. */
  employmentScale?: number;
}

function isRowAvailable(row: OccupationalCalibrationRow, args: ExpectedWorkerArgs): boolean {
  if (row.fromPeriod && historicalPeriodIndex(args.period ?? "highMedieval") < historicalPeriodIndex(row.fromPeriod))
    return false;
  if (row.requiredTechnology && !args.technologyAdopted?.(row.requiredTechnology)) return false;
  return true;
}

export function expectedWorkerPeople(args: ExpectedWorkerArgs & { row: OccupationalCalibrationRow }): number {
  if (!isRowAvailable(args.row, args)) return 0;
  let perK = args.row.peoplePerThousandUrban.inlandTypicalPerThousand;
  if (args.wineRegion && args.row.modifiers?.wineRegionPerThousand != null)
    perK = args.row.modifiers.wineRegionPerThousand;
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
  if (args.row.guildDomain) people *= args.employmentScale ?? 1;
  return people;
}

export function expectedWorkerPoints(
  args: ExpectedWorkerArgs & { row: OccupationalCalibrationRow; populationRate: number }
): number {
  return peopleToPoints(expectedWorkerPeople(args), args.populationRate);
}

/** A guild domain's expected workforce: the sum of its crafts. */
export function expectedDomainWorkerPeople(args: ExpectedWorkerArgs & { domain: CraftKnowledgeDomain }): number {
  return getDomainOccupationalRows(args.domain).reduce((sum, row) => sum + expectedWorkerPeople({ ...args, row }), 0);
}

export function expectedDomainWorkerPoints(
  args: ExpectedWorkerArgs & { domain: CraftKnowledgeDomain; populationRate: number }
): number {
  return peopleToPoints(expectedDomainWorkerPeople(args), args.populationRate);
}

const REFERENCE_FIXTURE: ExpectedWorkerArgs = {
  laborPeople: REFERENCE_FIXTURE_LABOR_PEOPLE,
  port: false,
  capital: false,
  hasQuarry: false
};

/** Fixture identity: Generic inland 9000 labor-people at rate 1000. */
export function referenceFixtureExpectedPeople(pool: OccupationalPool): number {
  return expectedWorkerPeople({ ...REFERENCE_FIXTURE, row: getOccupationalRow(pool) });
}

export function referenceFixtureDomainPeople(domain: CraftKnowledgeDomain): number {
  return expectedDomainWorkerPeople({ ...REFERENCE_FIXTURE, domain });
}
