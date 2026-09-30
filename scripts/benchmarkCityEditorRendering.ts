/** node --import tsx scripts/benchmarkCityEditorRendering.ts [--size=large] [--grid=evolution] [--seed=render-quality] */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createGridDocument, type CitySizePreset, type GridKind } from "../src/city-editor/core/document";
import { defaultGenerationSettings, generateCityOnDocument } from "../src/city-editor/core/generate";
import { renderEditorSvg, type RenderQuality } from "../src/city-editor/render/svg";

const option = (name: string, fallback: string) =>
  process.argv
    .find(v => v.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const size = option("size", "large") as CitySizePreset;
const grid = option("grid", "evolution") as GridKind;
const seed = option("seed", "render-quality");
const pattern = option("pattern", "legacy") as "legacy" | "medieval";
const out = resolve(option("out", "/tmp/ce-render-quality"));
mkdirSync(out, { recursive: true });
const dom = new JSDOM("<!doctype html><body></body>");
Object.assign(globalThis, { document: dom.window.document });
const started = performance.now();
const input = createGridDocument({ size, grid, seed });
const settings = defaultGenerationSettings();
settings.buildingPattern = pattern;
const city = generateCityOnDocument(input, settings, seed);
if (!city) throw new Error("City generation failed");
const generationMs = performance.now() - started;
console.error(`Generation: ${Math.round(generationMs)} ms`);
const extent = city.frame.extentMeters;
const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
const css = readFileSync(resolve("src/city-editor/index.html"), "utf8").match(/<style>([\s\S]*?)<\/style>/)![1];
const results = [];
const qualities: RenderQuality[] = ["detailed", "light", "minimal"];
const times = new Map(qualities.map(q => [q, [] as number[]]));
// Rotate order to reduce warm-cache and GC order bias. First pass warms all modes.
for (let pass = 0; pass < 4; pass++) {
  for (let i = 0; i < qualities.length; i++) {
    const quality = qualities[(i + pass) % qualities.length];
    const start = performance.now();
    const svg = renderEditorSvg(
      city,
      "select",
      selection,
      `${-extent / 2} ${-extent / 2} ${extent} ${extent}`,
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
      quality
    );
    const renderMs = performance.now() - start;
    if (pass) times.get(quality)!.push(renderMs);
    if (pass === 3) {
      results.push({
        quality,
        nodes: svg.querySelectorAll("*").length,
        buildingPaths: svg.querySelectorAll(".ce-building").length,
        buildingPolygons: [...svg.querySelectorAll(".ce-building")].reduce(
          (n, p) => n + (p.getAttribute("d")?.match(/Z/g)?.length ?? 0),
          0
        ),
        svgBytes: Buffer.byteLength(svg.outerHTML),
        renderMedianMs: times.get(quality)!.sort((a, b) => a - b)[1]
      });
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", "1000");
      svg.setAttribute("height", "1000");
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = css;
      svg.prepend(style);
      writeFileSync(resolve(out, `${quality}.svg`), svg.outerHTML);
    }
  }
}
const report = {
  size,
  grid,
  seed,
  pattern,
  generationMs,
  faces: Object.keys(city.mesh.faces).length,
  environment: "Node + jsdom; render timings exclude layout/paint, warmed median of 3",
  results
};
writeFileSync(resolve(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
dom.window.close();
