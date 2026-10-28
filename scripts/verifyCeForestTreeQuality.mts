/** Compare CE standard/high forest trees: node --import tsx scripts/verifyCeForestTreeQuality.mts */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import type { CityDocument } from "../src/city-editor/types/document";
const output = resolve("docs/analytics/ce-forest-bv-trees");
mkdirSync(output, { recursive: true });
const raw = readFileSync("docs/analytics/raw/ce-forest-f0/small-flat.json");
const original: CityDocument = JSON.parse(raw.toString());
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5204, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const results: unknown[] = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  for (const biome of ["temperateDeciduousForest", "temperateRainforest", "taiga", "tropicalRainforest"]) {
    console.error(`Forest BV ${biome}`);
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript({ content: "globalThis.__name = (fn) => fn;" });
    await page.route("**/forest-trees.html", r =>
      r.fulfill({
        contentType: "text/html",
        body: "<!doctype html><style>body{margin:0;background:#d5cfbf}#host{position:relative;width:1000px;height:720px}.ce-3d{position:absolute;inset:0}.ce-3d-canvas{display:block;width:100%;height:100%}[hidden]{display:none!important}button,details,output{display:none}</style><div id='host'><div id='map'></div></div>"
      })
    );
    await page.goto("http://127.0.0.1:5204/forest-trees.html");
    const setup = await page.evaluate(
      async ({ original, biome }) => {
        // @ts-expect-error Vite browser module.
        const { mountCity3d } = await import("/src/city-editor/renderers/cityView.ts");
        // @ts-expect-error Vite browser module.
        const { withForestSettings } = await import("/src/city-editor/generators/forestLandCover.ts");
        // @ts-expect-error Vite browser module.
        const { renderStandaloneCitySvg } = await import("/src/city-editor/renderers/standaloneSvg.ts");
        const city = withForestSettings(
          { ...original, biome: { id: 1, key: biome, name: biome, color: "#567d48" } },
          { version: 1, mode: "surroundings", density: "standard" }
        );
        const area = Number(
          renderStandaloneCitySvg(city).querySelector(".ce-forest-layer")?.getAttribute("data-forest-area-m2")
        );
        let quality = "standard";
        const cleanups: (() => void)[] = [];
        const view = mountCity3d({
          canvasHost: document.querySelector("#host")!,
          map: document.querySelector("#map")!,
          getDocument: () => city,
          getModelQuality: () => "high",
          getForestQuality: () => quality,
          scope: {
            own: (fn: () => void) => cleanups.push(fn),
            listen: (t: EventTarget, type: string, fn: EventListener) => {
              t.addEventListener(type, fn);
              cleanups.push(() => t.removeEventListener(type, fn));
            }
          }
        });
        const r = city.frame.cityRadiusMeters;
        const pose = { position: [r + 70, 18, 70], target: [r, 7, 0], zoom: 1, fov: 45 };
        view.restoreView(pose);
        const next = () => new Promise<number>(resolve => requestAnimationFrame(() => resolve(performance.now())));
        await next();
        await next();
        const gl = document.querySelector("canvas")!.getContext("webgl2")!,
          debug = gl.getExtension("WEBGL_debug_renderer_info");
        const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        if (/swiftshader|llvmpipe|software/i.test(renderer)) throw new Error(`Hardware GPU required: ${renderer}`);
        (window as any).probe = {
          view,
          pose,
          next,
          area,
          gl,
          setQuality: (v: string) => {
            quality = v;
            view.sync();
          },
          dispose: () => {
            view.dispose();
            cleanups.reverse().forEach(f => f());
          }
        };
        return { renderer, area, userAgent: navigator.userAgent };
      },
      { original, biome }
    );
    const cases = [];
    for (const quality of ["standard", "high"]) {
      const data = await page.evaluate(async quality => {
        const p = (window as any).probe;
        p.setQuality(quality);
        await p.next();
        const firstCpu = p.view.getFramePerformance().frame.cpuMs;
        const cpu: number[] = [],
          interval: number[] = [];
        let previous = await p.next();
        for (let i = 0; i < 40; i++) {
          const pose = { ...p.pose, position: [...p.pose.position] };
          pose.position[0] += (i % 2) * 0.02;
          p.view.restoreView(pose);
          const now = await p.next();
          const snapshot = p.view.getFramePerformance();
          if (i >= 8) {
            cpu.push(snapshot.frame.cpuMs);
            interval.push(now - previous);
          }
          previous = now;
        }
        const snapshot = p.view.getFramePerformance(),
          s = snapshot.forest;
        if (s.areaM2 !== p.area) throw new Error("Forest area changed");
        const limit = quality === "high" ? [800000, 256, 150000] : [300000, 128, 50000];
        if (s.triangles > limit[0] || s.calls > limit[1] || s.shadowTriangles > limit[2])
          throw new Error("Forest budget exceeded");
        if (quality === "high" && !s.detailedTrees) throw new Error("High quality did not show BV trees");
        if (quality !== "high" && s.detailedTrees) throw new Error("Standard quality showed BV trees");
        if (p.gl.getError() !== p.gl.NO_ERROR || p.gl.isContextLost()) throw new Error("WebGL error");
        return { quality, firstCpu, cpuMs: cpu, intervalMs: interval, snapshot };
      }, quality);
      cases.push(data);
      await page.screenshot({ path: resolve(output, `${biome}-${quality}.png`) });
    }
    const memory = await page.evaluate(async () => {
      const p = (window as any).probe,
        counts = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const q of ["standard", "light", "high"]) {
          p.setQuality(q);
          await p.next();
          await p.next();
        }
        counts.push(p.view.getFramePerformance().frame.geometries);
      }
      p.dispose();
      return counts;
    });
    assert.equal(memory[1], memory[2]);
    assert.deepEqual(errors, []);
    results.push({ biome, ...setup, cases, memory, errors });
    await page.close();
  }
  writeFileSync(
    resolve(output, "results.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        inputSha256: createHash("sha256").update(raw).digest("hex"),
        viewport: [1000, 720],
        dpr: 1,
        timing: "CPU submission and headless RAF intervals; not GPU completion or display FPS",
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
