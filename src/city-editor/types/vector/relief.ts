import type { ElevationPreset } from "../generationSettings";
import type { Point } from "../primitives";
import type { PointTerrainPart, TerrainTemplateId } from "../terrain";

/**
 * A broad landform of the mesh editor's elevation presets, as a smooth function of the point
 * (docs/plan/ce-meshless-natural-relief.md §6.2).
 */
export interface VectorReliefPresetPart {
  kind: "preset";
  preset: Exclude<ElevationPreset, "flat">;
  center: Point;
  /** Downhill (slope) or valley-axis bearing, radians from +X, counter-clockwise in plan metres. */
  azimuthRadians: number;
  /** Half the span the landform rises over. */
  halfMeters: number;
  /** Height from the low ground to the high ground. */
  amplitudeMeters: number;
}

/** FMG's coarse height lattice, interpolated bicubically so its 17×17 points leave no creases. */
export interface VectorReliefLatticePart {
  kind: "lattice";
  origin: Point;
  spacingMeters: number;
  columns: number;
  rows: number;
  elevationsMeters: number[];
}

export type VectorReliefPart = PointTerrainPart | VectorReliefPresetPart | VectorReliefLatticePart;

/**
 * Earth people moved: they change the ground (§4.1). A motte is a flat-topped cone; a ditch a trench of
 * level floor with sloping sides along a line or ring.
 */
export type VectorEarthwork =
  | {
      kind: "mound";
      id: string;
      ownerId?: string;
      center: Point;
      summitRadiusMeters: number;
      baseRadiusMeters: number;
      /** Absolute summit level. */
      summitMeters: number;
    }
  | {
      kind: "ditch";
      id: string;
      ownerId?: string;
      line: Point[];
      closed: boolean;
      /** Width at the lip. */
      widthMeters: number;
      /** Absolute level of the floor. */
      floorMeters: number;
      /** Width of the level floor. */
      floorWidthMeters: number;
    };

/** Natural relief of a meshless city (docs/plan/ce-meshless-natural-relief.md §8). The ground is a function of the
 * point; no lattice is stored. */
export interface VectorRelief {
  version: 1;
  /** Where the landform came from: the city's settings, or the FMG map's heights. */
  source: "settings" | "fmg";
  seed: number;
  /** The mesh editor's terrain template the landform drew on, if any. */
  template?: Exclude<TerrainTemplateId, "cells">;
  parts: VectorReliefPart[];
  earthworks: VectorEarthwork[];
}
