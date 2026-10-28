/** Fixed flat + valley F3 check: node --import tsx scripts/verifyCeForest3d.mts */
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

const output = resolve("docs/analytics/ce-forest-f3");
mkdirSync(output, { recursive: true });
const fixtures = [
  { id: "small-flat", seed: "ce-forest-f0-small-v1", rivers: [] as "through"[], elevation: "flat" as const },
  {
    id: "small-river-valley",
    seed: "ce-forest-f0-valley-v1",
    rivers: ["through"] as "through"[],
    elevation: "valley" as const
  }
];
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5201, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const results: unknown[] = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const fixture of fixtures) {
    console.error(`Checking ${fixture.id}`);
    const raw = `docs/analytics/raw/ce-forest-f0/${fixture.id}.json`;
    let original: CityDocument;
    if (existsSync(raw)) original = JSON.parse(readFileSync(raw, "utf8"));
    else {
      const input = createGridDocument({ size: "small", grid: "evolution", seed: fixture.seed });
      input.biome = { id: 6, key: "temperateDeciduousForest", name: "Temperate deciduous forest", color: "#29bc56" };
      const settings = defaultGenerationSettings();
      settings.config.rivers = fixture.rivers;
      settings.historicalPeriod = "highMedieval";
      settings.buildingPattern = "medieval";
      settings.elevationPreset = fixture.elevation;
      original = generateCityOnDocument(input, settings, fixture.seed)!;
      if (!original) throw new Error("Fixed city generation failed");
    }
    const city = withForestSettings(original, { version: 1, mode: "surroundings", density: "standard" });
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 1 });
    // tsx preserves callback names with this helper when serializing page.evaluate functions.
    await page.addInitScript({ content: "globalThis.__name = (fn) => fn;" });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/forest-f3.html", route =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><style>body{margin:0}#host{position:relative;width:1000px;height:720px}.ce-3d{position:absolute;inset:0}.ce-3d-canvas{display:block;width:100%;height:100%}[hidden]{display:none!important}button,output,details{display:none}</style><body><div id='host'><div id='map'></div></div></body>"
      })
    );
    await page.goto("http://127.0.0.1:5201/forest-f3.html");
    const setup = await page.evaluate(async city => {
      // @ts-expect-error Vite serves browser-only modules from the project root.
      const { mountCity3d } = await import("/src/city-editor/renderers/cityView.ts");
      // @ts-expect-error Vite serves browser-only modules from the project root.
      const { renderStandaloneCitySvg } = await import("/src/city-editor/renderers/standaloneSvg.ts");
      // @ts-expect-error Vite serves browser-only modules from the project root.
      const { cityTerrain } = await import("/src/city-editor/generators/terrainElevation.ts");
      const area2d = Number(
        renderStandaloneCitySvg(city).querySelector(".ce-forest-layer")?.getAttribute("data-forest-area-m2")
      );
      let quality: "light" | "standard" | "high" = "standard";
      const cleanups: (() => void)[] = [];
      const view = mountCity3d({
        canvasHost: document.querySelector("#host")!,
        map: document.querySelector("#map")!,
        getDocument: () => city,
        getForestQuality: () => quality,
        scope: {
          own: (fn: () => void) => cleanups.push(fn),
          listen: (target: EventTarget, type: string, fn: EventListener) => {
            target.addEventListener(type, fn);
            cleanups.push(() => target.removeEventListener(type, fn));
          }
        }
      });
      const terrain = cityTerrain(city),
        radius = city.frame.cityRadiusMeters;
      const poses = {
        overview: { position: [radius * 0.8, radius * 1.4, radius * 1.5], target: [0, 0, 0], zoom: 1, fov: 45 },
        edge: {
          position: [radius + 100, terrain.heightAt([radius, 0]) + 65, 100],
          target: [radius, terrain.heightAt([radius, 0]), 0],
          zoom: 1,
          fov: 45
        }
      };
      const at = performance.now();
      view.restoreView(poses.overview);
      const mountMs = performance.now() - at;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const canvas = document.querySelector("canvas")!,
        gl = canvas.getContext("webgl2")!;
      if (!gl || gl.isContextLost()) throw new Error("WebGL unavailable");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      (window as any).forestProbe = {
        view,
        poses,
        area2d,
        gl,
        quality: (value: "light" | "standard" | "high") => {
          quality = value;
          view.sync();
        },
        dispose: () => {
          view.dispose();
          cleanups.reverse().forEach(fn => fn());
        }
      };
      return {
        mountMs,
        area2d,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        userAgent: navigator.userAgent
      };
    }, city);
    const cases: unknown[] = [];
    for (const quality of ["standard", "light", "high"] as const)
      for (const pose of ["overview", "edge"] as const) {
        console.error(`${fixture.id}: ${quality}/${pose}`);
        const measured = await page.evaluate(
          async ({ quality, pose }) => {
            const probe = (window as any).forestProbe;
            probe.quality(quality);
            probe.view.restoreView(probe.poses[pose]);
            const samples = [];
            for (let i = 0; i < 10; i++) {
              const saved = { ...probe.poses[pose], position: [...probe.poses[pose].position] };
              saved.position[0] += i * 0.01;
              probe.view.restoreView(saved);
              await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
              const snapshot = probe.view.getPerformance();
              if (i >= 2) samples.push(snapshot.frame.cpuMs);
            }
            const snapshot = probe.view.getPerformance();
            const limits = {
              light: [2000, 100000, 64, 0],
              standard: [8000, 300000, 128, 50000],
              high: [20000, 800000, 256, 150000]
            }[quality];
            const s = snapshot.forest;
            if (!s || Math.abs(s.areaM2 - probe.area2d) > 1e-5) throw new Error("2D/3D forest area mismatch");
            if (s.trees > limits[0] || s.triangles > limits[1] || s.calls > limits[2] || s.shadowTriangles > limits[3])
              throw new Error("Forest budget exceeded");
            if (probe.gl.isContextLost() || probe.gl.getError() !== probe.gl.NO_ERROR) throw new Error("WebGL error");
            return { quality, pose, samplesCpuSubmitMs: samples, snapshot };
          },
          { quality, pose }
        );
        cases.push(measured);
        if (quality === "standard") await page.screenshot({ path: resolve(output, `${fixture.id}-${pose}.png`) });
      }
    const memory = await page.evaluate(async () => {
      const probe = (window as any).forestProbe,
        results = [];
      for (let i = 0; i < 3; i++) {
        for (const quality of ["standard", "light", "high"]) {
          probe.quality(quality);
          probe.view.restoreView(probe.poses.edge);
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
        results.push(probe.view.getPerformance().frame.geometries);
      }
      probe.dispose();
      return results;
    });
    if (memory[1] !== memory[2]) throw new Error("Resident geometry did not stabilize");
    if (errors.length) throw new Error(errors.join("\n"));
    results.push({
      fixture,
      inputSha256: createHash("sha256").update(JSON.stringify(original)).digest("hex"),
      ...setup,
      cases,
      repeatedQualityGeometryCounts: memory
    });
    await page.close();
  }
  writeFileSync(
    resolve(output, "results.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        environment: {
          cpu: os.cpus()[0].model,
          node: process.version,
          viewport: [1000, 720],
          dpr: 1,
          timing: "Real CE CPU submit time; not GPU completion, interactive FPS or a 33 ms acceptance test."
        },
        results
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
