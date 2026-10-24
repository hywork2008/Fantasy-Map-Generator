#!/usr/bin/env node
/**
 * Height-field mesh build time (docs/plan/ce-terrain-field-mode.md §9).
 *
 *   npm run ce:terrain-perf
 *
 * Frame time needs a GPU and is not measured here. The mesh-build gate is 500 ms.
 */
import { performance } from "node:perf_hooks";
import { buildTerrainFieldRecipe } from "../src/city-editor/generators/terrainField/build";
import { fieldFromParts } from "../src/city-editor/generators/terrainField/conform";
import { suburbSpacingFactor, type RenderSpacing } from "../src/city-editor/generators/terrainField/constants";
import { buildDrawGrid, drawSeamError, terrainChunkGeometry } from "../src/city-editor/generators/terrainField/drawGrid";
import { sampleField } from "../src/city-editor/generators/terrainField/sample";

const extents = [300, 600, 1200, 2400];
const spacings: RenderSpacing[] = [1, 2, 4, 8];

function main(): void {
  const rows: string[] = ["extent spacing vertices buildMs seamP95"];
  for (const extent of extents) {
    const recipe = buildTerrainFieldRecipe({ template: "crag", seed: 11, extentMeters: extent, sampleMeters: 4 });
    const started = performance.now();
    const field = fieldFromParts(extent, recipe.sampleMeters, recipe.parts);
    const fieldMs = performance.now() - started;
    let min = Infinity;
    for (const value of field.elevationsMeters) if (value < min) min = value;
    const heightAt = (point: [number, number]) => sampleField(field, point) - min;
    console.log(`field ${extent} m sample ${recipe.sampleMeters} m generated in ${fieldMs.toFixed(1)} ms`);
    for (const spacing of spacings) {
      const vertices = (Math.floor(extent / spacing) + 1) ** 2;
      if (vertices > 1_500_000) {
        rows.push(`${extent} ${spacing} ${vertices} skipped`);
        continue;
      }
      const buildStarted = performance.now();
      const grid = buildDrawGrid(extent, spacing, heightAt);
      const chunks = terrainChunkGeometry(grid, () => 0, extent * 0.2, suburbSpacingFactor(extent));
      const buildMs = performance.now() - buildStarted;
      const seam = drawSeamError(grid, heightAt);
      void chunks;
      rows.push(`${extent} ${spacing} ${vertices} ${buildMs.toFixed(1)} ${seam.p95.toFixed(3)}`);
    }
  }
  console.log(rows.join("\n"));
  console.log("Frame p95 was not measured. Mesh build at or under 500 ms is the gate used here.");
}

main();
