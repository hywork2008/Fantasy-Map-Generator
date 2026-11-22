import type { BuildingAppearanceProfile } from "../../../buildings/appearance/types";
import type { BurgageProfileId, BurgageSetting, PlotFabric } from "../../types/contracts/burgage";

type Range = readonly [number, number];

/**
 * Narrow-and-deep strip plots fronting a street (docs/plan/ce-burgage-plot-fabric.md §2.3). Values are the
 * plan's adopted values; where they leave the sources the plan says why.
 */
export interface StripPlotProfile {
  kind: "strip";
  id: Exclude<BurgageProfileId, "binaire">;
  /** Frontage of a divided plot; two of them make one original plot (R5). */
  frontageMeters: Range;
  /** Frontage of a plot never divided. */
  undividedFrontageMeters: Range;
  /** Share of original plots left undivided. */
  undividedShare: number;
  depthMeters: Record<BurgageSetting, Range>;
  /** A single row may back onto a back lane of this width. */
  backLaneMeters?: Range;
  /** Lanes through a long row to the back of its plots. */
  crossLane: { spacingMeters: Range; widthMeters: Range };
  sources: readonly string[];
}

/** Séraphin's parcellaire binaire: narrow blocks split by an axial venelle, no open land (plan §5.7). */
export interface BinairePlotProfile {
  kind: "binaire";
  id: "binaire";
  blockWidthMeters: Range;
  blockLengthMeters: Range;
  venelleMeters: number;
  crossLaneMeters: Range;
  head: { frontageMeters: Range; depthMeters: Range };
  house: { frontageMeters: Range; depthMeters: Range };
  sources: readonly string[];
}

export type BurgagePlotProfile = StripPlotProfile | BinairePlotProfile;

const CROSS_LANE = {
  spacingMeters: [60, 120],
  widthMeters: [1.5, 2.5]
} as const;

export const BURGAGE_PROFILES: {
  "english-burgage": StripPlotProfile;
  hofstatt: StripPlotProfile;
  binaire: BinairePlotProfile;
} = {
  "english-burgage": {
    kind: "strip",
    id: "english-burgage",
    frontageMeters: [5, 9],
    undividedFrontageMeters: [15, 18],
    undividedShare: 0.1,
    // The sources' 60-140 m (Stratford, Burford) would spread a town far too wide; intramural depths are a game
    // adjustment (plan §2.3, §6).
    depthMeters: { intramural: [30, 50], extramural: [50, 90] },
    backLaneMeters: [2, 3],
    crossLane: CROSS_LANE,
    sources: [
      "VCH Warwickshire vol. 3 (1945), p. 247: Stratford-upon-Avon 1196, 12 x 3.5 perches",
      "VCH Explore, Panel 2 (Burford): 1.5 perches x 22-28 perches; 3 perches x 14-19 perches; half-burgage c. 1250"
    ]
  },
  hofstatt: {
    kind: "strip",
    id: "hofstatt",
    frontageMeters: [7, 9],
    undividedFrontageMeters: [14, 18],
    undividedShare: 0.2,
    depthMeters: { intramural: [32, 40], extramural: [32, 40] },
    crossLane: CROSS_LANE,
    sources: [
      "Löbbecke, Schau-ins-Land 126, S. 8: 50 x 100 Fuß = 16.20 x 32.40 m",
      "ibid. S. 17: widths 14-18 m, depths 32-40 m; S. 18: a 17 m plot divided 1252-1255"
    ]
  },
  binaire: {
    kind: "binaire",
    id: "binaire",
    blockWidthMeters: [11.5, 17],
    blockLengthMeters: [50, 70],
    venelleMeters: 0.4,
    crossLaneMeters: [2, 3],
    head: { frontageMeters: [6, 7.5], depthMeters: [12, 20] },
    house: { frontageMeters: [4.5, 7.5], depthMeters: [6, 7.5] },
    sources: [
      "Séraphin, M.S.A.M.F. hors série 2008, p. 39: Figeac, blocks 11.5-12 x c. 50 m, venelle < 0.5 m, heads 6 x 12 m",
      "ibid. p. 44: Villefranche-de-Rouergue, blocks 14-17 m wide, lanes 2-3 m, heads 7.5 x 15-20 m, houses 4.5-7.5 x 7-7.5 m"
    ]
  }
};

/** The 18 ft perch of the planned villages of northern England (Sheppard 1974). */
export const VILLAGE_PERCH_METERS = 5.4864;

/**
 * Tofts of a roadside village (docs/plan/ce-meshless-roadside-burgage-village.md §2.4): wider than town burgages,
 * laid out in perches, split nearest the centre when the roads cannot take the village (§5.6).
 */
