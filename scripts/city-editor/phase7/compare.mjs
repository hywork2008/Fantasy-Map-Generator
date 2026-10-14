// Same harness for the isolated pre-refactor tree and the current tree.
// node --expose-gc scripts/city-editor/phase7/compare.mjs --root=... --mode=stages|performance --out=...
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { setImmediate as tick } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { createRunnableDevEnvironment, resolveConfig } from "vite";
const option = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const root = resolve(option("root", process.cwd()));
const mode = option("mode", "stages");
const out = resolve(option("out", "/tmp/ce-phase7-compare.json"));
const baseline = resolve(option("requests", "artifacts/city-editor/phase0-20261013/baseline"));
const old = fs.existsSync(resolve(root, "src/city-editor/core/generate.ts"));
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
let dom;
function replaceDom() {
  dom?.window.close();
  dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
  for (const key of [
    "window",
    "document",
    "Node",
    "Element",
    "HTMLElement",
    "SVGElement",
    "DOMParser",
    "XMLSerializer",
    "MutationObserver",
    "localStorage",
    "navigator",
    "getComputedStyle"
  ])
    Object.defineProperty(globalThis, key, { value: dom.window[key], writable: true, configurable: true });
}
replaceDom();
const env = createRunnableDevEnvironment(
  "inline",
  await resolveConfig(
    {
      root,
      configFile: false,
      envDir: false,
      plugins: old
        ? [
            {
              name: "ce-baseline-cache-audit",
              transform(code, id) {
                // Baseline has no public reset API. Expose only its existing LRU.clear and
                // ward-cache assignment to match the current runner's cold-cache boundaries.
                if (id.endsWith("/core/gen/blockInfill.ts"))
                  return code + "\nexport function __ceAuditClearBlockCache() { defaultCache?.clear(); }\n";
                if (id.endsWith("/core/generate.ts"))
                  return code + "\nexport function __ceAuditClearPreview() { wardStepCache = undefined; }\n";
              }
            }
          ]
        : [],
      environments: {
        inline: {
          consumer: "server",
          dev: { moduleRunnerTransform: true },
          resolve: { external: true, mainFields: [], conditions: ["node", "module-sync"] }
        }
      }
    },
    "serve"
  ),
  { runnerOptions: { hmr: { logger: false } }, hot: false }
);
await env.init();
try {
  const load = p => env.runner.import(resolve(root, "src/city-editor", p));
  const generation = old
    ? await load("core/generate.ts")
    : {
        ...(await load("generators/generation/generateCity.ts")),
        ...(await load("generators/generation/previews.ts")),
        ...(await load("generators/generation/settings.ts")),
        ...(await load("controllers/generationStages.ts"))
      };
  const doc = await load(old ? "core/document.ts" : "generators/document.ts");
  const codec = old ? doc : await load("services/io/documentCodec.ts");
  const render = await load(old ? "render/svg.ts" : "renderers/standaloneSvg.ts");
  const caches = await load(old ? "core/gen/blockInfill.ts" : "generators/blockInfill.ts");
  const clear = () => {
    (caches.clearBlockFabricCache ?? caches.__ceAuditClearBlockCache)();
    (generation.clearGenerationPreviewCache ?? generation.__ceAuditClearPreview)();
  };
  const metadata = {
    root,
    old,
    node: process.version,
    cpu: os.cpus()[0].model,
    platform: os.platform(),
    arch: os.arch()
  };
  if (mode === "request") {
    const document = doc.createGridDocument({ size: "large", grid: "evolution", seed: "render-quality" });
    const settings = generation.defaultGenerationSettings();
    settings.buildingPattern = "legacy";
    settings.layout = "classic";
    settings.config = {
      ...settings.config,
      coast: "none",
      rivers: [],
      relief: false,
      features: { walls: false, citadel: false, plaza: true, temple: true, port: false, shanty: false }
    };
    fs.writeFileSync(out, JSON.stringify({ document, settings, seed: "render-quality" }) + "\n");
    console.log(
      JSON.stringify({ extentMeters: document.frame.extentMeters, faces: Object.keys(document.mesh.faces).length })
    );
  } else if (mode === "stages") {
    const cases = [];
    const file = await load(old ? "io/cityEditorFile.ts" : "services/io/cityEditorFile.ts");
    for (const name of [
      "atheiate-20261003",
      "erente-20261009",
      "gothengsfeld-20261012",
      "hekus-ui-request-20261007",
      "synthetic-bram",
      "synthetic-circulade",
      "synthetic-double-inner",
      "synthetic-double-outer"
    ]) {
      clear();
      const request = JSON.parse(gunzipSync(fs.readFileSync(`${baseline}/${name}.request.json.gz`)));
      const before = JSON.stringify(request.document);
      const city = generation.generateCityOnDocument(request.document, request.settings, request.seed, () => {});
      if (!city) throw Error(`Complete generation rejected: ${name}`);
      const json = JSON.stringify(city),
        svg = render.renderStandaloneCitySvg(city).outerHTML;
      let blob;
      const create = URL.createObjectURL,
        revoke = URL.revokeObjectURL,
        click = dom.window.HTMLAnchorElement.prototype.click;
      URL.createObjectURL = value => {
        blob = value;
        return "blob:audit";
      };
      URL.revokeObjectURL = () => {};
      dom.window.HTMLAnchorElement.prototype.click = () => {};
      let saved;
      try {
        file.exportCityMap(city);
        saved = await blob.text();
      } finally {
        URL.createObjectURL = create;
        URL.revokeObjectURL = revoke;
        dom.window.HTMLAnchorElement.prototype.click = click;
      }
      const loaded = codec.parseDocument(saved);
      if (!loaded) throw Error(`Saved document rejected: ${name}`);
      const stages = [];
      for (const stage of generation.generationStages(request.settings)) {
        const value = generation.generateStageOnDocument(
          request.document,
          request.settings,
          request.seed,
          stage.processStep ?? stage.step,
          undefined,
          stage.wallCheckpoint
        );
        const text = JSON.stringify(value);
        const stageSvg = value ? render.renderStandaloneCitySvg(value).outerHTML : null;
        if (value && JSON.stringify(value) !== text) throw Error(`Render modified stage ${stage.id}`);
        stages.push({
          id: stage.id,
          step: stage.step,
          processStep: stage.processStep ?? stage.step,
          wallCheckpoint: stage.wallCheckpoint ?? null,
          status: value ? "generated" : "rejected",
          documentSha256: hash(text),
          svgSha256: stageSvg ? hash(stageSvg) : null
        });
      }
      const result = {
        name,
        documentSha256: hash(json),
        svgSha256: hash(svg),
        savedSha256: hash(saved),
        loadedSha256: hash(JSON.stringify(loaded)),
        loadedSvgSha256: hash(render.renderStandaloneCitySvg(loaded).outerHTML),
        inputUnchanged: before === JSON.stringify(request.document),
        renderReadOnly: json === JSON.stringify(city),
        stages
      };
      cases.push(result);
      console.log(JSON.stringify({ name, stages: stages.length, inputUnchanged: result.inputUnchanged }));
    }
    fs.writeFileSync(out, JSON.stringify({ ...metadata, cases }, null, 2) + "\n");
  } else if (mode === "performance") {
    if (!global.gc) throw Error("Run performance with --expose-gc");
    const gc = async () => {
      await tick();
      global.gc();
      await tick();
      global.gc();
      await tick();
    };
    const request = JSON.parse(fs.readFileSync(option("request", "/tmp/ce-large-request.json"), "utf8"));
    const runs = [];
    // Warm one full run, then measure three cold-cache runs. Identical GC points.
    for (let pass = 0; pass < 4; pass++) {
      clear();
      await gc();
      const before = process.memoryUsage();
      let source = structuredClone(request.document),
        settings = structuredClone(request.settings);
      const start = performance.now();
      let city = generation.generateCityOnDocument(source, settings, request.seed, sample => {
        if (sample.failure) console.log(JSON.stringify({ pass, failure: sample.failure.reason }));
      });
      const generationMs = performance.now() - start;
      if (!city) throw Error("Large generation rejected");
      const renderStart = performance.now();
      let svg = render.renderStandaloneCitySvg(city);
      const renderMs = performance.now() - renderStart;
      const documentSha256 = hash(JSON.stringify(city)),
        svgSha256 = hash(svg.outerHTML);
      const faces = Object.keys(city.mesh.faces).length,
        nodes = svg.querySelectorAll("*").length,
        buildings = svg.querySelectorAll(".ce-building").length;
      await gc();
      const retained = process.memoryUsage();
      const refs = [new WeakRef(source), new WeakRef(city), new WeakRef(svg)];
      source = null;
      settings = null;
      city = null;
      svg = null;
      clear();
      // A closed page releases jsdom's selector caches as well as application
      // references. Reuse would retain the last detached SVG in the DOM engine.
      replaceDom();
      await gc();
      const released = process.memoryUsage();
      if (pass)
        runs.push({
          generationMs,
          renderMs,
          faces,
          nodes,
          buildings,
          documentSha256,
          svgSha256,
          heapBefore: before.heapUsed,
          heapRetained: retained.heapUsed,
          heapReleased: released.heapUsed,
          rssRetained: retained.rss,
          collected: refs.map(ref => ref.deref() === undefined)
        });
      console.log(
        JSON.stringify({
          pass,
          generationMs,
          renderMs,
          heapRetained: retained.heapUsed,
          heapReleased: released.heapUsed
        })
      );
    }
    fs.writeFileSync(out, JSON.stringify({ ...metadata, runs }, null, 2) + "\n");
  } else throw Error(`Unknown mode ${mode}`);
} finally {
  await env.close();
  dom.window.close();
}
