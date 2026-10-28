/** Finite BV-model / CE-forest visual check: node --import tsx scripts/verifyCeBorealTreeLod.mts */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve("docs/analytics/ce-tree-lod-boreal-20261029");
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5207, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/boreal-lod.html", route =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0;background:#d5cfbf;font:16px system-ui}canvas{display:block}#labels{position:absolute;inset:0;pointer-events:none;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr)}#labels>div{text-align:center;padding-top:8px}</style><canvas></canvas><div id='labels'></div>"
    })
  );
  await page.goto("http://127.0.0.1:5207/boreal-lod.html");
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite module URL.
    const THREE = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser-only Vite module URL.
    const { adoptedTree } = await import("/src/city3d/adoption.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { createTownForest } = await import("/src/city3d/three/forestMeshes.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { createDocument } = await import("/src/city-editor/generators/document.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { forestRegions } = await import("/src/city-editor/generators/forestGeometry.ts");
    const renderer = new THREE.WebGLRenderer({
      canvas: document.querySelector("canvas"),
      antialias: true,
      preserveDrawingBuffer: true
    });
    renderer.setSize(1200, 800, false);
    renderer.setClearColor(0xd5cfbf);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(1, 1.6, 0.4);
    scene.add(sun);
    const camera = new THREE.OrthographicCamera(-7, 7, 10, -10, 0.1, 100);
    const qualities = ["low", "medium", "high", "ultra"];
    const models = ["norway_spruce", "silver_birch"].flatMap(species =>
      qualities.map(quality => ({ species, quality, model: adoptedTree(species, quality).create() }))
    );
    const labels = document.querySelector("#labels")!;
    labels.innerHTML = models.map(({ species, quality }) => `<div>${species} · ${quality}</div>`).join("");
    const drawModels = (pose: string) => {
      labels.removeAttribute("hidden");
      labels.setAttribute("style", "");
      renderer.setScissorTest(true);
      for (const [i, { model }] of models.entries()) {
        const x = (i % 4) * 300,
          y = i < 4 ? 400 : 0;
        renderer.setViewport(x, y, 300, 400);
        renderer.setScissor(x, y, 300, 400);
        if (pose === "side") camera.position.set(22, 6, 0);
        else if (pose === "top") camera.position.set(0, 28, 0.01);
        else camera.position.set(18, 12, 24);
        camera.lookAt(0, 6, 0);
        scene.add(model.group);
        renderer.render(scene, camera);
        scene.remove(model.group);
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 800);
    };
    const city = createDocument("ce-tree-lod-boreal-v1", 256);
    city.biome = { id: 9, key: "taiga", name: "Taiga", color: "#4b6b32", tags: ["forest", "cold"] };
    city.forestSettings = { version: 1, mode: "surroundings", density: "standard" };
    const regions = forestRegions([
      {
        faceId: "f0",
        polygon: [
          [-128, -128],
          [128, -128],
          [128, 128],
          [-128, 128]
        ]
      }
    ]);
    regions[0].holes = [
      [
        [0, -16],
        [-24, -16],
        [-24, 16],
        [0, 16]
      ]
    ];
    regions[0].areaM2 -= 24 * 32;
    const plan = {
      regions,
      areaM2: regions[0].areaM2,
      forestFaceIds: ["f0"],
      protectedFarmAreaM2: 0,
      protectedFarmCount: 0
    };
    const forest = createTownForest(city, plan, undefined, "standard");
    const perspective = new THREE.PerspectiveCamera(45, 1.5, 0.1, 20000);
    const drawForest = (pose: string, quality: string) => {
      labels.setAttribute("style", "display:none");
      forest.setQuality(quality);
      if (pose === "overview") perspective.position.set(120, 500, 600);
      else if (pose === "edge") perspective.position.set(45, 24, 95);
      else perspective.position.set(20, 10, 35);
      perspective.lookAt(0, 5, 0);
      const at = performance.now();
      forest.update(perspective, 800);
      scene.add(forest.group);
      renderer.render(scene, perspective);
      scene.remove(forest.group);
      return {
        pose,
        quality,
        cpuSubmissionMs: performance.now() - at,
        stats: { ...forest.stats },
        gpuGeometries: renderer.info.memory.geometries
      };
    };
    const gl = renderer.getContext(),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    (window as any).borealProbe = {
      drawModels,
      drawForest,
      renderer,
      forest,
      models,
      gl,
      dispose() {
        forest.dispose();
        models.forEach(({ model }) => model.dispose());
        renderer.dispose();
      }
    };
    drawModels("front");
    return { gpu, userAgent: navigator.userAgent, viewport: [1200, 800], dpr: 1, areaM2: plan.areaM2 };
  });
  for (const pose of ["front", "side", "top"]) {
    await page.evaluate(pose => (window as any).borealProbe.drawModels(pose), pose);
    await page.screenshot({ path: resolve(output, `models-${pose}.png`) });
  }
  const frames = [];
  for (const pose of ["overview", "edge", "low"])
    for (const quality of ["light", "standard", "high"]) {
      const frame = await page.evaluate(({ pose, quality }) => (window as any).borealProbe.drawForest(pose, quality), {
        pose,
        quality
      });
      // Quality-first like the lime forest: every visible tree is an adopted BV model at its distance tier.
      assert.equal(frame.stats.areaM2, setup.areaM2);
      const tiers = Object.values(frame.stats.detailedTiers as Record<string, number>).reduce((sum, n) => sum + n, 0);
      assert.equal(tiers, frame.stats.trees, `${pose}/${quality}/tiers`);
      frames.push(frame);
      if (quality === "standard") await page.screenshot({ path: resolve(output, `forest-${pose}.png`) });
    }
  const memory = await page.evaluate(() => {
    const p = (window as any).borealProbe,
      counts = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const q of ["light", "standard", "high"]) p.drawForest("edge", q);
      counts.push(p.renderer.info.memory.geometries);
    }
    if (p.gl.getError() !== p.gl.NO_ERROR || p.gl.isContextLost()) throw new Error("WebGL error");
    p.dispose();
    return counts;
  });
  assert.equal(memory[1], memory[2]);
  assert.deepEqual(errors, []);
  await page.close();
  const bv = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const bvErrors: string[] = [];
  bv.on("pageerror", error => bvErrors.push(error.message));
  await bv.goto("http://127.0.0.1:5207/src/building-viewer/index.html");
  const bvChecks = [];
  for (const species of ["norway-spruce", "silver-birch"]) {
    const button = bv.locator(`button[data-id="medieval-${species}"]`);
    await button.evaluate(element => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement)
        if (parent instanceof HTMLDetailsElement) parent.open = true;
    });
    await button.click();
    const quality = bv.getByLabel("Tree model quality", { exact: true });
    const choices = await quality
      .locator("option")
      .evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    assert.deepEqual(choices, ["low", "medium", "high", "ultra"]);
    for (const level of choices) {
      await bv.getByLabel("Tree model quality", { exact: true }).selectOption(level);
      await bv.waitForTimeout(40);
    }
    await bv.getByLabel("Tree model quality", { exact: true }).selectOption("medium");
    await bv.screenshot({ path: resolve(output, `bv-${species}-medium.png`) });
    bvChecks.push({ species, choices });
  }
  assert.deepEqual(bvErrors, []);
  writeFileSync(
    resolve(output, "results.json"),
    `${JSON.stringify({ ...setup, timing: "Single CPU update/submission only; not GPU completion, full CE frame p95 or FPS.", frames, memory, errors, bvChecks, bvErrors }, null, 2)}\n`
  );
  console.log(`Verified 8 models and 9 forest poses/qualities; ${setup.gpu}; wrote ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
