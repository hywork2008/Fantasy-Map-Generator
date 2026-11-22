import type { Point } from "../geometry";

/**
 * How a street block is cut into plots (docs/plan/ce-burgage-plot-fabric.md §4). `compact` is the existing
 * house-sized block layout: a dense town of houses. `burgage` lays historical narrow-and-deep plots with yards behind
 * their houses: a village or a small town. `burgage-dense` lays the same plots, halved, and builds their yards over
 * inside the wall as far as the population needs, back to back with the next row: a walled town (plan §8.7).
 * `compact-medium` is the compact layout with larger lane-bounded blocks, about halfway between compact and dense
 * burgage (`compactBlockScale`). `burgage-village` lays an unwalled village of tofts along its roads, with no round
 * site (docs/plan/ce-meshless-roadside-burgage-village.md).
 */
export type PlotFabric = "compact" | "compact-medium" | "burgage" | "burgage-dense" | "burgage-village";

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

/** A road out of a village centre, from the centre outward (docs/plan/ce-meshless-roadside-burgage-village.md §5.1).
 * A road through the centre is two arms. */
export interface RoadsideArm {
  id: string;
  points: Point[];
}

/** A street block of a roadside village (plan §5.3, §5.5): a rectangle on one side of an arm, fronting the road
 * (tier 1) or the back lane behind the first row (tier 2). */
export interface RoadsideBlock {
  id: string;
  armId: string;
  side: "left" | "right";
  tier: 1 | 2;
  ring: Point[];
  /** The block's edge on the road or back lane it fronts. */
  front: [Point, Point];
  depthMeters: number;
  plots: BurgagePlot[];
}

export interface RoadsideLane extends BurgageLane {
  id: string;
  armId: string;
  side: "left" | "right";
}

export interface RoadsideVillagePlan {
  blocks: RoadsideBlock[];
  /** `back`: behind a tier-1 block and its cross lane, meeting the next one end to end. `cross`: from the road to the
   * back lane, before every tier-1 block. Both are keyed by the block id. */
  lanes: RoadsideLane[];
  plots: number;
  /** Dwellings the plots hold by the plan's estimate, against the need. */
  dwellings: number;
  /** Dwellings the roads could not take within their reach (plan §5.6). */
  shortfall: number;
  reasons: "village-capacity"[];
}
