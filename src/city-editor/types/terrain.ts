import type { Id, Point } from "./primitives";

export interface TerrainPatch {
  faceId: string;
  points: [Point, Point, Point];
  heights: [number, number, number];
}

export interface CityTerrain {
  /** Absolute elevation represented by local Y=0. Uniform legacy land stays flat. */
  datumMeters: number;
  relief: boolean;
  heightAt(point: Point): number;
  /** Horizontal foundation above all terrain beneath this footprint. */
  foundationAt(ring: readonly Point[]): number;
  triangles: TerrainPatch[];
}

export interface TerrainCircle {
  center: Point;
  radiusMeters: number;
}

/** Raised ground. Platforms take priority over cuts inside their whole footprint. */
export interface TerrainPlatform {
  kind: "platform";
  id: Id;
  summit: TerrainCircle;
  /** Absolute level of the flat summit. */
  levelMeters: number;
  /** A cliff edge stops at the summit; a slope falls linearly back to the base field over runMeters. */
  edge: { kind: "cliff" } | { kind: "slope"; runMeters: number };
}

/** A level-floored ring excavation, such as a moat, measured from an absolute rim. */
export interface TerrainRingCut {
  kind: "ringCut";
  id: Id;
  axis: TerrainCircle;
  widthMeters: number;
  depthMeters: number;
  rimElevationMeters: number;
  /** Fraction of the half width taken by each sloping bank. */
  bankFraction: number;
  /** Optional standing water; its shoreline becomes a breakline. */
  waterElevationMeters?: number;
}

export type TerrainFeature = TerrainPlatform | TerrainRingCut;

/** Height source before earthworks. Cell elevations are interpolated across the editor mesh. */
export type TerrainBase = { kind: "cells" } | { kind: "flat"; elevationMeters: number };

/** Derived, unpersisted grading model: a base field plus vector earthworks in absolute metres. */
export interface TerrainModel {
  base: TerrainBase;
  features: TerrainFeature[];
}
