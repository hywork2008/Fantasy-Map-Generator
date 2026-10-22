/** node --import tsx scripts/benchmarkCeRegionalColors.mts */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import os from "node:os";
import { JSDOM } from "jsdom";
import { buildBlockFabric } from "../src/city-editor/generators/blockInfill";
import { withBuildingAppearance, assignBuildingAppearances } from "../src/city-editor/generators/buildingAppearance";
import { createGridDocument } from "../src/city-editor/generators/document";
import { generateCityOnDocument } from "../src/city-editor/generators/generation/generateCity";
import { defaultGenerationSettings } from "../src/city-editor/generators/generation/settings";
import { renderEditorSvg } from "../src/city-editor/renderers/editorSvg";
import { createCityMassing } from "../src/city3d/three/cityMeshes";
import { renderStandaloneCitySvg } from "../src/city-editor/renderers/standaloneSvg";

const dom = new JSDOM("<!doctype html><body></body>");
Object.assign(globalThis, { document: dom.window.document });
const seed = "regional-appearance";
const settings = defaultGenerationSettings();
settings.buildingPattern = "medieval";
settings.historicalPeriod = "highMedieval";
const city = generateCityOnDocument(createGridDocument({ size: "small", grid: "evolution", seed }), settings, seed)!;
const variants = [
  { id: "legacy", city: { ...city, buildingAppearanceVersion: undefined } },
  ...(["mediterranean", "northern-wooded", "northern-urban", "stone-upland"] as const).map(id => ({
    id,
    city: withBuildingAppearance(city, id)
  }))
];
const out = resolve("/tmp/ce-regional-colors");
mkdirSync(out, { recursive: true });
const results: object[] = [];
const samples = new Map<string, number[]>();
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (let pass = 0; pass < 6; pass++) {
  for (let j = 0; j < variants.length; j++) {
    const variant = variants[(j + pass) % variants.length];
    const key = variant.id;
    const start = performance.now();
    const svg = renderEditorSvg(
      variant.city,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      "-600 -600 1200 1200",
      1,
      false,
      null,
      null,
      null,
      null,
      false,
      false,
      undefined,
      false,
      false,
      "light"
    );
    const elapsed = performance.now() - start;
    if (pass) samples.set(key, [...(samples.get(key) ?? []), elapsed]);
    if (pass === 5) {
      const lots = buildBlockFabric(variant.city).buildings;
      const massing = createCityMassing(lots);
      const buffers = massing.pickables.reduce(
        (n, mesh) => n + Object.values(mesh.geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0),
        0
      );
      const paths = [...svg.querySelectorAll(".ce-building")];
      const perFace = new Map<string, number>();
      for (const path of paths.filter(p => p.classList.contains("ce-building-batch"))) {
        const face = path.getAttribute("data-building-face")!;
        perFace.set(face, (perFace.get(face) ?? 0) + 1);
      }
      const thousand = Array.from({ length: 1000 }, (_, i) => ({ ...lots[i % lots.length], id: `bench-${i}` }));
      const derivation: number[] = [],
        updates: number[] = [];
      for (let i = 0; i < 6; i++) {
        const before = performance.now();
        assignBuildingAppearances(variant.city, thousand);
        if (i) derivation.push(performance.now() - before);
        const updateStart = performance.now();
        massing.updateAppearance!(lots);
        if (i) updates.push(performance.now() - updateStart);
      }
      results.push({
        profile: key,
        lots: lots.length,
        renderMedianMs: median(samples.get(key)!),
        renderSamplesMs: samples.get(key),
        svgNodes: svg.querySelectorAll("*").length,
        buildingPaths: paths.length,
        maxPathsPerBlock: Math.max(...perFace.values()),
        svgBytes: Buffer.byteLength(svg.outerHTML),
        meshes: massing.pickables.length,
        triangles: massing.pickables.reduce((n, m) => n + m.geometry.getAttribute("position").count / 3, 0),
        bufferBytes: buffers,
        appearance1000MedianMs: median(derivation),
        colorUpdateMedianMs: median(updates)
      });
      const exported = renderStandaloneCitySvg(variant.city);
      writeFileSync(resolve(out, `${key}.svg`), exported.outerHTML);
      massing.dispose();
    }
  }
}
writeFileSync(
  resolve("docs/analytics/ce-regional-colors-benchmark.json"),
  `${JSON.stringify(
    {
      date: new Date().toISOString(),
      seed,
      period: settings.historicalPeriod,
      node: process.version,
      cpu: os.cpus()[0].model,
      environment: "Node + jsdom; warmed median of 5, rotating order; excludes layout, paint and GPU time",
      results
    },
    null,
    2
  )}\n`
);
console.log(JSON.stringify(results));
dom.window.close();
