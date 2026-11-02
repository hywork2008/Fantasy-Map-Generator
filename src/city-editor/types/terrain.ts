import type { TerrainRiverCorridor } from "./contracts/riverHydraulics";
import type { Id, Point } from "./primitives";

export type { TerrainRiverCorridor } from "./contracts/riverHydraulics";

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
  /** Draw triangles, built on first read; field height/foundation queries do not need them. */
  triangles: TerrainPatch[];
  /**
   * Draw grid for a height field. Built on first read so generation can ignore it.
   * Spacing is a local view setting, not part of the document.
   */
  grid?: TerrainGrid;
  /** Present when built with road ribbons: those to draw, split where they would cross a cliff. */
  /** Walkable top: a ramp deck where one stands, otherwise the ground. Roads are drawn on it. */
  surfaceAt(point: Point): number;
  /** Local water-surface height where a river corridor covers the point. */
  waterAt?(point: Point): number | null;
  riverProfiles?: import("./contracts/riverHydraulics").RiverHydraulicProfile[];
  /** Ramps in the same local frame as heightAt. */
  ramps: Array<{ ramp: TerrainRamp; elevations: number[] }>;
  roads?: {
    ribbons: import("../../utils/roadSurface").RoadRibbon[];
    /** Flights of steps on lanes and paths too steep to walk as a slope, heights in the local frame. */
    stairs: Array<{ centerline: Point[]; elevations: number[]; widthMeters: number; riserMeters?: number }>;
    /** Where a road met a cliff between levels and was stopped. */
    cliffBreaks: Point[];
  };
}

export interface TerrainCircle {
  center: Point;
  radiusMeters: number;
}

/** A platform summit: an analytic circle, the union of editor cells, or an explicit polygon. */
export type TerrainShape =
  | ({ kind: "circle" } & TerrainCircle)
  | { kind: "faces"; faceIds: Id[] }
  | { kind: "polygon"; points: Point[] };

/** Raised ground. Platforms take priority over cuts inside their whole footprint. */
export interface TerrainPlatform {
  kind: "platform";
  id: Id;
  /** The castle (or other plan) that created this earthwork and removes it with itself. */
  ownerId?: Id;
  /**
   * A terrace of a hill town, or a building pad cut out of the slope.
   * Both may be crossed by a road. Absent: a platform that only a ramp may climb (a castle rock).
   */
  role?: "terrace" | "pad";
  summit: TerrainShape;
  /** Absolute level of the flat summit. */
  levelMeters: number;
  /**
   * A cliff edge stops roads. A slope falls back to the base field over runMeters.
   * A wall is a vertical retaining face; roads may stair over it.
   */
  edge: { kind: "cliff" } | { kind: "slope"; runMeters: number } | { kind: "wall" };
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

export type TerrainFeature = TerrainPlatform | TerrainRingCut | TerrainRiverCorridor;

/** Height source before earthworks. Cell elevations are interpolated across the editor mesh. */
export type TerrainBase =
  | { kind: "cells" }
  | { kind: "flat"; elevationMeters: number }
  | { kind: "field"; field: TerrainField };

export type TerrainTemplateId = "noise" | "crag" | "spur" | "meander" | "escarpment" | "dome" | "cells";

export type TerrainFieldPart =
  | { kind: "offset"; meters: number }
  | { kind: "hill"; center: Point; radiusMeters: number; heightMeters: number }
  /** Spherical cap: `H · (1 − r²/R²)` inside the base radius, and 0 outside. The rim is level with the cap's base. */
  | { kind: "dome"; center: Point; radiusMeters: number; heightMeters: number }
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

/** A flat landing of a stepped way. Distances are metres along the way centre line. */
export interface FreeformWayLanding {
  fromMeters: number;
  toMeters: number;
  levelMeters: number;
}

/** One flight between landings. Rise is `steps` times 0.17 m and run is `steps` times 0.30 m. */
export interface FreeformWayFlight {
  fromMeters: number;
  toMeters: number;
  fromLevelMeters: number;
  toLevelMeters: number;
  steps: number;
}

/**
 * A freehand way on the height field. The centre line is the saved ledger.
 * A stepped way also stores the landings and flights chosen when it was drawn.
 */
export interface FreeformWay {
  id: Id;
  centerline: Point[];
  widthMeters: number;
  profile: "slope" | "stepped";
  surface: "dirt" | "paved" | "cobble";
  /** Cart roads climb at 10%. A castle approach climbs at 8%. Absent means cart. */
  grade?: "cart" | "approach";
  landings?: FreeformWayLanding[];
  flights?: FreeformWayFlight[];
}

/** Saved earthworks. Pads and river corridors store their finished heights; the field stores a recipe. */
export interface CityTerrainLayer {
  version: 1;
  features: Array<TerrainPlatform | TerrainRiverCorridor>;
  ramps?: TerrainRamp[];
  /** Height-field recipe. Absent documents keep cell elevations. */
  field?: TerrainFieldRecipe;
  /** Freehand ways. Absent on documents saved before freeform roads. */
  ways?: FreeformWay[];
}

/** Derived, unpersisted grading model: a base field plus vector earthworks in absolute metres. */
export interface TerrainModel {
  riverProfiles?: import("./contracts/riverHydraulics").RiverHydraulicProfile[];
  base: TerrainBase;
  features: TerrainFeature[];
  ramps: TerrainRamp[];
}
