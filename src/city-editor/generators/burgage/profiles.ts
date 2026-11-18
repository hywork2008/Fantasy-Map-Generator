import type { BuildingAppearanceProfile } from "../../../buildings/appearance/types";
import type { BurgageProfileId, BurgageSetting } from "../../types/contracts/burgage";

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

/** The plot type of a housing culture (plan §5.1). */
export function burgageProfileFor(appearance: BuildingAppearanceProfile | undefined): BurgageProfileId {
  if (appearance === "northern-urban") return "hofstatt";
  if (appearance === "mediterranean") return "binaire";
  return "english-burgage";
}
