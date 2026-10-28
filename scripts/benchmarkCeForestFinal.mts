/** F5 fixed-input GPU check: node --import tsx scripts/benchmarkCeForestFinal.mts */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import type { CityDocument } from "../src/city-editor/types/document";

const shadows = process.env.CE_FOREST_SHADOWS === "1";
const housingQuality = process.env.CE_FOREST_HOUSING === "high" ? "high" : "standard";
const output = resolve(process.env.CE_FOREST_OUTPUT ?? "docs/analytics/ce-forest-f5");
mkdirSync(output, { recursive: true });
const percentile = (a: number[], p: number) =>
  [...a].sort((a, b) => a - b)[Math.max(0, Math.ceil(a.length * p) - 1)] ?? null;
const summary = (a: number[]) => ({
  n: a.length,
  p50: percentile(a, 0.5),
  p95: percentile(a, 0.95),
  max: a.length ? Math.max(...a) : null
});
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5203, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const results: unknown[] = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  for (const id of ["small-flat", "medium-flat", "small-river-valley"]) {
    console.error(`F5 ${id}`);
    const raw = readFileSync(`docs/analytics/raw/ce-forest-f0/${id}.json`);
    const original: CityDocument = JSON.parse(raw.toString());
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript({ content: "globalThis.__name = (fn) => fn;" });
    await page.route("**/forest-f5.html", route =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><style>body{margin:0;background:#d5cfbf}#host{position:relative;width:1000px;height:720px}#map,svg{width:100%;height:100%}.ce-3d{position:absolute;inset:0}.ce-3d-canvas{display:block;width:100%;height:100%}[hidden]{display:none!important}button,output,details{display:none}</style><div id='host'><div id='map'></div></div>"
      })
    );
    await page.goto("http://127.0.0.1:5203/forest-f5.html");
    await page.evaluate(async original => {
      // @ts-expect-error Browser module served by Vite.
      const { withForestSettings } = await import("/src/city-editor/generators/forestLandCover.ts");
      // @ts-expect-error Browser module served by Vite.
      const { renderStandaloneCitySvg } = await import("/src/city-editor/renderers/standaloneSvg.ts");
      // @ts-expect-error Browser module served by Vite.
      const { updateForestScale } = await import("/src/city-editor/renderers/forestSvg.ts");
      // @ts-expect-error Browser module served by Vite.
      const { mountCity3d } = await import("/src/city-editor/renderers/cityView.ts");
      // @ts-expect-error Browser module served by Vite.
      const { cityTerrain } = await import("/src/city-editor/generators/terrainElevation.ts");
      const city = withForestSettings(original, { version: 1, mode: "surroundings", density: "standard" });
      const map = document.querySelector<HTMLElement>("#map")!,
        host = document.querySelector<HTMLElement>("#host")!;
      const next = () => new Promise<number>(resolve => requestAnimationFrame(() => resolve(performance.now())));
      const terrain = cityTerrain(city),
        r = city.frame.cityRadiusMeters;
      const edgePoint = [r, 0],
        h = terrain.heightAt(edgePoint);
      const poses = {
        overview: { position: [r * 0.8, r * 1.4, r * 1.5], target: [0, 0, 0], zoom: 1, fov: 45 },
        edge: { position: [r + 100, h + 65, 100], target: [r, h, 0], zoom: 1, fov: 45 },
        low: { position: [r + 70, h + 16, 70], target: [r, h + 6, 0], zoom: 1, fov: 45 }
      };
      (window as any).probe = {
        original,
        city,
        map,
        host,
        next,
        poses,
        renderStandaloneCitySvg,
        updateForestScale,
        mountCity3d
      };
    }, original);
    const two = [];
    for (const representation of ["legacy", "edge-fill", "all-trees"]) {
      console.error(`${id} 2D ${representation}`);
      const data = await page.evaluate(async representation => {
        const p = (window as any).probe;
        const doc = representation === "legacy" ? p.original : p.city;
        const builds: number[] = [];
        let svg!: SVGSVGElement;
        for (let i = 0; i < 4; i++) {
          const at = performance.now();
          svg = p.renderStandaloneCitySvg(doc, false, undefined, {
            representation: representation === "legacy" ? "edge-fill" : representation
          });
          builds.push(performance.now() - at);
        }
        const at = performance.now();
        p.map.replaceChildren(svg);
        svg.getBoundingClientRect();
        await p.next();
        const attachMs = performance.now() - at;
        const layer = svg.querySelector(".ce-forest-layer"),
          areaM2 = Number(layer?.getAttribute("data-forest-area-m2") ?? 0);
        const text = new XMLSerializer().serializeToString(svg),
          bytes = new TextEncoder().encode(text);
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b =>
          b.toString(16).padStart(2, "0")
        ).join("");
        const intervals: number[] = [];
        let prev = await p.next();
        const extent = doc.frame.extentMeters;
        for (let i = 0; i < 32; i++) {
          const z = 1 + i * 0.012;
          svg.setAttribute("viewBox", `${-extent / 2 + i} ${-extent / 2} ${extent / z} ${extent / z}`);
          p.updateForestScale(svg, extent, z, 1000);
          const now = await p.next();
          if (i >= 4) intervals.push(now - prev);
          prev = now;
        }
        svg.setAttribute("viewBox", `${-extent / 2} ${-extent / 2} ${extent} ${extent}`);
        p.area2d = areaM2 || p.area2d;
        p.svg = svg;
        return {
          representation,
          buildsMs: builds,
          attachMs,
          panZoomIntervalsMs: intervals,
          areaM2,
          forestElements: layer?.querySelectorAll("*").length ?? 0,
          allElements: svg.querySelectorAll("*").length,
          exportBytes: bytes.length,
          exportSha256: sha256,
          identityRetained: p.map.firstChild === svg
        };
      }, representation);
      assert.ok(data.forestElements <= 8000);
      two.push({ ...data, buildWarm: summary(data.buildsMs.slice(1)), panZoom: summary(data.panZoomIntervalsMs) });
      if (!shadows && housingQuality === "standard")
        await page.screenshot({ path: resolve(output, `${id}-2d-${representation}.png`) });
    }
    assert.equal(two[1].areaM2, two[2].areaM2);
    const three = [];
    for (const quality of shadows || housingQuality === "high"
      ? ["legacy", "standard"]
      : ["legacy", "light", "standard", "high"]) {
      console.error(`${id} 3D ${quality}`);
      const setup = await page.evaluate(
        async ({ quality, shadows, housingQuality }) => {
          const p = (window as any).probe;
          const reuse = housingQuality === "high" && quality !== "legacy";
          if (!reuse) p.view?.dispose();
          p.map.replaceChildren();
          p.currentCity = quality === "legacy" ? p.original : p.city;
          const cleanups: (() => void)[] = [];
          p.quality = quality === "legacy" ? "standard" : quality;
          const at = performance.now();
          if (reuse) p.view.sync();
          else
            p.view = p.mountCity3d({
              canvasHost: p.host,
              map: p.map,
              getDocument: () => p.currentCity,
              getModelQuality: () => housingQuality,
              getForestQuality: () => p.quality,
              scope: {
                own: (fn: () => void) => cleanups.push(fn),
                listen: (t: EventTarget, type: string, fn: EventListener) => {
                  t.addEventListener(type, fn);
                  cleanups.push(() => t.removeEventListener(type, fn));
                }
              }
            });
          p.view.restoreView(p.poses.overview);
          if (shadows) {
            const enabled = p.host.querySelector<HTMLInputElement>('.ce-sun-controls [name="enabled"]')!;
            enabled.checked = true;
            enabled.dispatchEvent(new Event("change"));
          }
          const mountMs = performance.now() - at;
          await p.next();
          await p.next();
          if (!reuse)
            p.cleanup = () => {
              p.view.dispose();
              cleanups.reverse().forEach(fn => fn());
            };
          const gl = p.host.querySelector("canvas").getContext("webgl2") as WebGL2RenderingContext;
          const debug = gl.getExtension("WEBGL_debug_renderer_info"),
            timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
          const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
          if (!timer || /swiftshader|llvmpipe/i.test(renderer)) throw new Error(`Real GPU required: ${renderer}`);
          p.gl = gl;
          p.timer = timer;
          p.activeQuery = null;
          p.timing = false;
          if (p.instrumentedContext !== gl)
            for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
              const original = (gl as any)[name].bind(gl);
              (gl as any)[name] = (...args: unknown[]) => {
                if (p.timing && !p.activeQuery) {
                  p.activeQuery = gl.createQuery();
                  gl.beginQuery(timer.TIME_ELAPSED_EXT, p.activeQuery);
                }
                return original(...args);
              };
            }
          p.instrumentedContext = gl;
          return { mountMs, reusedContext: reuse, renderer, timer: true };
        },
        { quality, shadows, housingQuality }
      );
      const segments = [];
      for (const pose of ["overview", "edge", "low"]) {
        const measured = await page.evaluate(async pose => {
          const p = (window as any).probe;
          const cpu: number[] = [],
            interval: number[] = [],
            gpu: number[] = [],
            cameraCpu: number[] = [],
            queries: WebGLQuery[] = [];
          let previous = 0;
          const stats: unknown[] = [];
          p.view.restoreView(p.poses[pose]);
          await p.next();
          await p.next();
          for (let i = 0; i < 76; i++) {
            const saved = { ...p.poses[pose], position: [...p.poses[pose].position] };
            saved.position[0] += Math.sin((i / 75) * Math.PI * 2) * 24;
            saved.position[2] += Math.cos((i / 75) * Math.PI * 2) * 12;
            p.timing = i >= 12;
            const at = performance.now();
            p.view.restoreView(saved);
            const cameraMs = performance.now() - at;
            const now = await p.next();
            if (p.activeQuery) {
              p.gl.endQuery(p.timer.TIME_ELAPSED_EXT);
              queries.push(p.activeQuery);
              p.activeQuery = null;
            }
            if (i >= 12) {
              const snapshot = p.view.getFramePerformance();
              cpu.push(snapshot.frame.cpuMs);
              cameraCpu.push(cameraMs);
              interval.push(now - previous);
              stats.push({ forest: snapshot.forest, frame: snapshot.frame });
            }
            previous = now;
          }
          p.timing = false;
          // Poll completion without blocking the measured path or using gl.finish().
          for (let i = 0; i < 120 && queries.some(q => !p.gl.getQueryParameter(q, p.gl.QUERY_RESULT_AVAILABLE)); i++)
            await p.next();
          const disjoint = p.gl.getParameter(p.timer.GPU_DISJOINT_EXT);
          for (const q of queries) {
            if (!disjoint && p.gl.getQueryParameter(q, p.gl.QUERY_RESULT_AVAILABLE))
              gpu.push(p.gl.getQueryParameter(q, p.gl.QUERY_RESULT) / 1e6);
            p.gl.deleteQuery(q);
          }
          if (disjoint) throw new Error("Disjoint GPU samples");
          if (p.gl.isContextLost() || p.gl.getError() !== p.gl.NO_ERROR) throw new Error("WebGL error");
          return { pose, cpuMs: cpu, intervalMs: interval, gpuMs: gpu, cameraUpdateMs: cameraCpu, stats };
        }, pose);
        const data = {
          ...measured,
          cpu: summary(measured.cpuMs),
          interval: summary(measured.intervalMs),
          gpu: summary(measured.gpuMs),
          cameraUpdate: summary(measured.cameraUpdateMs)
        };
        assert.equal(data.gpu.n, 64);
        for (const entry of data.stats as any[]) {
          if (quality === "legacy") continue;
          const limits = {
            light: [2000, 100000, 64, 0],
            standard: [8000, 300000, 128, 50000],
            high: [20000, 800000, 256, 150000]
          }[quality]!;
          const s = entry.forest;
          assert.equal(s.areaM2, two[1].areaM2);
          for (const [i, k] of ["trees", "triangles", "calls", "shadowTriangles"].entries())
            assert.ok(s[k] <= limits[i], `${id}/${quality}/${pose}/${k}`);
        }
        segments.push(data);
        if (quality === "standard") await page.screenshot({ path: resolve(output, `${id}-3d-${pose}.png`) });
      }
      const memory =
        quality === "legacy"
          ? null
          : await page.evaluate(async () => {
              const p = (window as any).probe,
                counts = [];
              for (let cycle = 0; cycle < 3; cycle++) {
                for (const quality of ["light", "standard", "high"]) {
                  p.quality = quality;
                  p.view.sync();
                  for (const pose of ["overview", "edge", "low"]) {
                    p.view.restoreView(p.poses[pose]);
                    await p.next();
                  }
                }
                p.host.querySelector<HTMLButtonElement>(".ce-view-toggle")!.click();
                p.host.querySelector<HTMLButtonElement>(".ce-view-toggle")!.click();
                await p.next();
                const s = p.view.getFramePerformance();
                counts.push({
                  geometries: s.frame.geometries,
                  textures: s.frame.textures,
                  forestLayers: s.forest.cachedLayers
                });
              }
              return counts;
            });
      if (memory) {
        assert.deepEqual(memory[1], memory[2]);
      }
      three.push({ quality, ...setup, segments, memory });
      if (housingQuality !== "high" || quality !== "legacy")
        await page.evaluate(() => {
          (window as any).probe.cleanup();
        });
    }
    assert.deepEqual(errors, []);
    results.push({ id, inputSha256: createHash("sha256").update(raw).digest("hex"), two, three, errors });
    const report = {
      date: new Date().toISOString(),
      revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      environment: {
        cpu: os.cpus()[0].model,
        node: process.version,
        viewport: [1000, 720],
        dpr: 1,
        shadows,
        housingQuality,
        gpuTiming: "EXT_disjoint_timer_query_webgl2: first draw to end of render, async completion, no gl.finish",
        sampling: "12 warm-up + 64 measured frames at each of 3 camera poses; includes measured LOD stalls"
      },
      results
    };
    const rawDir = resolve("docs/analytics/raw/ce-forest-f5");
    mkdirSync(rawDir, { recursive: true });
    const rawFile = resolve(
        rawDir,
        shadows ? "shadows-results.json" : housingQuality === "high" ? "high-housing-results.json" : "results.json"
      ),
      full = JSON.stringify(report, null, 2) + "\n";
    writeFileSync(rawFile, full);
    const compact = JSON.parse(JSON.stringify(report));
    for (const r of compact.results)
      for (const q of r.three)
        for (const s of q.segments) {
          s.last = s.stats.at(-1);
          s.forestMax = {};
          for (const key of ["trees", "triangles", "calls", "shadowTriangles", "cachedLayers", "builds"])
            s.forestMax[key] = Math.max(...s.stats.map((v: any) => v.forest?.[key] ?? 0));
          delete s.stats;
        }
    writeFileSync(
      resolve(output, "results.json"),
      JSON.stringify(
        {
          ...compact,
          fullObservation: {
            path: rawFile.replace(process.cwd() + "/", ""),
            bytes: Buffer.byteLength(full),
            sha256: createHash("sha256").update(full).digest("hex")
          }
        },
        null,
        2
      ) + "\n"
    );
    await page.close();
  }
  console.log(`Wrote ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
