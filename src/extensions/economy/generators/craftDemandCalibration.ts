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
  /** null for work outside the town guilds (the forest's tar kilns). */
  domain: CraftKnowledgeDomain | null;
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

/**
 * Sets of harness in a lot of Harnesses: the calibrated workshop takes 54 person-months a lot
 * (craftDemandCalibration.ts), about two weeks a set, and a lot is worth 10, a tenth of a set's
 * worth for each set. A rider needs one set, a convoy horse one (port-freight-queue-and-warehouses.md
 * §10.18). The State's mounted demand used to count a lot per thousand riders.
 */
export const HARNESS_SETS_PER_LOT = 100;

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
    inlandShare: 0.41,
    portShare: 0.32,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 0.00025,
    fixtureLotsPerMonth: 0.1875,
    laborPointsPerLotAtDefaultRate: 0.972,
    residualWeight: 1,
    sources: ["four-year wardrobe replacement ceiling shared with Linen Garments; never additive"]
  },
  {
    goodName: "Cloth",
    domain: "textiles",
    inlandShare: 0.1,
    portShare: 0.06,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 0.1875,
    laborPointsPerLotAtDefaultRate: 0.259,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: ["Garments+Sails recipe input"]
  },
  {
    goodName: "Wool Garments",
    domain: "textiles",
    inlandShare: 0.15,
    portShare: 0.12,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 0.00025,
    fixtureLotsPerMonth: 0.1875,
    laborPointsPerLotAtDefaultRate: 0.972,
    residualWeight: 1,
    sources: ["model: ordinary wool shares the four-year wardrobe replacement ceiling with Garments and Linen Garments"]
  },
  {
    goodName: "Wool Blankets",
    domain: "textiles",
    inlandShare: 0.02,
    portShare: 0.02,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 2 / 5 / 8 / 100,
    fixtureLotsPerMonth: 0.375,
    laborPointsPerLotAtDefaultRate: 0.0151875,
    residualWeight: 0,
    sources: [
      "model: 100 blankets of 2.5 kg; two per five-person household, eight-year replacement; separate bedding orders"
    ]
  },
  {
    goodName: "Wool Cloth",
    domain: "textiles",
    inlandShare: 0.04,
    portShare: 0.04,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 0.1875,
    laborPointsPerLotAtDefaultRate: 0.259,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: ["model: same weaving labor as Cloth; Wool Garments recipe input"]
  },
  {
    goodName: "Linen",
    domain: "textiles",
    inlandShare: 0.04,
    portShare: 0.04,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 2.25,
    laborPointsPerLotAtDefaultRate: 0.01295,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: ["model: Cloth weaving labor / 20 for a 200 kg bale; shared ceiling of 0.1875 wardrobes x 12 bales"]
  },
  {
    goodName: "Linen Garments",
    domain: "textiles",
    inlandShare: 0.15,
    portShare: 0.12,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 0.00025,
    fixtureLotsPerMonth: 0.1875,
    laborPointsPerLotAtDefaultRate: 0.972,
    residualWeight: 1,
    sources: ["four-year wardrobe replacement ceiling shared with Garments; never additive"]
  },
  {
    goodName: "Fine Wool Cloth",
    domain: "textiles",
    inlandShare: 0.02,
    portShare: 0.01,
    provenances: ["recipeDerived"],
    fixtureLotsPerMonth: 0.1,
    laborPointsPerLotAtDefaultRate: 0.019425,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: [
      "model: Cloth labor / 20 bales, with 50% extra finishing work; 0.1 bale/month per 9000 people is a provisional production ceiling"
    ]
  },
  {
    goodName: "Fine Wool Garments",
    domain: "textiles",
    inlandShare: 0.02,
    portShare: 0.02,
    provenances: ["categoryResidual"],
    fixtureLotsPerMonth: 0.1,
    laborPointsPerLotAtDefaultRate: 0.0729,
    residualWeight: 1,
    residualCategory: "luxury",
    sources: [
      "model: Garments labor / 20 wardrobe groups, with 50% extra tailoring work; 0.1 lot/month per 9000 people ceiling"
    ]
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
    fixtureLotsPerMonth: 0.2 / 120,
    laborPointsPerLotAtDefaultRate: 0.0169 * 120,
    residualWeight: 0,
    typicalRecipeIndex: 0,
    sources: ["Books × 0.5 L, in 120 L barrels"]
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
  },
  {
    goodName: "Preserved food",
    domain: "victualling",
    inlandShare: 0.6,
    portShare: 0.7,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 10 / 900,
    fixtureLotsPerMonth: 8.333,
    laborPointsPerLotAtDefaultRate: 0.0005,
    residualWeight: 1,
    sources: [
      "provisional: 10 kg of salted meat and fish a person a year in 0.9 t wains (urban-craft-staffing.md §10.2)",
      "0.5 person-month a wain: dressing, salting, packing at ~60 kg a day (guild-halls-and-urban-trades.md D1)"
    ]
  },
  {
    goodName: "Candles",
    domain: "victualling",
    inlandShare: 0.2,
    portShare: 0.15,
    provenances: ["householdPerCapita"],
    annualLotsPerPerson: 1 / 100,
    fixtureLotsPerMonth: 7.5,
    laborPointsPerLotAtDefaultRate: 0.00015,
    residualWeight: 1,
    sources: [
      "provisional: 1 kg of tallow and wax candles a person a year in 100 kg blocks",
      "0.15 person-month a block: dipping at ~25 kg a day (guild-halls-and-urban-trades.md D1)"
    ]
  },
  {
    goodName: "Charcoal",
    domain: null,
    inlandShare: 0,
    portShare: 0,
    provenances: ["recipeDerived", "militaryLedger"],
    annualLotsPerPerson: 0.0232,
    fixtureLotsPerMonth: 17.4,
    laborPointsPerLotAtDefaultRate: 0.00002,
    residualWeight: 1,
    sources: [
      "the towns' own forging: Tools 0.02 + Bronze 0.0027 + Arms 0.0005 lots a person a year, one 50 kg sack each; forge orders add at runtime",
      "0.6 person-day a sack: an earth kiln of ~1 t takes two colliers about a week (urban-craft-staffing.md §10.3). It was 21.5 person-months, and at that a winning step made a town's colliers 1,000 strong"
    ]
  },
  {
    goodName: "Tar",
    domain: null,
    inlandShare: 0,
    portShare: 0,
    provenances: ["householdPerCapita", "strategicOrder"],
    annualLotsPerPerson: 0.5 / 144,
    fixtureLotsPerMonth: 2.604,
    laborPointsPerLotAtDefaultRate: 0.0001,
    residualWeight: 1,
    sources: [
      "provisional: 0.5 kg a person a year for boats, carts, roofs and cordage, in 144 kg barrels; shipbuilding orders add at runtime",
      "0.1 person-month a barrel: tending the kiln and casking, the wood being the forester's"
    ]
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

/**
 * Labour for recipe Goods that have no demand row, at the default population rate. Their demand
 * comes from recipes and forge orders, which a household lot target must not cap, so they keep
 * uncapped batching; without an entry here such a Good costs a whole labour point (1,000
 * person-months) a lot, and its wages alone exceed its price.
 *
 * Entries are person-months a lot ÷ 1,000 for the pre-industrial recipe Goods of a
 * 1300 map (docs/plan/urban-craft-staffing.md §6.3, guild-halls-and-urban-trades.md D1), from the
 * lot sizes in goodMeasureCatalog.ts. Raw material work (felling, herding, fishing, the vineyard)
 * stays in the ingredient.
 */
export const UNCALIBRATED_LABOR_POINTS_PER_LOT: Readonly<Record<string, number>> = {
  // Baking. 20 loaves of the ~250 a baker draws from the oven in a day.
  Bread: 0.000003,
  // Victualling. 25 kg of split cod hung to dry on racks.
  Stockfish: 0.00001,
  // 0.6 t of cheese turned in the smokehouse.
  "Smoked Cheese": 0.0001,
  // 250 kg: cutting and turning fruit on the drying floor at ~20 kg a day; grapes dry whole.
  "Dried Fruits": 0.0004,
  Raisins: 0.00015,
  // 120 L of wine or honey water kept acetifying.
  Vinegar: 0.00005,
  // 120 L boiled down from lye and fat, then cast.
  Soap: 0.0002,
  // A 1,000 kg cheese from 10,000 L of milk: a dairy hand works ~170 L, ~17 kg of cheese, a day.
  Cheese: 0.002,
  // 30 kg of eggs gathered from the town's hens.
  Egg: 0.00001,
  // Brewing. 1,000 L from malting to casking, about five person-days; cider and perry need no malt.
  Beer: 0.0002,
  Cider: 0.00015,
  Perry: 0.00015,
  // Pressing and cellaring; the vine is the vineyard's.
  Wine: 0.00005,
  "Pomace Wine": 0.00003,
  // 120 L of oil pressed from olives or rendered from blubber.
  Oil: 0.0001,
  // Forest works: burning and sacking ash; the wood is the forester's.
  Ash: 0.00002,
  // 120 L leached from ash and boiled down.
  Potash: 0.0001,
  // A 1.2 t barrel of nitre scraped from the beds and refined.
  Saltpeter: 0.003,
  // Building materials. A 1.6 t wain of brick moulded, dried and fired; lime slaked and sacked.
  Brick: 0.0003,
  "Slaked Lime": 0.00002,
  // A 7.5 m³ beam hewn or pit-sawn by a pair of sawyers.
  Timber: 0.0005,
  // Woodwork: a wheel in about three days; a lute or harp set in a month.
  "Spinning Wheel": 0.0001,
  Instruments: 0.001,
  // A tusk cut from the carcass.
  Ivory: 0.00005,
  // Luxury pieces, by the work of one master and a journeyman.
  Jewelry: 0.0005,
  Artworks: 0.001,
  Sculptures: 0.003,
  Tapestries: 0.01,
  Relics: 0.002,
  Perfume: 0.0002
};

export function laborPointsForLots(goodName: string, lots: number, populationRate: number): number {
  const row = getGoodDemandCalibration(goodName);
  const perLot = row?.laborPointsPerLotAtDefaultRate ?? UNCALIBRATED_LABOR_POINTS_PER_LOT[goodName];
  if (perLot == null) return lots;
  const rate = Math.max(1, populationRate);
  return Math.max(0, lots) * perLot * (DEFAULT_PEOPLE_PER_POPULATION_POINT / rate);
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

/** Months of a market's per-head floor its stock may hold before its towns stop making more. */
export const CALIBRATED_RESERVE_MONTHS = 3;

/**
 * Share of a per-head floor a town still makes, given the market's stock of the good and the
 * floor summed over the market's towns. The floor alone is blind to what is unsold: a market kept
 * making 600 wains of Preserved food a month into a stock of 20,000 (urban-craft-staffing.md
 * §10.2). Full up to two months of stock, falling to none at three.
 */
export function calibratedReserveFactor(marketStock: number, marketMonthlyLots: number): number {
  if (!(marketMonthlyLots > 0)) return 1;
  const months = Math.max(0, marketStock) / marketMonthlyLots;
  return Math.max(0, Math.min(1, CALIBRATED_RESERVE_MONTHS - months));
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
