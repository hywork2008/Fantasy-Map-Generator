#!/usr/bin/env node
/**
 * Height-field ground build time through the real terrain model (docs/plan/ce-terrain-field-mode.md §9).
 *
 *   npm run ce:terrain-perf
 *
 * Uses the cliff-fortress study (castle platform, ramp) so heightAt includes earthworks, and the real slopeAt
 * for vertex colours. Frame time needs a GPU and is not measured here.
 */
import { performance } from "node:perf_hooks";
import { type RenderSpacing, suburbSpacingFactor } from "../src/city-editor/generators/terrainField/constants";
import { drawSeamError, terrainChunkGeometry } from "../src/city-editor/generators/terrainField/drawGrid";
import { createCliffFortressStudy } from "../src/city-editor/generators/terrainField/study";
import { cityTerrain } from "../src/city-editor/generators/terrainElevation";

const extents = [300, 600, 1200];
const spacings: RenderSpacing[] = [1, 2, 4, 8];

function main(): void {
  const rows = ["extent spacing vertices gridMs chunkMs seamP95"];
  for (const extent of extents) {
    const document = createCliffFortressStudy();
    document.frame.extentMeters = extent;
    for (const spacing of spacings) {
      const vertices = (Math.floor(extent / spacing) + 1) ** 2;
      const gridStarted = performance.now();
      const terrain = cityTerrain(document, { renderSpacing: spacing });
      const grid = terrain.grid;
      const gridMs = performance.now() - gridStarted;
      if (!grid || !terrain.slopeAt) continue;
      const chunkStarted = performance.now();
      terrainChunkGeometry(grid, terrain.slopeAt, 120, suburbSpacingFactor(extent));
      const chunkMs = performance.now() - chunkStarted;
      const seam = drawSeamError(grid, terrain.heightAt);
      rows.push(`${extent} ${spacing} ${vertices} ${gridMs.toFixed(0)} ${chunkMs.toFixed(0)} ${seam.p95.toFixed(3)}`);
    }
  }
  console.log(rows.join("\n"));
  console.log("Frame p95 was not measured.");
}

main();
