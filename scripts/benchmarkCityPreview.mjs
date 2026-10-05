/** Start npm run dev, then: node scripts/benchmarkCityPreview.mjs
 * --url=http://localhost:5173 --sizes=small,medium,large --terrains=inland,river,coast
 * --runs=10 --out=/tmp/ce-preview-benchmark.json [--descriptor=/path/to/site.json]
 * The same generated structure is rendered both ways. No debugFailure mode.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const option = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const runs = Number(option("runs", "10"));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
// A blank same-origin harness avoids editor startup and HMR reloads affecting samples.
const targetUrl = new URL("benchmark.html", option("url", "http://localhost:5173/Fantasy-Map-Generator/city-editor/index.html"));
await page.route("**/benchmark.html", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
await page.goto(targetUrl.href);
const descriptorPath = option("descriptor", "");
const descriptor = descriptorPath ? JSON.parse(readFileSync(descriptorPath, "utf8")) : null;
const reports = [];
try {
  for (const size of option("sizes", "small,medium,large").split(",")) {
    for (const terrain of option("terrains", "inland,river,coast").split(",")) {
      for (let run = 0; run < runs; run++) {
        const result = await page.evaluate(async ({ size, terrain, descriptor, run, capture }) => {
          const { createGridDocument, descriptorFrameGridOptions } = await import("/Fantasy-Map-Generator/city-editor/core/document.ts");
          const { defaultGenerationSettings } = await import("/Fantasy-Map-Generator/city-editor/core/generate.ts");
          const { startCityGeneration } = await import("/Fantasy-Map-Generator/city-editor/core/generationWorkerClient.ts");
          const { parseDescriptor, shareFromDescriptor } = await import("/Fantasy-Map-Generator/city-editor/io/incomingCity.ts");
          const { serializeCitySvg } = await import("/Fantasy-Map-Generator/city-editor/render/svg.ts");
          const { serializeCityPreviewSvg } = await import("/Fantasy-Map-Generator/city-editor/render/previewSvg.ts");
          const seed = "preview-benchmark-v1";
          const began = performance.now();
          const parsed = descriptor ? parseDescriptor(JSON.stringify(descriptor)) : null;
          if (descriptor && !parsed) throw new Error("Invalid descriptor");
          const share = parsed ? shareFromDescriptor(parsed) : null;
          const inputMs = performance.now() - began;
          const gridStart = performance.now();
          const input = createGridDocument(share ? {
            size: share.size, grid: share.grid, seed: share.gridSeed ?? share.seed,
            patchParams: share.patchParams, measureBlockSize: share.measureBlockSize,
            ...descriptorFrameGridOptions(share.descriptor.frame, share.descriptor.burg.waterAccess?.port.river === true, share.descriptor.burg.riverPlacement?.bankDistanceMeters)
          } : { size, grid: "evolution", seed });
          const gridMs = performance.now() - gridStart;
          const settings = { ...defaultGenerationSettings(), ...share?.settings, descriptor: share?.descriptor };
          if (!share) {
            settings.config.coast = terrain === "coast" ? "straight" : "none";
            settings.config.rivers = terrain === "river" ? ["through"] : [];
            settings.config.features.port = terrain === "coast";
          }
          const workerStart = performance.now();
          const samples = [];
          let firstFailureMs = null;
          let workerTimings;
          const job = startCityGeneration({ document: input, settings, seed: share?.seed ?? seed }, sample => {
            samples.push(sample);
            if (sample.failure && firstFailureMs === null) firstFailureMs = performance.now() - began;
          }, undefined, undefined, measured => { workerTimings = measured; });
          const city = await job.result;
          const workerAndTransferMs = performance.now() - workerStart;
          if (!city) return { run, size, terrain, status: "failed", inputMs, gridMs, workerAndTransferMs, firstFailureMs, totalMs: performance.now() - began, samples };
          const render = async (mode) => {
            const stages = [];
            const start = performance.now();
            const svg = mode === "preview" ? serializeCityPreviewSvg(city, s => stages.push(s)) : serializeCitySvg(city, s => stages.push(s));
            const svgMs = performance.now() - start;
            const blob = new Blob([svg], { type: "image/svg+xml" });
            const url = URL.createObjectURL(blob);
            const imageStart = performance.now();
            try {
              const image = new Image();
              image.src = url;
              await image.decode();
              if (capture && mode === "preview") { image.style.width = "800px"; image.style.height = "800px"; document.body.replaceChildren(image); }
              const root = new DOMParser().parseFromString(svg, "image/svg+xml");
              return { mode, svgMs, imageMs: performance.now() - imageStart,
                afterWorkerMs: performance.now() - start, svgBytes: blob.size,
                elements: root.querySelectorAll("*").length, buildings: root.querySelectorAll(".ce-building").length,
                symbols: Number(root.documentElement.getAttribute("data-preview-symbols") ?? 0), stages };
            } finally { URL.revokeObjectURL(url); }
          };
          // Alternate order to expose cache/order effects. Record first run separately.
          const output = [];
          for (const mode of run % 2 ? ["detailed", "preview"] : ["preview", "detailed"]) output.push(await render(mode));
          return { run, size, terrain, status: "ready", inputMs, gridMs, workerAndTransferMs, workerTimings,
            firstFailureMs, cells: Object.keys(city.mesh.faces).length, output, samples };
        }, { size, terrain, descriptor, run, capture: Boolean(option("screenshot", "")) });
        if (option("screenshot", "") && result.status === "ready") await page.screenshot({ path: option("screenshot", "") });
        reports.push(result);
        writeFileSync(option("out", "/tmp/ce-preview-benchmark.json"), JSON.stringify({ reports, partial: true }, null, 2));
        console.log(size, terrain, run + 1, result.status);
      }
    }
  }
} finally { await browser.close(); }
const quantile = (values, q) => values.sort((a,b) => a-b)[Math.max(0, Math.ceil(values.length*q)-1)] ?? null;
const summaries = [];
for (const size of new Set(reports.map(r => r.size))) for (const terrain of new Set(reports.map(r => r.terrain))) {
  const group = reports.filter(r => r.size === size && r.terrain === terrain);
  for (const mode of ["preview", "detailed"]) {
    const values = group.filter(r => r.run > 0 && r.status === "ready").map(r => r.output.find(o => o.mode === mode).afterWorkerMs);
    summaries.push({ size, terrain, mode, warmSamples: values.length,
      medianAfterWorkerMs: quantile([...values], .5), p95AfterWorkerMs: quantile([...values], .95) });
  }
}
writeFileSync(option("out", "/tmp/ce-preview-benchmark.json"), JSON.stringify({
  environment: { browser: "Chromium", node: process.version, platform: process.platform,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirtyWorkingTree: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()), descriptorPath, runs },
  reports, summaries
}, null, 2));
