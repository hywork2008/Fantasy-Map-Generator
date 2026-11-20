import type { Point } from "../geometry";

/**
 * How a street block is cut into plots (docs/plan/ce-burgage-plot-fabric.md §4). `compact` is the existing
 * house-sized block layout: a dense town of houses. `burgage` lays historical narrow-and-deep plots with yards behind
 * their houses: a village or a small town. `burgage-dense` lays the same plots, halved, and builds their yards over
 * inside the wall as far as the population needs, back to back with the next row: a walled town (plan §8.7).
 */
export type PlotFabric = "compact" | "burgage" | "burgage-dense";

/** Plot types of the burgage plot fabric (plan §2.3). */
export type BurgageProfileId = "english-burgage" | "hofstatt" | "binaire";

/** Where a block lies: inside the walls plots are shallower (plan §2.3, a game adjustment). */
export type BurgageSetting = "intramural" | "extramural";

export interface BurgagePlot {
  /** Stable within its cell plan: the same ring, profile and seed give the same ids. */
  id: string;
  ring: Point[];
  /** The plot's edge on the street or lane it faces. */
  front: [Point, Point];
  frontageMeters: number;
  depthMeters: number;
  /** `plot`: a strip plot. `head`: a binaire house at a block end on the main street. `row`: a binaire house on
   * a cross lane. */
  kind: "plot" | "head" | "row";
  /** The original plot this one was cut from: two halves of a divided plot share it (plan R5). */
  parent: string;
  /** A plot never divided (plan §5.2). */
  undivided: boolean;
}

export interface BurgageLane {
  /** Centre line. */
  points: Point[];
  widthMeters: number;
  /** `back`: back lane behind a single row. `cross`: lane between plots or blocks to the back. `transverse`: a
   * binaire lane across an over-long block. `venelle`: the binaire block's axial drain, not walked. */
  kind: "back" | "cross" | "transverse" | "venelle";
}

export interface BurgageCellPlan {
  profile: BurgageProfileId;
  plots: BurgagePlot[];
  lanes: BurgageLane[];
  /** Land of the block left as garden or open ground: backland, slivers and corners no plot fits. */
  open: Point[][];
}
