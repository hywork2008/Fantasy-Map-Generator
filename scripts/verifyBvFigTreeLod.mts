/** Finite F04 model/BV verification; screenshots remain temporary. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve(tmpdir(), "fmg-bv-fig-lod");
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5229, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/fig-lod.html", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><style>body{margin:0;background:#c5c5bf;font:16px system-ui}canvas{display:block}#labels{position:absolute;inset:0;pointer-events:none;display:grid;grid-template-columns:repeat(4,1fr)}#labels>div{text-align:center;padding-top:8px}</style><canvas></canvas><div id='labels'></div>" }));
  await page.goto("http://127.0.0.1:5229/fig-lod.html");
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite URL.
    const THREE = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser-only Vite URL.
    const { adoptedTree } = await import("/src/city3d/adoption.ts");
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1200, 700, false);
    renderer.setClearColor(0xc5c5bf);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(1, 1.6, 0.4);
    scene.add(sun);
    const camera = new THREE.OrthographicCamera(-4.4, 4.4, 10.27, -10.27, 0.1, 150);
    const qualities = ["low", "medium", "high", "ultra"];
    const models = qualities.map(quality => ({ quality, variant: adoptedTree("common_fig", quality), model: adoptedTree("common_fig", quality).create() }));
    const labels = document.querySelector("#labels")!;
    function draw(pose: string) {
      labels.setAttribute("style", "");
      labels.innerHTML = qualities.map(quality => `<div>Fig · ${quality}</div>`).join("");
      renderer.setScissorTest(true);
      models.forEach(({ model }, i) => {
        renderer.setViewport(i * 300, 0, 300, 700);
        renderer.setScissor(i * 300, 0, 300, 700);
        camera.left = -5.3;
        camera.right = 5.3;
        camera.top = 12.37;
        camera.bottom = -12.37;
        camera.updateProjectionMatrix();
        if (pose === "top") camera.position.set(0, 40, 0.01);
        else if (pose === "front") camera.position.set(0, 2.4, 40);
        else camera.position.set(26, 19, 38);
        camera.lookAt(0, 2.4, 0);
        scene.add(model.group);
        renderer.render(scene, camera);
        scene.remove(model.group);
      });
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 700);
    }
    function closeup() {
      labels.innerHTML = "<div>Fig · ultra · fruit and leaves</div>";
      camera.left = -3;
      camera.right = 3;
      camera.top = 1.75;
      camera.bottom = -1.75;
      camera.updateProjectionMatrix();
      camera.position.set(8, 6, 13);
      camera.lookAt(0.8, 3.3, 1.1);
      scene.add(models[3].model.group);
      renderer.render(scene, camera);
      scene.remove(models[3].model.group);
    }
    function compare() {
      labels.setAttribute("style", "grid-template-columns:repeat(3,1fr)");
      labels.innerHTML = ["Fig · high", "Apple · high", "Sacred fig · high"].map(name => `<div>${name}</div>`).join("");
      const apple = adoptedTree("domestic_apple", "high").create();
      const bodhi = adoptedTree("sacred_bodhi_and_fig", "high").create();
      renderer.setScissorTest(true);
      [models[2].model, apple, bodhi].forEach((model, i) => {
        renderer.setViewport(i * 400, 0, 400, 700);
        renderer.setScissor(i * 400, 0, 400, 700);
        camera.left = -9;
        camera.right = 9;
        camera.top = 15.75;
        camera.bottom = -15.75;
        camera.updateProjectionMatrix();
        camera.position.set(26, 19, 38);
        camera.lookAt(0, 5.5, 0);
        scene.add(model.group);
        renderer.render(scene, camera);
        scene.remove(model.group);
      });
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 700);
      bodhi.dispose();
      apple.dispose();
    }
    const measurements = models.map(({ quality, variant, model }) => {
      const bounds = new THREE.Box3().setFromObject(model.group);
      return {
        quality, variant: variant.id, author: variant.author,
        triangles: model.pickables.reduce((n, mesh) => n + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0),
        bufferBytes: model.pickables.reduce((n, mesh) => n + Object.values(mesh.geometry.attributes).reduce((sum: number, attribute: any) => sum + attribute.array.byteLength, 0) + (mesh.geometry.index?.array.byteLength ?? 0), 0),
        meshes: model.pickables.length,
        materials: new Set(model.pickables.map(mesh => mesh.material)).size,
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }
      };
    });
    const gl = renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    (window as any).figProbe = {
      draw, closeup, compare,
      memory() {
        const counts: number[] = [];
        for (let cycle = 0; cycle < 3; cycle++) {
          for (const entry of models) {
            entry.model.dispose();
            entry.model = entry.variant.create();
          }
          draw("oblique");
          counts.push(renderer.info.memory.geometries);
        }
        if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error("WebGL error");
        for (const { model } of models) model.dispose();
        const afterDispose = { ...renderer.info.memory };
        renderer.dispose();
        return { counts, afterDispose };
      }
    };
    return { models: measurements, gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unavailable" };
  });
  for (const pose of ["front", "oblique", "top"]) {
    await page.evaluate(pose => (window as any).figProbe.draw(pose), pose);
    await page.screenshot({ path: resolve(output, `${pose}.png`) });
  }
  await page.evaluate(() => (window as any).figProbe.closeup());
  await page.screenshot({ path: resolve(output, "fruit-leaves.png") });
  await page.evaluate(() => (window as any).figProbe.compare());
  await page.screenshot({ path: resolve(output, "comparison.png") });
  const memory = await page.evaluate(() => (window as any).figProbe.memory());
  assert.equal(memory.counts[0], memory.counts[1]);
  assert.equal(memory.counts[1], memory.counts[2]);
  assert.equal(memory.afterDispose.geometries, 0);
  assert.equal(memory.afterDispose.textures, 0);
  const bv = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  bv.on("pageerror", error => errors.push(error.message));
  await bv.goto("http://127.0.0.1:5229/src/building-viewer/index.html");
  const button = bv.locator('button[data-id="medieval-common-fig"]');
  await button.evaluate(element => { for (let p = element.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true; });
  await button.click();
  const quality = bv.getByLabel("Tree model quality", { exact: true });
  const choices = await quality.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  assert.deepEqual(choices, ["low", "medium", "high", "ultra"]);
  const adoption: Record<string, boolean> = {};
  for (const level of choices) {
    await quality.selectOption(level);
    adoption[level] = await bv.locator("p").filter({ hasText: /^CE adoption: Adopted$/ }).count() > 0;
    assert.ok(adoption[level], `Missing adoption display: ${level}`);
    await bv.screenshot({ path: resolve(output, `bv-${level}.png`) });
  }
  assert.deepEqual(errors, []);
  const result = { ...setup, memory, bvChecks: { choices, adoption }, errors, scope: "BV and single-tree GPU rendering only; CE orchard placement, forest performance and seasonal simulation are outside this check." };
  writeFileSync(resolve("docs/analytics/bv-fig-tree-lod-20261030.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, screenshots: output }));
} finally {
  await browser?.close();
  await server.close();
}
