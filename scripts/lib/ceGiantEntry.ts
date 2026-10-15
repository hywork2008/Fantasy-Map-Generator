// Headless replay of a captured CE Worker request (scripts/benchmarkCeGiant.mjs).
import { readFileSync } from "node:fs";
import { generateCityOnDocument } from "../../src/city-editor/generators/generation/generateCity";
import { disableMeshOpProbe, enableMeshOpProbe } from "../../src/city-editor/generators/meshOpProbe";
import { cityFingerprint, cityQualityMetrics } from "../../src/city-editor/services/analysis/cityGenerationPerformance";
import type { GenerationRequest } from "../../src/city-editor/types/worker";
import { ProcessingProfiler } from "../../src/utils/processingProfiler";

export interface GiantRun {
  request: string;
  population: number;
  seed?: string;
  probe?: boolean;
  /** Override the input document's grid (voronoi | hex | evolution). */
  grid?: string;
  /** PROTOTYPE: population cell width in metres (default 50). */
  cell?: number;
}

export function runGiant(run: GiantRun) {
  const request = JSON.parse(readFileSync(run.request, "utf8")) as GenerationRequest;
  (globalThis as { __ceCellWidthOverride?: number }).__ceCellWidthOverride = run.cell;
  if (run.grid) request.document.gridKind = run.grid as typeof request.document.gridKind;
  const settings = structuredClone(request.settings);
  if (settings.population) settings.population = { ...settings.population, targetPopulation: run.population };
  const seed = run.seed ?? request.seed;
  const profiler = new ProcessingProfiler();
  if (run.probe) enableMeshOpProbe(() => profiler.currentPath());
  const attempts: number[] = [];
  const failures: string[] = [];
  const started = performance.now();
  let city: ReturnType<typeof generateCityOnDocument>;
  let ops: ReturnType<typeof disableMeshOpProbe> = [];
  try {
    city = generateCityOnDocument(
      request.document,
      settings,
      seed,
      sample => {
        if (sample.attempt && !attempts.includes(sample.attempt)) attempts.push(sample.attempt);
        if (sample.failure) failures.push(`${sample.attempt}:${sample.failure.reason}`);
      },
      undefined,
      profiler
    );
  } finally {
    if (run.probe) ops = disableMeshOpProbe();
  }
  const totalMs = performance.now() - started;
  return {
    population: run.population,
    seed,
    grid: request.document.gridKind ?? "voronoi",
    cell: run.cell ?? 50,
    success: !!city,
    totalMs,
    attempts: attempts.length,
    failures,
    faces: city ? Object.keys(city.mesh.faces).length : 0,
    vertices: city ? Object.keys(city.mesh.vertices).length : 0,
    edges: city ? Object.keys(city.mesh.edges).length : 0,
    report: city?.populationReport,
    quality: city ? cityQualityMetrics(city) : undefined,
    fingerprint: city ? cityFingerprint(city) : undefined,
    breakdown: profiler.snapshot(),
    ops
  };
}
