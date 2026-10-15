// Headless replay of a captured CE Worker request (scripts/benchmarkCeGiant.mjs).
import { readFileSync } from "node:fs";
import { generateCityOnDocument } from "../../src/city-editor/generators/generation/generateCity";
import { disableMeshOpProbe, enableMeshOpProbe } from "../../src/city-editor/generators/meshOpProbe";
import { cityFingerprint, cityQualityMetrics } from "../../src/city-editor/services/analysis/cityGenerationPerformance";
import type { GenerationRequest } from "../../src/city-editor/types/worker";
import { ProcessingProfiler } from "../../src/utils/processingProfiler";
import { buildBlockFabric } from "../../src/city-editor/generators/blockInfill";

export interface GiantRun {
  request: string;
  population: number;
  seed?: string;
  probe?: boolean;
  /** Override the input document's grid (voronoi | hex | evolution). */
  grid?: string;
  /** Population mesh cell width in metres (default 50). */
  cell?: number;
  /** Debug: fabric counts on cemetery and temple faces. */
  civic?: boolean;
}

export function runGiant(run: GiantRun) {
  const request = JSON.parse(readFileSync(run.request, "utf8")) as GenerationRequest;
  if (run.grid) request.document.gridKind = run.grid as typeof request.document.gridKind;
  const settings = structuredClone(request.settings);
  if (settings.population)
    settings.population = {
      ...settings.population,
      targetPopulation: run.population,
      ...(run.cell ? { meshCellMeters: run.cell as 50 | 100 | 150 | 200 } : {})
    };
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
    civic: city && run.civic
      ? (() => {
          const fabric = buildBlockFabric(city);
          const faces = Object.values(city.mesh.faces).filter(
            f => f.properties.ward === "cemetery" || city.elements.some(e => e.kind === "temple" && e.faceIds.includes(f.id))
          );
          return faces.map(f => ({
            id: f.id,
            ward: f.properties.ward,
            settlement: f.properties.settlement,
            buildable: f.properties.buildable,
            temple: city.elements.some(e => e.kind === "temple" && e.faceIds.includes(f.id)),
            buildings: fabric.buildings.filter(b => b.faceId === f.id).length,
            lanes: fabric.lanes.filter(l => l.faceId === f.id).length
          }));
        })()
      : undefined,
    report: city?.populationReport,
    roadWidths: city
      ? Object.entries(
          city.featureGroups
            .filter(g => g.kind === "road")
            .reduce<Record<string, number>>((acc, g) => {
              const key = `${g.style.widthMeters}m`;
              acc[key] = (acc[key] ?? 0) + (g.segments?.length ?? 0);
              return acc;
            }, {})
        )
      : [],
    quality: city ? cityQualityMetrics(city) : undefined,
    fingerprint: city ? cityFingerprint(city) : undefined,
    breakdown: profiler.snapshot(),
    ops
  };
}
