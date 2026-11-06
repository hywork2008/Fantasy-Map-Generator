/**
 * Sown-area shares by crop, from regional sources (docs/plan/crop-acreage-shares.md §3, §4.1.1).
 * A cell plants several crops at once in its region's proportions, nudged by how well each grows
 * there, instead of the single best-scoring crop it used to pick.
 */

import { pow } from "../../../simulation/deterministicMath";

/** Climate bands of crop-acreage-shares.md §4.1.1, close to the Köppen boundaries. */
export type CropClimateBand =
  | "polar"
  | "arid"
  | "tropical"
  | "mediterranean"
  | "humidSubtropical"
  | "boreal"
  | "continental"
  | "temperateWarm"
  | "temperateCool"
  | "wetMaritime";

/** Shares of the sown area, by crop good name. Each row sums to 100. */
type AcreageTable = Readonly<Record<string, number>>;

/**
 * England 1300, demesne and peasant land together (Broadberry et al., British Economic Growth,
 * 2015, p. 89): maslin counted with rye and dredge with barley; pulses split evenly between peas
 * and beans (§3.2, §3.6).
 */
const ENGLAND_1300: AcreageTable = {
  Wheat: 32.8,
  Rye: 7.4,
  Barley: 15.6,
  Oats: 38.7,
  Peas: 2.75,
  "Broad Beans": 2.75
};

/** Grand Duchy of Lithuania manors, 1500-1800 (Scientific Reports 15, 2025; §3.4). */
const LITHUANIA: AcreageTable = { Rye: 50, Oats: 31, Barley: 7, Buckwheat: 6, Wheat: 4, Peas: 2 };

/** Polish royal demesnes, 1564-1665 (Kozłowska-Szyc, Studia Geohistorica 7, 2019; §3.4). */
const POLAND: AcreageTable = { Rye: 50, Oats: 30, Barley: 8, Wheat: 6, Buckwheat: 3, Peas: 3 };

/** Northern France on loess and loam: provisional, from the Cambrésis tithe ratio (§3.3). */
const NORTHERN_FRANCE: AcreageTable = {
  Wheat: 30,
  Rye: 5,
  Oats: 35,
  Barley: 15,
  Peas: 7.5,
  "Broad Beans": 7.5
};

/** Mediterranean: provisional, from Tyre and early medieval Italian finds (§3.5). */
const MEDITERRANEAN: AcreageTable = {
  Wheat: 55,
  Barley: 25,
  Millet: 5,
  Oats: 3,
  "Broad Beans": 6,
  Lentils: 3,
  Chickpeas: 3
};

/**
 * Wet maritime uplands: provisional (§3.8). Adderley, Shropshire, 1318-24, gave oats 49%, wheat 40%,
 * barley 6% of the food crops (VCH Shropshire IV); Scotland grew more oats and bere than wheat.
 */
const WET_MARITIME: AcreageTable = { Oats: 50, Barley: 20, Wheat: 20, Rye: 3, Peas: 3.5, "Broad Beans": 3.5 };

const TABLE_BY_BAND: Partial<Record<CropClimateBand, AcreageTable>> = {
  wetMaritime: WET_MARITIME,
  temperateCool: ENGLAND_1300,
  temperateWarm: NORTHERN_FRANCE,
  boreal: LITHUANIA,
  continental: POLAND,
  mediterranean: MEDITERRANEAN
};

/** Grains the Beer recipe takes; a region without sources plants one of them first (§4.2). */
export const BREWING_GRAINS: ReadonlySet<string> = new Set(["Barley", "Wheat", "Rye", "Oats"]);

/** Without sources, staples share the land among this many main crops and legumes (§4.2). */
const FALLBACK_MAIN_CROPS = 3;
const FALLBACK_LEGUMES = 2;
export const FALLBACK_MAIN_CROP_SHARE = 2 / 3;
/** Annual rainfall (100 mm units) from which the cool bands take the wet maritime table. */
const WET_MARITIME_PREC = 12;
/**
 * A regional table is what farmers chose in that region's climate; where a crop grows worse, they
 * planted less of it. Shares are moved by suitability to this power (crop-acreage-shares.md §4.8).
 */
