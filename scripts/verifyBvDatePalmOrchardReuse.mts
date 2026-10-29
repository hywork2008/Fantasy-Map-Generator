/** Finite E02 date palm reuse evaluation; screenshots remain temporary. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { createLandscapeTree } from "../src/buildings/landscape/trees";

const output = resolve(tmpdir(), "fmg-bv-date-palm-reuse");
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5233, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/date-palm-reuse.html", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><style>body{margin:0;background:#c5c5bf;font:16px system-ui}canvas{display:block}#labels{position:absolute;inset:0;pointer-events:none;display:grid;grid-template-columns:repeat(4,1fr)}#labels>div{text-align:center;padding-top:8px}</style><canvas></canvas><div id='labels'></div>" }));
  await page.goto("http://127.0.0.1:5233/date-palm-reuse.html");
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
    const models = qualities.map(quality => ({ quality, variant: adoptedTree("date_palm", quality), model: adoptedTree("date_palm", quality).create() }));
    const labels = document.querySelector("#labels")!;
    function draw(pose: string) {
      labels.setAttribute("style", "");
      labels.innerHTML = qualities.map(quality => `<div>Date palm · ${quality}</div>`).join("");
      renderer.setScissorTest(true);
      models.forEach(({ model }, i) => {
        renderer.setViewport(i * 300, 0, 300, 700);
        renderer.setScissor(i * 300, 0, 300, 700);
        camera.left = -6.5;
        camera.right = 6.5;
        camera.top = 15.17;
        camera.bottom = -15.17;
        camera.updateProjectionMatrix();
        if (pose === "top") camera.position.set(0, 40, 0.01);
        else if (pose === "front") camera.position.set(0, 5.9, 40);
        else camera.position.set(26, 19, 38);
        camera.lookAt(0, 5.9, 0);
        scene.add(model.group);
        renderer.render(scene, camera);
        scene.remove(model.group);
      });
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 700);
    }
    function markerCenters(model: any) {
      const crown = model.pickables[1].geometry;
      const positions = crown.getAttribute("position");
      const colors = crown.getAttribute("color");
      const reference = [new THREE.Color(0xd09a2a)];
      const centers: number[][] = [];
      for (let i = 0; i < positions.count; i += 3) {
        if (!reference.some(c => [0, 1, 2].every(j => Math.abs(colors.getX(i + j) - c.r) < 1e-6 && Math.abs(colors.getY(i + j) - c.g) < 1e-6 && Math.abs(colors.getZ(i + j) - c.b) < 1e-6))) continue;
        const center = new THREE.Vector3();
        for (let j = 0; j < 3; j++) center.add(new THREE.Vector3().fromBufferAttribute(positions, i + j));
        centers.push(center.divideScalar(3).toArray());
      }
      return centers;
    }
    function closeup() {
      labels.innerHTML = "<div>Date palm · ultra · fruit axes and markers</div>";
      const markers = markerCenters(models[3].model);
      if (!markers.length) throw new Error("Missing expected date markers");
      const target = new THREE.Vector3(...markers.reduce((front, p) => p[2] > front[2] ? p : front));
      camera.left = -1.2;
      camera.right = 1.2;
      camera.top = 0.7;
      camera.bottom = -0.7;
      camera.updateProjectionMatrix();
      camera.position.copy(target).add(new THREE.Vector3(0.35, 0.15, 0.6));
      camera.lookAt(target);
      scene.add(models[3].model.group);
      renderer.render(scene, camera);
      scene.remove(models[3].model.group);
    }
    function compare() {
      labels.setAttribute("style", "grid-template-columns:repeat(3,1fr)");
      labels.innerHTML = ["Date palm · high", "Umbrella thorn · high", "Olive · high"].map(name => `<div>${name}</div>`).join("");
      const thorn = adoptedTree("umbrella_thorn", "high").create();
      const olive = adoptedTree("olive", "high").create();
      renderer.setScissorTest(true);
      [models[2].model, thorn, olive].forEach((model, i) => {
        renderer.setViewport(i * 400, 0, 400, 700);
        renderer.setScissor(i * 400, 0, 400, 700);
        camera.left = -7;
        camera.right = 7;
        camera.top = 12.25;
        camera.bottom = -12.25;
        camera.updateProjectionMatrix();
        camera.position.set(26, 19, 38);
        camera.lookAt(0, 5.5, 0);
        scene.add(model.group);
        renderer.render(scene, camera);
        scene.remove(model.group);
      });
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 700);
      olive.dispose();
      thorn.dispose();
    }
    const measurements = models.map(({ quality, variant, model }) => {
      const bounds = new THREE.Box3().setFromObject(model.group);
      return {
        quality, variant: variant.id, author: variant.author, basedOn: variant.basedOn ?? [],
        fruitMarkers: markerCenters(model).length,
        triangles: model.pickables.reduce((n, mesh) => n + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0),
        bufferBytes: model.pickables.reduce((n, mesh) => n + Object.values(mesh.geometry.attributes).reduce((sum: number, attribute: any) => sum + attribute.array.byteLength, 0) + (mesh.geometry.index?.array.byteLength ?? 0), 0),
        meshes: model.pickables.length,
        materials: new Set(model.pickables.map(mesh => mesh.material)).size,
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }
      };
    });
    const gl = renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    (window as any).datePalmProbe = {
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
    const highMarkers = markerCenters(models[2].model);
    const ultraMarkers = markerCenters(models[3].model);
    if (JSON.stringify(highMarkers) !== JSON.stringify(ultraMarkers)) throw new Error("Date marker positions changed across detailed tiers");
    return { models: measurements, markerPositionsMatch: true, gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unavailable" };
  });
  for (const pose of ["front", "oblique", "top"]) {
    await page.evaluate(pose => (window as any).datePalmProbe.draw(pose), pose);
    await page.screenshot({ path: resolve(output, `${pose}.png`) });
  }
  await page.evaluate(() => (window as any).datePalmProbe.closeup());
  await page.screenshot({ path: resolve(output, "fruit-leaves.png") });
  await page.evaluate(() => (window as any).datePalmProbe.compare());
  await page.screenshot({ path: resolve(output, "comparison.png") });
  assert.deepEqual(setup.models.map(model => model.fruitMarkers), [0, 0, 96, 96]);
  assert.deepEqual(setup.models.map(model => model.author), ["Codex GPT-6.1 Sol", "Codex GPT-6.1 Sol", "Codex GPT-6.1 Sol", "Claude Opus 5.5"]);
  const memory = await page.evaluate(() => (window as any).datePalmProbe.memory());
  assert.equal(memory.counts[0], memory.counts[1]);
  assert.equal(memory.counts[1], memory.counts[2]);
  assert.equal(memory.afterDispose.geometries, 0);
  assert.equal(memory.afterDispose.textures, 0);
  const bv = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  bv.on("pageerror", error => errors.push(error.message));
  await bv.goto("http://127.0.0.1:5233/src/building-viewer/index.html");
  const button = bv.locator('button[data-id="medieval-date-palm"]');
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
  // Preserve the observed one-face Node/Chromium difference in the fitted medium crown.
  const nodeMedium = createLandscapeTree("date_palm", "medium");
  let nodeMediumMeasurement;
  try {
    nodeMediumMeasurement = {
      triangles: nodeMedium.pickables.reduce((n, mesh) => n + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0),
      bufferBytes: nodeMedium.pickables.reduce((n, mesh) => n + Object.values(mesh.geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0) + (mesh.geometry.index?.array.byteLength ?? 0), 0)
    };
  } finally {
    nodeMedium.dispose();
  }
  const result = { ...setup, measurementRuntime: "Chromium", nodeMediumMeasurement, memory, bvChecks: { choices, adoption }, errors, scope: "Existing date palm single-tree reuse evaluation only; fruit markers are triangles, not fruit bodies or branched fruit strands. CE orchards, age/sex classes, pollination, pruning geometry and dense-stand budgets are not implemented or measured." };
  writeFileSync(resolve("docs/analytics/bv-date-palm-orchard-reuse-20261030.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, screenshots: output }));
} finally {
  await browser?.close();
  await server.close();
}
