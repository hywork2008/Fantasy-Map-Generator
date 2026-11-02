import type { CityDocument, Point } from "../../types/document";
import type { TerrainFieldRecipe } from "../../types/terrain";
import { clone } from "../mesh";
import { cityTerrain } from "../terrainElevation";
import { fieldFromParts } from "./conform";
import { FIELD_SAMPLE_METERS } from "./constants";
import { fieldGrid, fieldPoint, sampleField } from "./sample";

/** Height field whose low frequency is the current cell surface. The grid itself is not saved. */
export function cellsToFieldRecipe(
  document: CityDocument,
  coarseMeters = 16,
  sampleMeters = FIELD_SAMPLE_METERS
): TerrainFieldRecipe | null {
  const heightAt = cellHeight(document);
  const grid = fieldGrid(document.frame.extentMeters, coarseMeters);
  const elevationsMeters: number[] = [];
  for (let row = 0; row < grid.rows; row++)
    for (let column = 0; column < grid.columns; column++)
      elevationsMeters.push(heightAt(fieldPoint(grid, column, row)));
  if (elevationsMeters.length < 4) return null;
  return {
    version: 1,
    template: "cells",
    seed: 1,
    sampleMeters,
    parts: [
      {
        kind: "coarse",
        origin: grid.origin,
        spacingMeters: grid.sampleMeters,
        columns: grid.columns,
        rows: grid.rows,
        elevationsMeters
      }
    ]
  };
}

/** Difference between the cell surface and the field rebuilt from `cellsToFieldRecipe`. */
export function cellConversionError(
  document: CityDocument,
  recipe: TerrainFieldRecipe
): { rms: number; max: number; samples: number } {
  const heightAt = cellHeight(document);
  const field = fieldFromParts(document.frame.extentMeters, recipe.sampleMeters, recipe.parts);
  const coarse = recipe.parts.find(part => part.kind === "coarse");
  const step = Math.max(recipe.sampleMeters, coarse && coarse.kind === "coarse" ? coarse.spacingMeters / 2 : 16);
  const half = document.frame.extentMeters / 2;
  let sum = 0;
  let max = 0;
  let samples = 0;
  for (let y = -half; y <= half; y += step)
    for (let x = -half; x <= half; x += step) {
      const point: Point = [x, y];
      const delta = Math.abs(sampleField(field, point) - heightAt(point));
      sum += delta * delta;
      if (delta > max) max = delta;
      samples++;
    }
  return { rms: samples ? Math.sqrt(sum / samples) : 0, max, samples };
}

function cellHeight(document: CityDocument): (point: Point) => number {
  const source = clone(document);
  if (source.terrain?.field) source.terrain = { ...source.terrain, field: undefined };
  return cityTerrain(source).heightAt;
}
