import type { Id, Point } from "./primitives";

export interface TerrainPatch {
  faceId: string;
  points: [Point, Point, Point];
  heights: [number, number, number];
  /** Near-vertical face of a cliff-edged platform, drawn as rock or masonry rather than ground. */
  escarpment?: true;
}

/** Regular height grid. Generation samples (`TerrainField`) and the draw grid share this shape. */
export interface TerrainField {
  origin: Point;
  sampleMeters: number;
  columns: number;
  rows: number;
  /** Row-major, row 0 at `origin[1]` (south). Absolute metres. */
  elevationsMeters: Float32Array;
}

/** Draw-only copy of a height field. Same layout as `TerrainField`. */
export type TerrainGrid = TerrainField;

export interface CityTerrain {
  /** Absolute elevation represented by local Y=0. Uniform legacy land stays flat. */
  datumMeters: number;
  relief: boolean;
  /** True when the base is a height field rather than cell elevations. */
  field?: boolean;
  heightAt(point: Point): number;
  /** Rise/run of the finished ground. Present for a height field. */
  slopeAt?(point: Point): number;
  /** Horizontal foundation above all terrain beneath this footprint. */
  foundationAt(ring: readonly Point[]): number;
  triangles: TerrainPatch[];
  /**
   * Draw grid for a height field. Built on first read so generation can ignore it.
   * Spacing is a local view setting, not part of the document.
   */
  grid?: TerrainGrid;
  /** Present when built with road ribbons: those to draw, split where they would cross a cliff. */
  /** Walkable top: a ramp deck where one stands, otherwise the ground. Roads are drawn on it. */
  surfaceAt(point: Point): number;
  /** Ramps in the same local frame as heightAt. */
  ramps: Array<{ ramp: TerrainRamp; elevations: number[] }>;
  roads?: {
    ribbons: import("../../utils/roadSurface").RoadRibbon[];
    /** Flights of steps on lanes and paths too steep to walk as a slope, heights in the local frame. */
    stairs: Array<{ centerline: Point[]; elevations: number[]; widthMeters: number }>;
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
  /**
   * A terrace of a hill town: its edge is a retaining wall that roads may cross, graded as a ramp or climbed by
   * stairs. Absent: a platform that only a ramp may climb (a castle rock).
   */
  role?: "terrace";
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
export type TerrainBase =
  | { kind: "cells" }
  | { kind: "flat"; elevationMeters: number }
  | { kind: "field"; field: TerrainField };

export type TerrainTemplateId = "noise" | "crag" | "spur" | "meander" | "escarpment";

export type TerrainFieldPart =
  | { kind: "offset"; meters: number }
  | { kind: "hill"; center: Point; radiusMeters: number; heightMeters: number }
  | { kind: "range"; points: Point[]; radiusMeters: number; heightMeters: number }
  | { kind: "trough"; points: Point[]; radiusMeters: number; depthMeters: number }
  | { kind: "pit"; center: Point; radiusMeters: number; depthMeters: number }
  | {
      kind: "crag";
      center: Point;
      topRadiusMeters: number;
      cliffRunMeters: number;
      heightMeters: number;
      /** Fractional radius wobble, typically under 0.08, so the lip is not a perfect circle. */
      wobble?: number;
    }
  | {
      kind: "spur";
      root: Point;
      tip: Point;
      topWidthMeters: number;
      cliffRunMeters: number;
      heightMeters: number;
      /** Run of the gentle slope on the plateau side of `root`. The other sides are cliffs. */
      gentleRunMeters: number;
    }
  | {
      kind: "scarp";
      origin: Point;
      /** Horizontal direction from the high ground toward the low ground. */
      downhill: Point;
      cliffRunMeters: number;
      heightMeters: number;
      gentleRunMeters: number;
    }
  | { kind: "noise"; amplitudeMeters: number; wavelengthMeters: number; octaves?: number; seed: number }
  | { kind: "smooth"; radiusMeters: number }
  | { kind: "mask"; dropMeters: number; inner?: number }
  | {
      kind: "coarse" | "correct";
      origin: Point;
      spacingMeters: number;
      columns: number;
      rows: number;
      elevationsMeters: number[];
    };

/** Saved height-field recipe. The grid is rebuilt from this; it is not stored. */
export interface TerrainFieldRecipe {
  version: 1;
  template: TerrainTemplateId;
  seed: number;
  sampleMeters: number;
  parts: TerrainFieldPart[];
}

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
  /** Height-field recipe. Absent documents keep cell elevations. */
  field?: TerrainFieldRecipe;
}

/** Derived, unpersisted grading model: a base field plus vector earthworks in absolute metres. */
export interface TerrainModel {
  base: TerrainBase;
  features: TerrainFeature[];
  ramps: TerrainRamp[];
}
