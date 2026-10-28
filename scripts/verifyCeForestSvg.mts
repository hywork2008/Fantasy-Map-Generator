/** Fixed one-city F2 check: node --import tsx scripts/verifyCeForestSvg.mts */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createGridDocument } from "../src/city-editor/generators/document";
import { withForestSettings } from "../src/city-editor/generators/forestLandCover";
import { generateCityOnDocument } from "../src/city-editor/generators/generation/generateCity";
import { defaultGenerationSettings } from "../src/city-editor/generators/generation/settings";
import type { CityDocument } from "../src/city-editor/types/document";

const rawPath = "docs/analytics/raw/ce-forest-f0/small-flat.json";
let original: CityDocument;
if (existsSync(rawPath)) original = JSON.parse(readFileSync(rawPath, "utf8"));
else {
  const seed = "ce-forest-f0-small-v1";
  const input = createGridDocument({ size: "small", grid: "evolution", seed });
  input.biome = { id: 6, key: "temperateDeciduousForest", name: "Temperate deciduous forest", color: "#29bc56" };
  const settings = defaultGenerationSettings();
  settings.config.rivers = [];
  settings.historicalPeriod = "highMedieval";
  settings.buildingPattern = "medieval";
  original = generateCityOnDocument(input, settings, seed)!;
  if (!original) throw new Error("Fixed city generation failed");
}
const forest = withForestSettings(original, { version: 1, mode: "surroundings", density: "standard" });
const output = resolve("docs/analytics/ce-forest-f2");
mkdirSync(output, { recursive: true });
const vectorOutput = resolve("docs/analytics/raw/ce-forest-f2");
mkdirSync(vectorOutput, { recursive: true });
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5200, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/forest-f2.html", route =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0;background:#d5cfbf}svg{display:block;width:1000px;height:1000px}</style><body></body>"
    })
  );
  await page.goto("http://127.0.0.1:5200/forest-f2.html");
  const result = await page.evaluate(
    async ({ original, forest }) => {
      // @ts-expect-error Browser imports are served by the local Vite server.
      const { renderEditorSvg } = await import("/src/city-editor/renderers/editorSvg.ts");
      // @ts-expect-error Browser imports are served by the local Vite server.
      const { renderStandaloneCitySvg, STANDALONE_SVG_STYLE } = await import(
        "/src/city-editor/renderers/standaloneSvg.ts"
      );
      const style = document.createElement("style");
      style.textContent = STANDALONE_SVG_STYLE;
      document.head.appendChild(style);
      const results = [];
      for (const mode of ["legacy", "edge-fill", "all-trees"]) {
        const city = mode === "legacy" ? original : forest;
        const extent = city.frame.extentMeters;
        for (const quality of mode === "legacy" ? ["detailed"] : ["detailed", "light", "minimal"]) {
          const samples = [];
          for (let pass = 0; pass < 4; pass++) {
            const at = performance.now();
            const svg = renderEditorSvg(
              city,
              "select",
              { faceId: null, edgeId: null, vertexId: null, groupId: null },
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
              quality,
              false,
              { core: true, regional: true },
              undefined,
              { representation: mode === "all-trees" ? "all-trees" : "edge-fill" }
            );
            const buildMs = performance.now() - at;
            const attached = performance.now();
            document.body.replaceChildren(svg);
            svg.getBoundingClientRect();
            const attachLayoutMs = performance.now() - attached;
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            const layer = svg.querySelector(".ce-forest-layer");
            const metrics = {
              buildMs,
              attachLayoutMs,
              nodes: svg.querySelectorAll("*").length,
              forestNodes: layer?.querySelectorAll("*").length ?? 0,
              trees: layer?.querySelectorAll("use").length ?? 0,
              forestAreaM2: Number(layer?.getAttribute("data-forest-area-m2") ?? 0),
              svgBytes: new TextEncoder().encode(new XMLSerializer().serializeToString(svg)).length
            };
            if (pass) samples.push(metrics);
            const limit = quality === "minimal" ? 1 : quality === "light" ? 3000 : 8000;
            if (metrics.forestNodes > limit) throw new Error(`Forest budget exceeded: ${mode}/${quality}`);
            if (mode !== "legacy" && !layer) throw new Error("Forest layer missing");
          }
          results.push({ mode, quality, samples });
        }
      }
      // Keep a callable export on this isolated harness page for screenshots and XML validation.
      (window as typeof window & { forestExport?: (representation: string) => string }).forestExport =
        representation => {
          const svg = renderStandaloneCitySvg(forest, false, undefined, { representation });
          document.body.replaceChildren(svg);
          for (const use of svg.querySelectorAll(".ce-forest-layer use")) {
            if (!svg.querySelector(use.getAttribute("href")!)) throw new Error("Missing tree symbol in static export");
          }
          return new XMLSerializer().serializeToString(svg);
        };
      return { userAgent: navigator.userAgent, results };
    },
    { original, forest }
  );
  const exports: { path: string; bytes: number; sha256: string }[] = [];
  for (const representation of ["edge-fill", "all-trees"]) {
    const xml = await page.evaluate(
      mode => (window as typeof window & { forestExport: (mode: string) => string }).forestExport(mode),
      representation
    );
    const data = xml + "\n";
    const path = `docs/analytics/raw/ce-forest-f2/${representation}.svg`;
    writeFileSync(resolve(vectorOutput, `${representation}.svg`), data);
    exports.push({ path, bytes: Buffer.byteLength(data), sha256: createHash("sha256").update(data).digest("hex") });
    await page.screenshot({ path: resolve(output, `${representation}.png`) });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    resolve(output, "results.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        environment: {
          cpu: os.cpus()[0].model,
          node: process.version,
          viewport: [1000, 1000],
          dpr: 1,
          timing:
            "Browser CPU construction and synchronous attach/layout, one warmup + three samples; excludes paint/GPU completion and is not interactive FPS."
        },
        fixture: {
          seed: original.generationSeed,
          source: existsSync(rawPath) ? rawPath : "regenerated-fixed-recipe",
          documentSha256: createHash("sha256").update(JSON.stringify(original)).digest("hex")
        },
        exports,
        ...result
      },
      null,
      2
    ) + "\n"
  );
  console.log(`Wrote ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
