/** F0 research only: node --import tsx scripts/benchmarkCeForest.mts */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createLandscapeTree, TREE_SPECIES } from "../src/buildings/landscape/trees";
import { buildBlockFabric, clearBlockFabricCache } from "../src/city-editor/generators/blockInfill";
import { createGridDocument } from "../src/city-editor/generators/document";
import { generateCityOnDocument } from "../src/city-editor/generators/generation/generateCity";
import { defaultGenerationSettings } from "../src/city-editor/generators/generation/settings";
import type { GenerationSettings } from "../src/city-editor/types/generationSettings";
import type { CitySizePreset } from "../src/city-editor/generators/document";
import { profileRuralFieldGeneration } from "../src/city-editor/services/analysis/ruralFieldPerformance";
import { polygonArea } from "../src/city-editor/generators/geom";

const fixturePath = "docs/analytics/fixtures/ce-forest-f0-v1.json";
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  id: string;
  seed: string;
  size: CitySizePreset;
  rivers: GenerationSettings["config"]["rivers"];
  elevationPreset: GenerationSettings["elevationPreset"];
}[];
const output = resolve("docs/analytics/ce-forest-f0");
const raw = resolve("docs/analytics/raw/ce-forest-f0");
mkdirSync(output, { recursive: true });
mkdirSync(raw, { recursive: true });
const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const modelStats = TREE_SPECIES.map(species => {
  const samples: number[] = [];
  let stats = {};
  for (let pass = 0; pass < 4; pass++) {
    const start = performance.now();
    const model = createLandscapeTree(species);
    const ms = performance.now() - start;
    const geometries = new Set<import("three").BufferGeometry>();
    const materials = new Set<import("three").Material>();
    let triangles = 0;
    model.group.traverse(object => {
      const mesh = object as import("three").Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    });
    const bufferBytes = [...geometries].reduce(
      (sum, geometry) =>
        sum +
        (geometry.index?.array.byteLength ?? 0) +
        Object.values(geometry.attributes).reduce((n, attribute) => n + attribute.array.byteLength, 0),
      0
    );
    stats = { triangles, meshes: model.pickables.length, materials: materials.size, bufferBytes };
    model.dispose();
    if (pass) samples.push(ms);
  }
  return { species, ...stats, buildSamplesMs: samples, buildMedianMs: [...samples].sort((a, b) => a - b)[1] };
});
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5199, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const results: unknown[] = [];
const files: { path: string; bytes: number; sha256: string }[] = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const fixture of fixtures) {
    console.error(`Measuring ${fixture.id}`);
    const settings = defaultGenerationSettings();
    settings.buildingPattern = "medieval";
    settings.historicalPeriod = "highMedieval";
    settings.elevationPreset = fixture.elevationPreset;
    settings.config.rivers = fixture.rivers;
    const input = createGridDocument({ size: fixture.size, grid: "evolution", seed: fixture.seed });
    input.biome = { id: 6, key: "temperateDeciduousForest", name: "Temperate deciduous forest", color: "#29bc56" };
    const generatedAt = performance.now();
    const city = generateCityOnDocument(input, settings, fixture.seed);
    if (!city) throw new Error(`Generation failed: ${fixture.id}`);
    const generationMs = performance.now() - generatedAt;
    clearBlockFabricCache();
    const fabricAt = performance.now();
    const fabric = buildBlockFabric(city);
    const coldFabricMs = performance.now() - fabricAt;
    const ruralSamples = Array.from({ length: 4 }, () => profileRuralFieldGeneration(city, fabric));
    if (!fabric.farms.length || !fabric.buildings.length) throw new Error(`Empty fixture: ${fixture.id}`);
    const data = JSON.stringify(city);
    const path = `docs/analytics/raw/ce-forest-f0/${fixture.id}.json`;
    writeFileSync(resolve(path), data + "\n");
    files.push({ path, bytes: Buffer.byteLength(data + "\n"), sha256: hash(data + "\n") });
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", message => {
      if (message.text().startsWith("[forest-f0]")) console.error(message.text());
    });
    await page.route("**/forest-benchmark.html", route =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" })
    );
    await page.goto("http://127.0.0.1:5199/forest-benchmark.html");
    const measured = await page.evaluate(async doc => {
      // @ts-expect-error Vite serves this browser-only module from the project root.
      const benchmark = await import("/scripts/lib/ceForestBenchmark.ts");
      return benchmark.run(doc);
    }, city);
    const { previews, ...metrics } = measured;
    for (const [name, url] of Object.entries(previews) as [string, string][]) {
      writeFileSync(resolve(output, `${fixture.id}-${name}.png`), Buffer.from(url.split(",")[1], "base64"));
    }
    await page.close();
    if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
    const row = {
      fixture,
      settings,
      generationMs,
      coldFabricMs,
      buildings: fabric.buildings.length,
      farms: fabric.farms.length,
      farmlandHectares: fabric.farms.reduce((sum, farm) => sum + Math.abs(polygonArea(farm.polygon)), 0) / 10000,
      faces: Object.keys(city.mesh.faces).length,
      frame: city.frame,
      ruralGeneration: ruralSamples.slice(1).map(sample => sample.report),
      ...metrics
    };
    results.push(row);
    console.error(
      JSON.stringify({
        id: fixture.id,
        buildings: row.buildings,
        farms: row.farms,
        farmlandHectares: row.farmlandHectares
      })
    );
    // Preserve partial completed measurements if a later fixture fails.
    writeFileSync(
      resolve(output, "results.json"),
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
          host: { node: process.version, cpu: os.cpus()[0].model, arch: process.arch, platform: process.platform },
          fixturePath,
          fixtureSha256: hash(readFileSync(fixturePath)),
          modelStats,
          results,
          files
        },
        null,
        2
      ) + "\n"
    );
  }
} finally {
  await browser?.close();
  await server.close();
}
console.log(`Wrote ${output}/results.json`);
