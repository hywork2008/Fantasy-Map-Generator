import type { Point } from "./primitives";

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