export interface VillageToftProfile {
  id: "village-toft";
  /** Frontages of an undivided toft, in perches. */
  toftPerches: readonly number[];
  /** No split leaves a plot narrower than this (`english-burgage` frontage). */
  minFrontageMeters: number;
  /** Tier-2 plots start at a split toft's frontage. */
  tier2FrontageMeters: Range;
  depthMeters: { tier1: Range; tier2: Range };
  /** Neighbouring rows on one side of an arm differ by at most this share in depth. */
  rowDepthStep: number;
  /** Between the plot fronts on either side of the road. */
  streetMeters: Range;
  backLaneMeters: Range;
  crossLane: { spacingMeters: Range; widthMeters: Range };
  /** Reach of an arm laid first, and the most it reaches (§5.6). */
  armMeters: { first: number; max: number };
  /** A candidate costs `weight` × its road distance from the centre + `base` (§5.6, game adjustments). The bases put
   * every plot of the first reach before any split or second-row plot, and a toft is split only once the roads
   * reach about 230 m (V7: tofts left whole keep their longhouses). */
  cost: Record<"first" | "beyond" | "split" | "secondSplit" | "tier2", { weight: number; base: number }>;
  /** A road straying further than this from its eased line breaks the blocks along it. */
  easeToleranceMeters: number;
  sources: readonly string[];
}

export const VILLAGE_TOFT_PROFILE: VillageToftProfile = {
  id: "village-toft",
  toftPerches: [3, 3.5, 4],
  minFrontageMeters: 5,
  tier2FrontageMeters: [8.2, 11],
  depthMeters: { tier1: [50, 90], tier2: [30, 50] },
  rowDepthStep: 0.1,
  streetMeters: [8, 15],
  backLaneMeters: [3, 4],
  crossLane: CROSS_LANE,
  armMeters: { first: 175, max: 750 },
  cost: {
    first: { weight: 1, base: 0 },
    beyond: { weight: 1.5, base: 0 },
    split: { weight: 2, base: 350 },
    secondSplit: { weight: 3, base: 700 },
    tier2: { weight: 2.5, base: 175 }
  },
  easeToleranceMeters: 8,
  sources: [
    "Historic England list entries 1017691, 1019521, 1017068, 1019026: tofts c. 15-50 m wide, mostly c. 20 m; a 4 m track behind the tofts (Uckerby)",
    "Sheppard, Agricultural History Review 22 (1974): the 18 ft perch in regular Yorkshire village plans",
    "Historic England list entry 1019026 (Wolfhampcote): main street 8-15 m",
    "Passini, Espacios urbanos a lo largo del Camino de Santiago: an initial burgo of 200-350 m along the road"
  ]
};

/**
 * Land a dwelling takes on these plots against the compact lots the meshless site size was fitted on (plan §6).
 * Measured 2026-11-18 on the walled synthetic inputs of 1,000–5,000 people (docs/plan/ce-burgage-plot-fabric.md §8.2),
 * and lowered in B5 (§8.5) once rear houses fill the yards before the town grows.
 */
export const BURGAGE_LAND_FACTOR: Record<BurgageProfileId, number> = {
  "english-burgage": 2,
  hofstatt: 2.5,
  binaire: 1
};

/** Land a facility's site takes on these plots: the whole plots under it, yards with them, and the plots beside it
 * that the half-a-row rule keeps for houses (plan §5.5). Measured in B5 (plan §8.5): lower values left facilities
 * without rows to take. */
export const BURGAGE_FACILITY_LAND_FACTOR: Record<BurgageProfileId, number> = {
  "english-burgage": 4.5,
  hofstatt: 4.5,
  binaire: 1
};

/** The same for dense burgage (plan §8.7): yards built over inside the wall, so a dwelling takes about as much land as
 * on compact lots. Measured on the walled synthetic inputs (plan §8.7). */
export const DENSE_BURGAGE_LAND_FACTOR: Record<BurgageProfileId, number> = {
  "english-burgage": 1.2,
  hofstatt: 1.2,
  binaire: 1
};
export const DENSE_BURGAGE_FACILITY_LAND_FACTOR: Record<BurgageProfileId, number> = {
  "english-burgage": 2,
  hofstatt: 2,
  binaire: 1
};

/** The land factor of generation settings for houses or facilities: 1 for compact lots. */
export function burgageLandFactor(
  settings: { plotFabric?: string; buildingAppearanceProfile?: unknown },
  use: "housing" | "facility" = "housing"
): number {
  if (settings.plotFabric !== "burgage" && settings.plotFabric !== "burgage-dense") return 1;
  const profile = burgageProfileFor(settings.buildingAppearanceProfile as BuildingAppearanceProfile);
  const dense = settings.plotFabric === "burgage-dense";
  return (
    use === "facility"
      ? dense
        ? DENSE_BURGAGE_FACILITY_LAND_FACTOR
        : BURGAGE_FACILITY_LAND_FACTOR
      : dense
        ? DENSE_BURGAGE_LAND_FACTOR
        : BURGAGE_LAND_FACTOR
  )[profile];
}

/** The plot type of a housing culture (plan §5.1). */
export function burgageProfileFor(appearance: BuildingAppearanceProfile | undefined): BurgageProfileId {
  if (appearance === "northern-urban") return "hofstatt";
  if (appearance === "mediterranean") return "binaire";
  return "english-burgage";
}

/** Burgage plots of either kind. */
export const isBurgageFabric = (fabric: PlotFabric | undefined): fabric is "burgage" | "burgage-dense" =>
  fabric === "burgage" || fabric === "burgage-dense";
