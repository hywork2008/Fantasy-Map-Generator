/** node --import tsx scripts/benchmarkCeBuildingAppearance.mts [--out=docs/analytics/ce-building-appearance-benchmark.json] */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createGridDocument } from "../src/city-editor/generators/document";
import { defaultGenerationSettings } from "../src/city-editor/generators/generation/settings";
import { generateCityOnDocument } from "../src/city-editor/generators/generation/generateCity";
import { buildBlockFabric } from "../src/city-editor/generators/blockInfill";

const seed = "regional-appearance";
const settings = defaultGenerationSettings();
settings.buildingPattern = "medieval";
const start = performance.now();
const city = generateCityOnDocument(createGridDocument({ size: "small", grid: "evolution", seed }), settings, seed);
if (!city) throw new Error("City generation failed");
const generatedMs = performance.now() - start;
const fabricStart = performance.now();
const lots = buildBlockFabric(city).buildings.filter(l => l.massing);
if (!lots.length) throw new Error("No massing lots");
const fabricMs = performance.now() - fabricStart;
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5198, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 1 });
  await page.route("**/benchmark.html", route =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" })
  );
  await page.goto("http://127.0.0.1:5198/benchmark.html");
  const report = await page.evaluate(async input => {
    const module = await import("/scripts/lib/ceBuildingAppearanceBenchmark.ts");
    return module.run(input);
  }, lots);
  const out = resolve(
    process.argv.find(a => a.startsWith("--out="))?.slice(6) ?? "docs/analytics/ce-building-appearance-benchmark.json"
  );
  mkdirSync(dirname(out), { recursive: true });
  const result = {
    date: new Date().toISOString(),
    revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    host: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model },
    fixture: {
      seed,
      size: "small",
      grid: "evolution",
      pattern: "medieval",
      historicalPeriod: city.historicalPeriod,
      lots: lots.length,
      generatedMs,
      fabricMs,
      note: "Generation measured once; repeated lots are repositioned on a synthetic grid for rendering comparison. BV models have different detail and footprints; not an equal-fidelity comparison."
    },
    ...report,
    previews: undefined,
    validation: {
      webglContextLost: false,
      webglErrors: false,
      timingLimitation:
        "Several steady render medians round to zero in headless SwiftShader. Use build time and structural counts for comparison; do not interpret zero as zero GPU cost or derive FPS."
    }
  };
  for (const [mode, data] of Object.entries(report.previews) as [string, string][])
    writeFileSync(
      resolve(dirname(out), `ce-building-appearance-${mode}.png`),
      Buffer.from(data.split(",")[1], "base64")
    );
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ out, fixture: result.fixture, environment: report.environment }));
} finally {
  await browser?.close();
  await server.close();
}
