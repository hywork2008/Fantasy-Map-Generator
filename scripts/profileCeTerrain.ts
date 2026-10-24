/**
 * CPU-only terrain diagnostics; no browser, GPU upload, or frame timing.
 * node --import tsx scripts/profileCeTerrain.ts --pads=0 --repeat=3
 * node --import tsx scripts/profileCeTerrain.ts --generate=crag --repeat=3
 * node --cpu-prof --cpu-prof-dir=temp --import tsx scripts/profileCeTerrain.ts --pads=64
 * --document accepts a saved CityDocument JSON. Synthetic pads apply only to the study fixture.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import * as THREE from "three";
import { ProcessingProfiler } from "../src/utils/processingProfiler";
import { createGridDocument } from "../src/city-editor/generators/document";
import { generateCityOnDocument } from "../src/city-editor/generators/generation/generateCity";
import { defaultGenerationSettings } from "../src/city-editor/generators/generation/settings";
import { ruralSuitability } from "../src/city-editor/generators/ruralSuitability";
import { cityTerrain, cityTerrainStamp } from "../src/city-editor/generators/terrainElevation";
import { clearTerrainFieldCache, terrainFieldForDocument } from "../src/city-editor/generators/terrainField/build";
import { suburbSpacingFactor } from "../src/city-editor/generators/terrainField/constants";
import { terrainChunkGeometry } from "../src/city-editor/generators/terrainField/drawGrid";
import { sampleField } from "../src/city-editor/generators/terrainField/sample";
import { createCliffFortressStudy } from "../src/city-editor/generators/terrainField/study";
import type { CityDocument, Point } from "../src/city-editor/types/document";

const option = (name: string, fallback: string) =>
  process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const repeat = Number(option("repeat", "3"));
const padCount = Number(option("pads", "0"));
const extent = Number(option("extent", "600"));
const spacingOption = option("spacing", "auto");
const spacing = spacingOption === "auto" ? "auto" : Number(spacingOption);
const generate = option("generate", "");
const documentPath = option("document", "");
const saveDocument = option("save-document", "");
if (
  !Number.isInteger(repeat) ||
  repeat < 1 ||
  !Number.isInteger(padCount) ||
  padCount < 0 ||
  !Number.isFinite(extent) ||
  extent <= 0 ||
  !["auto", "1", "2", "4", "8"].includes(spacingOption) ||
  !["", "none", "crag"].includes(generate) ||
  (documentPath && generate) ||
  ((documentPath || generate) && padCount)
)
  throw new Error("Invalid diagnostic options");

const inputMs: Record<string, number> = {};
class DiagnosticProfiler extends ProcessingProfiler {
  override measure<T>(phase: string, action: () => T): T {
    if (!this.currentPath()) process.stderr.write(`Starting ${phase}\n`);
    const started = performance.now();
    const value = super.measure(phase, action);
    if (performance.now() - started > 100)
      process.stderr.write(`Finished ${phase}: ${(performance.now() - started).toFixed(1)} ms\n`);
    return value;
  }
}
const profiler = new DiagnosticProfiler();
function time<T>(times: Record<string, number>, key: string, work: () => T): T {
  const started = performance.now();
  const value = work();
  times[key] = performance.now() - started;
  return value;
}
const seed = "terrain-profile-20261024";
const city: CityDocument = documentPath
  ? JSON.parse(readFileSync(documentPath, "utf8"))
  : generate
    ? time(inputMs, "generationMs", () => {
        const input = createGridDocument({ size: "tiny", grid: "hex", seed });
        const settings = defaultGenerationSettings();
        settings.config.coast = "none";
        settings.config.rivers = [];
        settings.config.features.port = false;
        if (generate === "crag") settings.terrainField = { template: "crag" };
        const result = generateCityOnDocument(
          input,
          settings,
          seed,
          sample => {
            process.stderr.write(`${sample.phase} ${sample.elapsedMs.toFixed(1)} ms\n`);
          },
          undefined,
          profiler
        );
        if (!result) throw new Error("Generation rejected; do not compare this run as successful");
        return result;
      })
    : createCliffFortressStudy();
if (!documentPath && !generate) {
  city.frame.extentMeters = extent;
  const field = terrainFieldForDocument(city)!;
  const side = Math.ceil(Math.sqrt(padCount));
  for (let i = 0; i < padCount; i++) {
    const x = -200 + (i % side) * (400 / side);
    const y = -200 + Math.floor(i / side) * (400 / side);
    const width = Math.min(12, 300 / side);
    city.terrain!.features.push({
      kind: "platform",
      id: `pad:diagnostic-${i}`,
      role: "pad",
      edge: { kind: "wall" },
      levelMeters: sampleField(field, [x + width / 2, y + width / 2]),
      summit: {
        kind: "polygon",
        points: [
          [x, y],
          [x + width, y],
          [x + width, y + width],
          [x, y + width]
        ]
      }
    });
  }
}
if (city.format !== "fmg-city-editor" || !city.mesh || !city.frame) throw new Error("Expected CityDocument JSON");
if (saveDocument) writeFileSync(saveDocument, JSON.stringify(city), { flag: "wx" });
clearTerrainFieldCache();
const runs = [];
for (let run = 0; run < repeat; run++) {
  const ms: Record<string, number> = {};
  const terrain = time(ms, "modelMs", () => cityTerrain(city, { renderSpacing: spacing }));
  time(ms, "stampMs", () => cityTerrainStamp(city));
  const grid = time(ms, "drawGridMs", () => terrain.grid);
  let slopeCalls = 0;
  let vertices = 0;
  let triangles = 0;
  if (grid && terrain.slopeAt) {
    const slope = terrain.slopeAt;
    const chunks = time(ms, "chunksRealSlopeMs", () =>
      terrainChunkGeometry(
        grid,
        (point: Point) => {
          slopeCalls++;
          return slope(point);
        },
        Math.max(40, city.frame.cityRadiusMeters),
        suburbSpacingFactor(city.frame.extentMeters)
      )
    );
    time(ms, "chunksZeroSlopeMs", () =>
      terrainChunkGeometry(
        grid,
        () => 0,
        Math.max(40, city.frame.cityRadiusMeters),
        suburbSpacingFactor(city.frame.extentMeters)
      )
    );
    time(ms, "normalsMs", () => {
      for (const chunk of chunks) {
        vertices += chunk.positions.length / 3;
        triangles += chunk.indices.length / 3;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(chunk.positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
        geometry.computeVertexNormals();
        geometry.dispose();
      }
    });
  }
  time(ms, "ruralSuitabilityMs", () => ruralSuitability(city));
  runs.push({
    run,
    cache: run ? "warm-field" : "cold-field",
    ms,
    patches: terrain.triangles.length,
    gridVertices: grid ? grid.columns * grid.rows : 0,
    vertices,
    triangles,
    slopeCalls,
    slopeHeightCalls: slopeCalls * 4
  });
  process.stderr.write(`Completed terrain run ${run + 1}/${repeat}: ${JSON.stringify(runs.at(-1))}\n`);
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      cpu: cpus()[0]?.model,
      seed,
      source: documentPath || (generate ? `generated-${generate}` : "cliff-study-with-synthetic-pads"),
      extent: city.frame.extentMeters,
      spacing,
      padCount,
      inputMs,
      generationBreakdown: profiler.snapshot(),
      faces: Object.keys(city.mesh.faces).length,
      features: city.terrain?.features.length ?? 0,
      actualPads:
        city.terrain?.features.filter(feature => feature.kind === "platform" && feature.role === "pad").length ?? 0,
      roads: "not supplied (isolates terrain cost)",
      runs
    },
    null,
    2
  )
);