const SUITABILITY_EXPONENT = 2;

/**
 * `prec` is annual rainfall in 100 mm units (src/data/stapleCrops.ts); temperatures are the
 * coldest and warmest monthly means in °C.
 */
export function getCropClimateBand(coldestC: number, warmestC: number, prec: number): CropClimateBand {
  if (warmestC < 10) return "polar";
  if (prec < 3) return "arid";
  if (coldestC >= 18) return "tropical";
  if (coldestC >= 5) return prec < 9 ? "mediterranean" : "humidSubtropical";
  // Above 1,200 mm a year the cool west grew mostly oats and bere, whatever its winters (§3.8).
  if (prec >= WET_MARITIME_PREC && warmestC < 22) return "wetMaritime";
  if (coldestC < -3) return warmestC < 16 ? "boreal" : "continental";
  return warmestC >= 22 ? "temperateWarm" : "temperateCool";
}

export interface AcreageCandidate {
  readonly name: string;
  readonly legume: boolean;
  /** 0..1 crop suitability in this cell. */
  readonly suitability: number;
  /** Suitability × culture preference × local noise: ranks crops where no source applies. */
  readonly score: number;
}

/**
 * Sown shares for the cell's viable crops, summing to 1, keyed by crop name. Crops the regional
 * table lists but the cell cannot grow are dropped and the rest scaled back to 1; suitability
 * moves each share by its square (§4.8). Bands without sources, or cells growing none of
 * their table's crops, fall back to §4.2.
 */
export function getRegionalCropShares(
  band: CropClimateBand,
  candidates: readonly AcreageCandidate[]
): Map<string, number> {
  const viable = candidates.filter(candidate => candidate.suitability > 0);
  const table = TABLE_BY_BAND[band];
  if (table) {
    const weights = new Map<string, number>();
    for (const candidate of viable) {
      const share = table[candidate.name];
      if (share) weights.set(candidate.name, share * pow(candidate.suitability, SUITABILITY_EXPONENT));
    }
    if (weights.size) return normalized(weights);
  }
  return getFallbackShares(viable);
}

/**
 * §4.2: the best brewing grain first, then the best-scoring staples, each in proportion to its
 * score. Legumes take a third of the land when one grows here.
 */
function getFallbackShares(viable: readonly AcreageCandidate[]): Map<string, number> {
  const byScore = (a: AcreageCandidate, b: AcreageCandidate) => b.score - a.score;
  const mains = viable.filter(candidate => !candidate.legume).toSorted(byScore);
  const legumes = viable
    .filter(candidate => candidate.legume)
    .toSorted(byScore)
    .slice(0, FALLBACK_LEGUMES);
  const brewing = mains.find(candidate => BREWING_GRAINS.has(candidate.name));
  const chosen = brewing ? [brewing, ...mains.filter(c => c !== brewing)] : mains;
  const main = chosen.slice(0, FALLBACK_MAIN_CROPS);

  const shares = new Map<string, number>();
  const mainShare = legumes.length ? (main.length ? FALLBACK_MAIN_CROP_SHARE : 0) : 1;
  addProportional(shares, main, mainShare);
  addProportional(shares, legumes, 1 - mainShare);
  return shares;
}

function addProportional(shares: Map<string, number>, crops: readonly AcreageCandidate[], total: number): void {
  const sum = crops.reduce((acc, crop) => acc + crop.score, 0);
  if (!(sum > 0) || !(total > 0)) return;
  for (const crop of crops) shares.set(crop.name, (total * crop.score) / sum);
}

function normalized(weights: Map<string, number>): Map<string, number> {
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  return new Map([...weights].map(([name, weight]) => [name, weight / total]));
}
