#!/usr/bin/env node
/**
 * CPU half of the freeform F0 measurement (docs/plan/ce-freeform-building-placement.md §10).
 * Frame time is scripts/ceFreeformFrame.mts.
 *
 *   npm run ce:freeform-perf
 */
import { performance } from "node:perf_hooks";
import { planBox, type PlanBox } from "../src/buildings/placementContract";
import { heightFieldRaycast } from "../src/city-editor/generators/freeform/heightFieldDda";
import { buildChunkPositions, chunkLayout, samplesForStep } from "../src/city-editor/generators/freeform/lodChunks";
import { createPlotIndex, plotRecord } from "../src/city-editor/generators/freeform/plotIndex";
import { validatePlacement } from "../src/city-editor/generators/freeform/validatePlacement";
import { fieldGrid, fieldIndex, sampleGrid, type FieldGrid } from "../src/city-editor/generators/terrainField/sample";
import type { Point } from "../src/city-editor/types/primitives";

const EXTENT = 2400;
const RADIUS = 900;
const HEIGHT = 80;

function dome(point: Point): number {
  const r2 = point[0] * point[0] + point[1] * point[1];
  const limit = RADIUS * RADIUS;
  return r2 >= limit ? 0 : HEIGHT * (1 - r2 / limit);
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function lattice(spacing: number): { grid: FieldGrid; values: Float32Array } {
  const grid = fieldGrid(EXTENT, spacing);
  const values = new Float32Array(grid.columns * grid.rows);
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const point: Point = [grid.origin[0] + column * spacing, grid.origin[1] + row * spacing];
      values[fieldIndex(grid, column, row)] = dome(point);
    }
  }
  return { grid, values };
}

function main(): void {
  const fieldStarted = performance.now();
  const { grid, values } = lattice(2);
  const fieldMs = performance.now() - fieldStarted;
  const heightAt = (point: Point) => sampleGrid(grid, values, point);

  const chunks = chunkLayout(EXTENT, [0, 0]);
  const counts = { 1: 0, 2: 0, 4: 0 };
  let vertices = 0;
  const buildStarted = performance.now();
  for (const chunk of chunks) {
    counts[chunk.stepMeters] += 1;
    vertices += samplesForStep(chunk.stepMeters) ** 2;
    buildChunkPositions(chunk.origin, chunk.stepMeters, heightAt);
  }
  const allChunksMs = performance.now() - buildStarted;

  const centre = chunks.find(chunk => chunk.stepMeters === 1)!;
  const rebuilds: number[] = [];
  for (let pass = 0; pass < 40; pass++) {
    const started = performance.now();
    buildChunkPositions(centre.origin, centre.stepMeters, heightAt);
    rebuilds.push(performance.now() - started);
  }

  const index = createPlotIndex();
  const stored: PlanBox[] = [];
  for (let row = 0; row < 45; row++) {
    for (let column = 0; column < 45 && stored.length < 2000; column++) {
      stored.push(planBox([-260 + column * 12, -260 + row * 12], { halfX: 4, halfZ: 3 }, 0));
    }
  }
  index.load(stored.map((box, id) => plotRecord(`p${id}`, box)));
  let seed = 11;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  const moves: number[] = [];
  for (let move = 0; move < 300; move++) {
    const base = stored[Math.floor(random() * stored.length)];
    const center: Point = [base.center[0] + (random() - 0.5) * 18, base.center[1] + (random() - 0.5) * 18];
    const started = performance.now();
    const plot = planBox(center, { halfX: 4, halfZ: 3 }, random() * Math.PI * 2);
    const step = 2;
    const zx = (heightAt([center[0] + step, center[1]]) - heightAt([center[0] - step, center[1]])) / (2 * step);
    const zy = (heightAt([center[0], center[1] + step]) - heightAt([center[0], center[1] - step])) / (2 * step);
    let drop = 0;
    const level = heightAt(center);
    for (const corner of [
      [center[0] - 4, center[1] - 3],
      [center[0] + 4, center[1] - 3],
      [center[0] + 4, center[1] + 3],
      [center[0] - 4, center[1] + 3]
    ] as Point[])
      drop = Math.max(drop, Math.abs(heightAt(corner) - level));
    validatePlacement(
      { id: "move", box: plot, slope: Math.hypot(zx, zy), areaM2: 48, edgeDropMeters: drop },
      index
    );
    moves.push(performance.now() - started);
  }

  const rays: number[] = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      const target: Point = [-700 + column * 200, -700 + row * 200];
      const started = performance.now();
      heightFieldRaycast(
        grid,
        values,
        {
          origin: [0, -500, 280],
          direction: [target[0] - 0, target[1] + 500, dome(target) - 280]
        },
        4000
      );
      rays.push(performance.now() - started);
    }
  }

  const report = {
    extentMeters: EXTENT,
    field: { spacingMeters: 2, samples: values.length, buildMs: Number(fieldMs.toFixed(1)) },
    chunks: {
      count: chunks.length,
      byStepMeters: counts,
      vertices,
      buildAllMs: Number(allChunksMs.toFixed(1)),
      oneNearChunkRebuildP95Ms: Number(percentile(rebuilds, 0.95).toFixed(3))
    },
    placement: {
      plots: stored.length,
      moves: moves.length,
      p95Ms: Number(percentile(moves, 0.95).toFixed(3)),
      maxMs: Number(Math.max(...moves).toFixed(3))
    },
    raycast: {
      rays: rays.length,
      p95Ms: Number(percentile(rays, 0.95).toFixed(3)),
      maxMs: Number(Math.max(...rays).toFixed(3))
    }
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
