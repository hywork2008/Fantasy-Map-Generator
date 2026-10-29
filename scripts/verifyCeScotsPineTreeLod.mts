/** Finite U04 check; temporary screenshots are not retained in Git. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve(tmpdir(), "fmg-ce-pine-lod");
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5224, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/pine-lod.html", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><style>body{margin:0;background:#c5c5bf;font:16px system-ui}canvas{display:block}#labels{position:absolute;inset:0;pointer-events:none;display:grid;grid-template-columns:repeat(4,1fr)}#labels>div{text-align:center;padding-top:8px}</style><canvas></canvas><div id='labels'></div>" }));
  await page.goto("http://127.0.0.1:5224/pine-lod.html");
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite URL.
    const THREE = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser-only Vite URL.
    const { adoptedTree } = await import("/src/city3d/adoption.ts");
    // @ts-expect-error Browser-only Vite URL.
    const { createTownForest, FOREST_3D_BUDGET } = await import("/src/city3d/three/forestMeshes.ts");
    // @ts-expect-error Browser-only Vite URL.
    const { createDocument } = await import("/src/city-editor/generators/document.ts");
    // @ts-expect-error Browser-only Vite URL.
    const { forestRegions } = await import("/src/city-editor/generators/forestGeometry.ts");
    // @ts-expect-error Browser-only Vite URL.
    const { createBvPrototypeCache } = await import("/src/city3d/three/bvInstances.ts");
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1200, 800, false);
    renderer.setClearColor(0xc5c5bf);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(1, 1.6, 0.4);
    scene.add(sun);
    const camera = new THREE.OrthographicCamera(-8, 8, 11, -11, 0.1, 150);
    const cache = createBvPrototypeCache();
    const models = ["low", "medium", "high", "ultra"].map(quality => {
      const variant = adoptedTree("scots_pine", quality);
      const source = variant.create();
      const bounds = new THREE.Box3().setFromObject(source.group);
      const triangles = source.pickables.reduce((n, mesh) => n + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
      const bytes = source.pickables.reduce((n, mesh) => n + Object.values(mesh.geometry.attributes).reduce((s: number, a: any) => s + a.array.byteLength, 0) + (mesh.geometry.index?.array.byteLength ?? 0), 0);
      source.dispose();
      const lease = cache.acquire({ id: variant.id, cacheKey: variant.id, create: variant.create });
      if (!lease) throw new Error(`Unsupported CE prototype: ${variant.id}`);
      const group = new THREE.Group();
      group.add(new THREE.Mesh(lease.geometry, lease.material));
      return { quality, variant: variant.id, group, lease, triangles, bytes, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
    });
    const spruce = adoptedTree("norway_spruce", "high").create();
    const canary = adoptedTree("canary_pine", "high").create();
    const labels = document.querySelector("#labels")!;
    labels.innerHTML = models.map(m => `<div>Scots pine · ${m.quality}</div>`).join("");
    function drawModels(pose: string) {
      labels.setAttribute("style", "");
      renderer.setScissorTest(true);
      models.forEach(({ group }, i) => {
        renderer.setViewport(i * 300, 0, 300, 800);
        renderer.setScissor(i * 300, 0, 300, 800);
        camera.left = -8;
        camera.right = 8;
        camera.top = 21.33;
        camera.bottom = -21.33;
        camera.updateProjectionMatrix();
        if (pose === "top") camera.position.set(0, 60, 0.01);
        else if (pose === "side") camera.position.set(45, 10, 0);
        else camera.position.set(32, 19, 44);
        camera.lookAt(0, 10, 0);
        scene.add(group);
        renderer.render(scene, camera);
        scene.remove(group);
      });
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 800);
    }
    function drawComparison() {
      labels.setAttribute("style", "display:none");
      renderer.setScissorTest(true);
      for (const [i, group] of [models[2].group, spruce.group, canary.group].entries()) {
        renderer.setViewport(i * 400, 0, 400, 800);
        renderer.setScissor(i * 400, 0, 400, 800);
        camera.left = -7;
        camera.right = 7;
        camera.top = 14;
        camera.bottom = -14;
        camera.updateProjectionMatrix();
        camera.position.set(32, 19, 44);
        camera.lookAt(0, 9, 0);
        scene.add(group);
        renderer.render(scene, camera);
        scene.remove(group);
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 800);
    }
    const city = createDocument("ce-pine-u04-v1", 160);
    city.biome = { id: 13, key: "centralEuropeanGreatForest", name: "European woodland", color: "green", tags: ["forest"] };
    const regions = forestRegions([{ faceId: "f0", polygon: [[-80, -80], [80, -80], [80, 80], [-80, 80]] }]);
    const plan = { regions, areaM2: regions[0].areaM2, forestFaceIds: ["f0"], protectedFarmCount: 0, protectedFarmAreaM2: 0 };
    const forest = createTownForest(city, plan, undefined, "standard");
    const perspective = new THREE.PerspectiveCamera(45, 1.5, 0.1, 20000);
    let pineAnchor: THREE.Vector3 | undefined;
    let pineHeight = 21;
    function drawForest(pose: string, quality: string) {
      labels.setAttribute("style", "display:none");
      forest.setQuality(quality);
      if (pose === "overview") perspective.position.set(0, 250, 200);
      else {
        if (!pineAnchor) throw new Error("No Scots pine anchor found in the overview");
        perspective.position.copy(pineAnchor).add(new THREE.Vector3(pose === "near" ? 5 : 2, pose === "near" ? pineHeight * 0.5 + 3 : 3.2, pose === "near" ? 7 : 3));
      }
      if (pose === "overview") perspective.lookAt(0, 5, 0);
      else perspective.lookAt(pineAnchor!.x, pineHeight * 0.5, pineAnchor!.z);
      const start = performance.now();
      forest.update(perspective, 800);
      scene.add(forest.group);
      renderer.render(scene, perspective);
      scene.remove(forest.group);
      let pineTriangles = 0;
      let pineTrees = 0;
      let boundedTriangles = 0;
      forest.group.traverseVisible(object => {
        if (!object.isInstancedMesh) return;
        const triangles = object.count * (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3;
        if (["scots_pine", "european_hornbeam", "european_beech", "pedunculate_oak"].includes(object.userData.forestSpecies)) boundedTriangles += triangles;
        if (object.userData.forestSpecies === "scots_pine") {
          pineTrees += object.count;
          pineTriangles += triangles;
          if (!pineAnchor && object.count > 0) {
            const matrix = new THREE.Matrix4();
            object.getMatrixAt(0, matrix);
            pineAnchor = new THREE.Vector3(matrix.elements[12], 0, matrix.elements[14]);
            pineHeight = matrix.elements[5] * 10;
          }
        }
      });
      return { pose, quality, cpuSubmissionMs: performance.now() - start, pineTriangles, pineTrees, boundedTriangles, pineAnchor: pineAnchor?.toArray(), pineHeight, budget: FOREST_3D_BUDGET[quality], stats: JSON.parse(JSON.stringify(forest.stats)) };
    }
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    (window as any).pineProbe = { renderer, models, forest, gl, drawModels, drawComparison, drawForest, dispose() { forest.dispose(); spruce.dispose(); canary.dispose(); models.forEach(m => m.lease.release()); renderer.dispose(); } };
    return { gpu, areaM2: plan.areaM2, models: models.map(({ quality, variant, triangles, bytes, bounds }) => ({ quality, variant, triangles, bytes, bounds })) };
  });
  for (const pose of ["front", "side", "top"]) {
    await page.evaluate(pose => (window as any).pineProbe.drawModels(pose), pose);
    await page.screenshot({ path: resolve(output, `models-${pose}.png`) });
  }
  await page.evaluate(() => (window as any).pineProbe.drawComparison());
  await page.screenshot({ path: resolve(output, "scots-pine-spruce-canary-pine.png") });
  const frames = [];
  for (const pose of ["overview", "near", "inside"])
    for (const quality of ["light", "standard", "high"]) {
      const frame = await page.evaluate(({ pose, quality }) => (window as any).pineProbe.drawForest(pose, quality), { pose, quality });
      assert.equal(frame.stats.areaM2, setup.areaM2);
      assert.ok(frame.stats.detailedTrees <= frame.stats.trees);
      if (pose !== "overview" && quality === "high") assert.ok(frame.pineTrees > 0, `Focused Scots pine must actually render: ${JSON.stringify(frame)}`);
      assert.ok(frame.pineTriangles <= frame.budget.triangles, "Pine remains within the bounded triangle budget");
      assert.ok(frame.boundedTriangles <= frame.budget.triangles, "Combined pine, hornbeam, beech and oak details remain bounded");
      assert.ok(frame.stats.shadowTriangles <= frame.budget.shadowTriangles);
      assert.equal(Object.values(frame.stats.detailedTiers as Record<string, number>).reduce((s, n) => s + n, 0), frame.stats.detailedTrees);
      frames.push(frame);
      if (quality === "high") await page.screenshot({ path: resolve(output, `forest-${pose}.png`) });
    }
  assert.ok(frames.some(f => f.pineTrees > 0), "Pine must actually render in woodland");
  const memory = await page.evaluate(() => {
    const p = (window as any).pineProbe;
    const counts: number[] = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const quality of ["light", "standard", "high"]) p.drawForest("near", quality);
      counts.push(p.renderer.info.memory.geometries);
    }
    if (p.gl.getError() !== p.gl.NO_ERROR || p.gl.isContextLost()) throw new Error("WebGL error");
    p.dispose();
    return { counts, afterDispose: p.renderer.info.memory.geometries };
  });
  assert.equal(memory.counts[1], memory.counts[2]);
  assert.equal(memory.afterDispose, 0);
  const bv = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  bv.on("pageerror", error => errors.push(error.message));
  await bv.goto("http://127.0.0.1:5224/src/building-viewer/index.html");
  const button = bv.locator('button[data-id="medieval-scots-pine"]');
  await button.evaluate(element => { for (let p = element.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true; });
  await button.click();
  const quality = bv.getByLabel("Tree model quality", { exact: true });
  const choices = await quality.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  assert.deepEqual(choices, ["low", "medium", "high", "ultra"]);
  for (const level of choices) {
    await quality.selectOption(level);
    await bv.screenshot({ path: resolve(output, `bv-${level}.png`) });
  }
  assert.deepEqual(errors, []);
  const result = { ...setup, frames, memory, bvChecks: { choices }, errors, timing: "CPU update and submission only, includes first-use model setup; not GPU completion or city FPS." };
  writeFileSync(resolve("docs/analytics/ce-tree-lod-scots-pine-20261030.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ gpu: setup.gpu, models: setup.models, memory, frames: frames.length, screenshots: output }));
} finally {
  await browser?.close();
  await server.close();
}
