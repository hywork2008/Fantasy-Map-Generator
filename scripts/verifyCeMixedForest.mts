/** Fixed mixed-policy forest regression probe; not a frame/performance benchmark. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve("docs/analytics/ce-forest-mixed-budget-20261029");
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5215, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/mixed-forest-audit.html", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>" }));
  await page.goto("http://127.0.0.1:5215/mixed-forest-audit.html");
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite module URL.
    const THREE = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser-only Vite module URL.
    const { createDocument } = await import("/src/city-editor/generators/document.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { forestRegions } = await import("/src/city-editor/generators/forestGeometry.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { treeLodProfile } = await import("/src/buildings/landscape/trees.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { createTownForest, FOREST_3D_BUDGET } = await import("/src/city3d/three/forestMeshes.ts");
    const birch = treeLodProfile("silver_birch"), originalPolicy = birch.budget;
    // Synthetic fixture: production boreal trees both remain quality-first.
    birch.budget = "bounded";
    const city = createDocument("mixed-budget-v1", 160);
    city.biome = { id: 1, key: "taiga", name: "Taiga", color: "green" };
    const regions = forestRegions([{ faceId: "f0", polygon: [[-48,-48],[48,-48],[48,48],[-48,48]] }]);
    const forest = createTownForest(city, { regions, areaM2: regions[0].areaM2, forestFaceIds: ["f0"], protectedFarmAreaM2: 0, protectedFarmCount: 0 }, undefined, "light");
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(800, 600); renderer.setClearColor(0xc5c5bf); renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(); scene.add(forest.group);
    scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15); sun.position.set(-1, 2, 1); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 3000);
    const originalBudget = { ...FOREST_3D_BUDGET.light };
    const draw = (mode: string) => {
      Object.assign(FOREST_3D_BUDGET.light, originalBudget);
      if (mode.startsWith("tight")) Object.assign(FOREST_3D_BUDGET.light, { triangles: 1, calls: 0 });
      forest.setQuality(mode.startsWith("tight") ? "light" : "standard");
      camera.position.set(85, mode === "far" ? 700 : 90, mode === "far" ? 700 : 120);
      camera.lookAt(mode === "away" ? 800 : 0, 3, mode === "away" ? 800 : 0);
      forest.update(camera, 600); renderer.render(scene, camera);
      const placements = new Map<string, number[]>();
      let genericTrees = 0, duplicates = 0;
      forest.group.traverseVisible((object: any) => {
        if (!object.isInstancedMesh) return;
        for (let i = 0; i < object.count; i++) {
          const matrix = new THREE.Matrix4(); object.getMatrixAt(i, matrix);
          if (new THREE.Vector3().setFromMatrixScale(matrix).length() === 0) continue;
          const key = `${matrix.elements[12]},${matrix.elements[14]}`;
          if (placements.has(key)) duplicates++;
          placements.set(key, [...matrix.elements]);
          if (!object.name.startsWith("forest-bv-")) genericTrees++;
        }
      });
      return { mode, ...structuredClone(forest.stats), genericTrees, duplicates, placements: [...placements].sort(([a], [b]) => a.localeCompare(b)), renderer: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries } };
    };
    const finish = () => {
      scene.remove(forest.group); forest.dispose(); forest.dispose(); renderer.render(scene, camera);
      const geometries = renderer.info.memory.geometries;
      const gl = renderer.getContext(), glError = gl.getError(), contextLost = gl.isContextLost();
      birch.budget = originalPolicy; Object.assign(FOREST_3D_BUDGET.light, originalBudget); renderer.dispose();
      return { geometries, glError, contextLost };
    };
    (window as any).mixedProbe = { draw, finish };
    const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
    return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), viewport: [800,600], dpr: 1, fixture: "Runtime-only silver_birch budget override to bounded; production species/adoption unchanged." };
  });
  const results: any[] = [];
  let baseline: unknown;
  for (const mode of ["tight", "standard", "tight-return", "far", "away", "restored"]) {
    const result = await page.evaluate(mode => (window as any).mixedProbe.draw(mode), mode);
    assert.equal(result.duplicates, 0);
    if (["tight", "standard", "tight-return", "restored"].includes(mode)) {
      baseline ??= result.placements;
      assert.deepEqual(result.placements, baseline);
      assert.equal(result.placements.length, result.trees);
    }
    if (mode.startsWith("tight")) {
      assert.deepEqual(result.detailedSpecies, ["norway_spruce"]);
      assert.ok(result.genericTrees > 0);
    } else if (mode === "standard" || mode === "restored") assert.ok(result.detailedSpecies.includes("silver_birch"));
    if (mode === "far") assert.ok(result.detailedTiers.low > 0);
    if (mode === "away") assert.equal(result.detailedTrees, 0);
    if (["tight", "standard", "far"].includes(mode)) await page.screenshot({ path: resolve(output, `${mode}.png`) });
    const placementsSha256 = createHash("sha256").update(JSON.stringify(result.placements)).digest("hex");
    delete result.placements; results.push({ ...result, placementsSha256 });
  }
  const released = await page.evaluate(() => (window as any).mixedProbe.finish());
  assert.deepEqual(released, { geometries: 0, glError: 0, contextLost: false });
  assert.deepEqual(errors, []);
  const sources = ["scripts/verifyCeMixedForest.mts", "src/city3d/three/forestMeshes.ts", "src/city3d/three/forestTreeDetails.ts", "src/buildings/landscape/trees.ts", "src/buildings/landscape/treeQuality.ts", "src/city-editor/renderers/landscapeTreeSpecies.ts", "src/city-editor/generators/landscapeVegetation.ts", "src/city3d/adoption.ts"];
  writeFileSync(resolve(output, "results.json"), `${JSON.stringify({ ...setup, conditions: "One fixed seed, synthetic mixed budget policies, tight/standard/tight/far/away/restored. Layer correctness and disposal only; not full CE or p95/GPU timing.", sourceSha256: Object.fromEntries(sources.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])), results, released, errors }, null, 2)}\n`);
  console.log(`Verified six mixed-policy states and released geometry; ${setup.gpu}`);
} finally { await browser?.close(); await server.close(); }
