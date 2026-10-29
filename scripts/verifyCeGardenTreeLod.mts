/** Finite BV-model / CE-forest visual check: node --import tsx scripts/verifyCeGardenTreeLod.mts */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve("docs/analytics/ce-tree-lod-garden-20261029");
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5213, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/garden-lod.html", route =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0;background:#d5cfbf;font:16px system-ui}canvas{display:block}#labels{position:absolute;inset:0;pointer-events:none;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(4,1fr)}#labels>div{text-align:center;padding-top:8px}</style><canvas></canvas><div id='labels'></div>"
    })
  );
  await page.goto("http://127.0.0.1:5213/garden-lod.html");
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite module URL.
    const THREE = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser-only Vite module URL.
    const { adoptedTree, sceneVariants } = await import("/src/city3d/adoption.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { createTownOpenSpaces } = await import("/src/city3d/three/openSpaceMeshes.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { createBvPrototypeCache } = await import("/src/city3d/three/bvInstances.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { DEFAULT_SUN, sunDirection } = await import("/src/city-editor/renderers/sunLighting.ts");
    const renderer = new THREE.WebGLRenderer({
      canvas: document.querySelector("canvas"),
      antialias: true,
      preserveDrawingBuffer: true
    });
    renderer.setSize(1200, 1600, false);
    renderer.setClearColor(0xc5c5bf);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(1);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.copy(sunDirection(DEFAULT_SUN));
    scene.add(sun);
    const camera = new THREE.OrthographicCamera(-10.5, 10.5, 14, -14, 0.1, 300);
    const qualities = ["low", "medium", "high", "ultra"];
    const cache = createBvPrototypeCache();
    const models = ["mediterranean_cypress", "oriental_evergreen", "sacred_bodhi_and_fig", "peaceful_willow"].flatMap(species =>
      qualities.map(quality => {
        const variant = adoptedTree(species, quality);
        const lease = cache.acquire({ id: variant.id, cacheKey: variant.id, create: variant.create });
        if (!lease) throw new Error(`Unsupported CE prototype: ${variant.id}`);
        const group = new THREE.Group();
        group.add(new THREE.Mesh(lease.geometry, lease.material));
        return {
          species,
          quality,
          variant: variant.id,
          lease,
          model: {
            group,
            dispose() {
              lease.release();
            }
          }
        };
      })
    );
    const highCrowns = new Map(
      models
        .filter(m => m.quality === "high")
        .map(({ species }) => {
          const source = adoptedTree(species, "high").create();
          const crown = source.pickables[1];
          crown.geometry.computeBoundingBox();
          const bounds = crown.geometry.boundingBox.clone();
          source.dispose();
          return [species, bounds];
        })
    );
    const labels = document.querySelector("#labels")!;
    labels.innerHTML = models.map(({ species, quality }) => `<div>${species} · ${quality}</div>`).join("");
    const drawModels = (pose: string) => {
      labels.removeAttribute("hidden");
      labels.setAttribute("style", "");
      renderer.setScissorTest(true);
      for (const [i, { model }] of models.entries()) {
        const x = (i % 4) * 300,
          y = 1200 - Math.floor(i / 4) * 400;
        renderer.setViewport(x, y, 300, 400);
        renderer.setScissor(x, y, 300, 400);
        if (pose === "side") camera.position.set(28, 5.5, 0);
        else if (pose === "top") camera.position.set(0, 38, 0.01);
        else camera.position.set(26, 14, 32);
        camera.lookAt(0, 7, 0);
        scene.add(model.group);
        renderer.render(scene, camera);
        scene.remove(model.group);
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 1600);
    };
    const comparison = models.filter(m => m.quality === "medium" || m.quality === "high");
    const drawSingles = (angle: number) => {
      labels.setAttribute("style", "display:grid");
      const cells = [45, 90].flatMap(pixels => comparison.map(model => ({ ...model, pixels })));
      labels.innerHTML = cells.map(m => `<div>${m.species} · ${m.quality} · ${m.pixels} px · ${angle}°</div>`).join("");
      const elevation = THREE.MathUtils.degToRad(angle);
      camera.position.set(0, 7 + Math.sin(elevation) * 100, Math.cos(elevation) * 100);
      camera.lookAt(0, 7, 0);
      camera.updateMatrixWorld(true);
      renderer.setScissorTest(true);
      for (const [i, { species, model, pixels }] of cells.entries()) {
        const bounds = highCrowns.get(species);
        const projected = new THREE.Box3();
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z])
              projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
        const half = ((projected.max.y - projected.min.y) * 400) / (pixels * 2);
        camera.left = -half * 0.75;
        camera.right = half * 0.75;
        camera.top = half;
        camera.bottom = -half;
        camera.updateProjectionMatrix();
        renderer.setViewport((i % 4) * 300, 1200 - Math.floor(i / 4) * 400, 300, 400);
        renderer.setScissor((i % 4) * 300, 1200 - Math.floor(i / 4) * 400, 300, 400);
        scene.add(model.group);
        renderer.render(scene, camera);
        scene.remove(model.group);
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 1600);
    };
    const drawStands = () => {
      labels.setAttribute("style", "display:grid;grid-template-columns:repeat(2,1fr)");
      labels.innerHTML = comparison
        .map(m => `<div>${m.species} · ${m.quality} · 260 trees · 35° / 130 m</div>`)
        .join("");
      const standCamera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 1000);
      const angle = THREE.MathUtils.degToRad(35);
      standCamera.position.set(0, 7 + 130 * Math.sin(angle), 130 * Math.cos(angle));
      standCamera.lookAt(0, 7, 0);
      renderer.setScissorTest(true);
      for (const [i, { lease }] of comparison.entries()) {
        const mesh = new THREE.InstancedMesh(lease.geometry, lease.material, 260);
        for (let j = 0; j < 260; j++) {
          const matrix = new THREE.Matrix4().makeRotationY(j * 2.39996);
          matrix.setPosition(((j % 20) - 9.5) * 5.5, 0, -(Math.floor(j / 20) - 6) * 6);
          mesh.setMatrixAt(j, matrix);
        }
        mesh.computeBoundingSphere();
        renderer.setViewport((i % 2) * 600, 1200 - Math.floor(i / 2) * 400, 600, 400);
        renderer.setScissor((i % 2) * 600, 1200 - Math.floor(i / 2) * 400, 600, 400);
        scene.add(mesh);
        renderer.render(scene, standCamera);
        scene.remove(mesh);
        mesh.dispose();
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 1600);
    };
    const parks = new Map(models.filter(m => m.quality === "ultra").map(({ species, lease }) => {
      lease.geometry.computeBoundingBox();
      const height = lease.geometry.boundingBox.max.y - lease.geometry.boundingBox.min.y;
      const positions = lease.geometry.getAttribute("position");
      let radius = 0;
      for (let i = 0; i < positions.count; i++) radius = Math.max(radius, Math.hypot(positions.getX(i), positions.getZ(i)));
      const sites = Array.from({ length: 260 }, (_, j) => ({
        model: species,
        point: [((j % 20) - 9.5) * 5.5, (Math.floor(j / 20) - 6) * 6],
        angle: j * 2.39996,
        height, radius
      }));
      return [species, createTownOpenSpaces({ surfaces: [], sites })];
    }));
    const perspective = new THREE.PerspectiveCamera(45, 0.75, 0.1, 20000);
    const drawPark = (pose: string, species: string, zoom: number) => {
      const park = parks.get(species);
      labels.setAttribute("style", "display:none");
      if (pose === "overview") perspective.position.set(120, 500, 600);
      else if (pose === "edge") perspective.position.set(45, 24, 95);
      else perspective.position.set(20, 10, 35);
      perspective.lookAt(0, 5, 0);
      perspective.zoom = zoom;
      perspective.updateProjectionMatrix();
      const start = performance.now();
      park.update(perspective, 1600);
      scene.add(park.group);
      renderer.render(scene, perspective);
      scene.remove(park.group);
      const tiers = { low: 0, medium: 0, high: 0, ultra: 0 };
      let triangles = 0, calls = 0;
      park.group.traverseVisible(mesh => {
        if (!mesh.isInstancedMesh || !mesh.count) return;
        tiers[mesh.userData.treeQuality] += mesh.count;
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3 * mesh.count;
        calls++;
      });
      return { pose, species, zoom, cpuSubmissionMs: performance.now() - start, tiers,
        visibleTrees: Object.values(tiers).reduce((a, b) => a + b, 0), triangles, calls,
        variants: sceneVariants(park.group), gpuGeometries: renderer.info.memory.geometries };
    };
    const gl = renderer.getContext(),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    (window as any).gardenProbe = {
      drawModels,
      drawSingles,
      drawStands,
      drawPark,
      renderer,
      parks,
      models,
      gl,
      dispose() {
        parks.forEach(park => park.dispose());
        models.forEach(({ model }) => model.dispose());
        renderer.dispose();
      }
    };
    drawModels("front");
    return {
      gpu,
      userAgent: navigator.userAgent,
      viewport: [1200, 1600],
      dpr: 1,
      placementCountPerPark: 260,
      modelVariants: models.map(({ variant }) => variant)
    };
  });
  for (const pose of ["front", "side", "top"]) {
    await page.evaluate(pose => (window as any).gardenProbe.drawModels(pose), pose);
    await page.screenshot({ path: resolve(output, `models-${pose}.png`) });
  }
  for (const angle of [12, 40, 70]) {
    await page.evaluate(angle => (window as any).gardenProbe.drawSingles(angle), angle);
    await page.screenshot({ path: resolve(output, `single-medium-high-${angle}.png`) });
  }
  await page.evaluate(() => (window as any).gardenProbe.drawStands());
  await page.screenshot({ path: resolve(output, "stand-medium-high.png") });
  const frames = [];
  for (const species of ["mediterranean_cypress", "oriental_evergreen", "sacred_bodhi_and_fig", "peaceful_willow"])
    for (const pose of ["overview", "edge", "low"])
      for (const zoom of [0.5, 1, 2]) {
        const frame = await page.evaluate(
          ({ pose, species, zoom }) => (window as any).gardenProbe.drawPark(pose, species, zoom),
          { pose, species, zoom }
        );
        assert.ok(frame.visibleTrees > 0 && frame.visibleTrees <= setup.placementCountPerPark);
        assert.ok(frame.variants.length > 0);
        frames.push(frame);
        if (zoom === 1) await page.screenshot({ path: resolve(output, `park-${species}-${pose}.png`) });
      }
  const memory = await page.evaluate(() => {
    const p = (window as any).gardenProbe, results = [];
    for (const species of p.parks.keys()) {
      const counts = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const zoom of [0.5, 1, 2]) p.drawPark("edge", species, zoom);
        counts.push(p.renderer.info.memory.geometries);
      }
      results.push({ species, counts });
    }
    if (p.gl.getError() !== p.gl.NO_ERROR || p.gl.isContextLost()) throw new Error("WebGL error");
    p.dispose();
    return results;
  });
  for (const { counts } of memory) assert.equal(counts[1], counts[2]);
  assert.deepEqual(errors, []);
  await page.close();
  const bv = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const bvErrors: string[] = [];
  bv.on("pageerror", error => bvErrors.push(error.message));
  await bv.goto("http://127.0.0.1:5213/src/building-viewer/index.html");
  const bvChecks = [];
  for (const species of ["mediterranean-cypress", "oriental-evergreen", "sacred-bodhi-and-fig", "peaceful-willow"]) {
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
  console.log(
    `Verified 16 CE prototypes, fitted-canopy comparisons and 36 park poses/zooms; ${setup.gpu}; wrote ${output}`
  );
} finally {
  await browser?.close();
  await server.close();
}
