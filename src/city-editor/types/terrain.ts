import type { Id, Point } from "./primitives";

export interface TerrainPatch {
  faceId: string;
  points: [Point, Point, Point];
  heights: [number, number, number];
  /** Near-vertical face of a cliff-edged platform, drawn as rock or masonry rather than ground. */
  escarpment?: true;
}

export interface CityTerrain {
  /** Absolute elevation represented by local Y=0. Uniform legacy land stays flat. */
  datumMeters: number;
  relief: boolean;
  heightAt(point: Point): number;
  /** Horizontal foundation above all terrain beneath this footprint. */
  foundationAt(ring: readonly Point[]): number;
  triangles: TerrainPatch[];
  /** Present when built with road ribbons: those to draw, split where they would cross a cliff. */
  /** Walkable top: a ramp deck where one stands, otherwise the ground. Roads are drawn on it. */
  surfaceAt(point: Point): number;
  /** Ramps in the same local frame as heightAt. */
  ramps: Array<{ ramp: TerrainRamp; elevations: number[] }>;
  roads?: {
    ribbons: import("../../utils/roadSurface").RoadRibbon[];
    /** Where a road met a cliff between levels and was stopped. */
    cliffBreaks: Point[];
  };
}

export interface TerrainCircle {
  center: Point;
  radiusMeters: number;
}

/** A platform summit: an analytic circle, or the union of editor cells so its edge follows mesh edges. */
export type TerrainShape = ({ kind: "circle" } & TerrainCircle) | { kind: "faces"; faceIds: Id[] };

/** Raised ground. Platforms take priority over cuts inside their whole footprint. */
export interface TerrainPlatform {
  kind: "platform";
  id: Id;
  /** The castle (or other plan) that created this earthwork and removes it with itself. */
  ownerId?: Id;
  summit: TerrainShape;
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

/**
 * A masonry ramp climbing a cliff-edged platform: a raised deck along its centre line, walled on both sides.
 * The ground beneath keeps its own height; roads ride the deck.
 */
export interface TerrainRamp {
  kind: "ramp";
  id: Id;
  ownerId?: Id;
  /** The platform it climbs onto. Its last point lies just inside that platform's edge. */
  platformId: Id;
  centerline: Point[];
  /** Absolute deck level at each centre-line point. */
  elevationsMeters: number[];
  widthMeters: number;
}

/** Saved earthworks. Platforms are cell-shaped, so their edges follow the editor mesh. */
export interface CityTerrainLayer {
  version: 1;
  features: TerrainPlatform[];
  ramps?: TerrainRamp[];
}

/** Derived, unpersisted grading model: a base field plus vector earthworks in absolute metres. */
export interface TerrainModel {
  base: TerrainBase;
  features: TerrainFeature[];
  ramps: TerrainRamp[];
}
