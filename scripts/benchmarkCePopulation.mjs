import { execFileSync } from "node:child_process";
// Run after `npm run dev`: node scripts/benchmarkCePopulation.mjs [CE URL] [output JSON].
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, totalmem } from "node:os";
import { dirname } from "node:path";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:5173/Fantasy-Map-Generator/city-editor/";
const output = process.argv[3] ?? "temp/population-validation/benchmark.json";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1485, height: 1070 } });
  await page.goto(url);
  const result = await page.evaluate(async () => {
    const load = path => import(new URL(path, location.href).href);
    const [{ createGridDocument }, { defaultPopulationSettings }, { defaultGenerationSettings },
      { startCityGeneration }, { renderEditorSvg }, { serializeDocument, parseDocument }] = await Promise.all([
      load("generators/document.ts"), load("generators/populationPlan.ts"), load("generators/generation/settings.ts"),
      load("services/generationWorkerClient.ts"), load("renderers/editorSvg.ts"), load("services/io/documentCodec.ts")
    ]);
    const input = createGridDocument({ size: "small", grid: "voronoi", seed: "paris-population" });
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const rows = [];
    const makeSettings = mode => {
      const settings = defaultGenerationSettings();
      settings.config.coast = "none";
      settings.config.rivers = [];
      settings.config.features = { walls: true, citadel: false, plaza: true, temple: true, port: false, shanty: false };
      settings.layout = "organic";
      settings.historicalPeriod = "lateMedieval";
      settings.population = { ...defaultPopulationSettings(150000), housingDisplay: mode };
      return settings;
    };
    for (const mode of ["cluster-20", "cluster-10", "detailed"]) {
      // One warm-up followed by five measured samples, with a fresh real worker each time.
      for (let run = 0; run < 6; run++) {
        const start = performance.now();
        const city = await startCityGeneration({ document: input, settings: makeSettings(mode), seed: "paris-population" }, () => {}).result;
        if (!city) throw new Error(`Generation rejected: ${mode}`);
        const generationMs = performance.now() - start;
        const renderStart = performance.now();
        const svg = renderEditorSvg(city, "select", { faceId: null, edgeId: null, vertexId: null, groupId: null },
          "-2400 -2400 4800 4800", 1, false, null, null, null, null, false, false, undefined, false, false, "auto");
        const svgBuildMs = performance.now() - renderStart;
        const host = document.createElement("div");
        host.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none";
        svg.style.cssText = "width:100%;height:100%";
        host.append(svg); document.body.append(host);
        const paintStart = performance.now();
        await frame(); await frame();
        const firstPaintMs = performance.now() - paintStart;
        const frames = [];
        for (let i = 0; i < 20; i++) {
          const frameStart = performance.now();
          svg.setAttribute("viewBox", `${-2400 + i * 2} -2400 4800 4800`);
          await frame(); frames.push(performance.now() - frameStart);
        }
        const saveStart = performance.now();
        const text = serializeDocument(city);
        const saveMs = performance.now() - saveStart;
        const loadStart = performance.now();
        if (!parseDocument(text)) throw new Error("Saved population document failed validation");
        const loadMs = performance.now() - loadStart;
        if (run) rows.push({ mode, run, generationMs, svgBuildMs, firstPaintMs, saveMs, loadMs,
          frameP95Ms: frames.sort((a, b) => a - b)[19], nodes: svg.querySelectorAll("*").length,
          bytes: new TextEncoder().encode(text).length, report: city.populationReport });
        host.remove();
      }
    }
    const job = startCityGeneration({ document: input, settings: makeSettings("cluster-20"), seed: "cancel-population" }, () => {});
    await new Promise(resolve => setTimeout(resolve, 30));
    const cancelStart = performance.now(); job.cancel();
    try { await job.result; } catch (error) { if (error.name !== "AbortError") throw error; }
    return { seed: "paris-population", rows, cancelMs: performance.now() - cancelStart, userAgent: navigator.userAgent };
  });
  result.source = { commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() };
  result.environment = { platform: platform(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem() };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  for (const mode of ["cluster-20", "cluster-10", "detailed"]) {
    const rows = result.rows.filter(row => row.mode === mode);
    const median = key => rows.map(row => row[key]).sort((a, b) => a - b)[2].toFixed(1);
    console.log(`${mode}: generation ${median("generationMs")}ms, SVG ${median("svgBuildMs")}ms, pan p95 ${median("frameP95Ms")}ms`);
  }
  console.log(`Saved ${output}; cancellation ${result.cancelMs.toFixed(1)}ms`);
} finally {
  await browser.close();
}
