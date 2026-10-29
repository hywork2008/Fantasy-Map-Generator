/** F5-2 finite forest-layer matrix; no full-city or frame-time claim. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve("docs/analytics/ce-forest-quality-matrix-20261029");
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5216, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/forest-matrix.html", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>" }));
  await page.goto("http://127.0.0.1:5216/forest-matrix.html");
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
    // @ts-expect-error Browser-only Vite module URL.
    const { DEFAULT_SUN, updateSun } = await import("/src/city-editor/renderers/sunLighting.ts");
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(800, 600); renderer.setClearColor(0xc5c5bf); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.info.autoReset = false;
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.shadow.mapSize.set(4096,4096); sun.shadow.autoUpdate = false; scene.add(sun, sun.target);
    const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.5, 80000);
    const profiles = [treeLodProfile("norway_spruce"), treeLodProfile("silver_birch")];
    const policies = profiles.map((profile: any) => profile.budget);
    let forest: any, fixture: string, simplify: boolean;
    const start = (input: { fixture: string; simplify: boolean }) => {
      fixture = input.fixture; simplify = input.simplify;
      profiles.forEach((profile: any, i: number) => { profile.budget = fixture === "bounded" || (fixture === "mixed" && i === 1) ? "bounded" : policies[i]; });
      const city = createDocument("forest-quality-matrix-v1", 100);
      city.biome = { id: 1, key: "taiga", name: "Taiga", color: "green" };
      const regions = forestRegions([{ faceId: "forest", polygon: [[-24,-24],[24,-24],[24,24],[-24,24]] }]);
      forest = createTownForest(city, { regions, areaM2: regions[0].areaM2, forestFaceIds: ["forest"], protectedFarmAreaM2: 0, protectedFarmCount: 0 }, undefined, "light", simplify);
      scene.add(forest.group);
    };
    const draw = (input: { quality: string; view: string; shadows: boolean }) => {
      const { quality, view, shadows } = input;
      forest.setQuality(quality);
      camera.position.set(...(view === "far" ? [0,700,1] : view === "edge" ? [30,12,45] : [50,60,75])); camera.lookAt(0,4,0);
      const changed = forest.update(camera,600);
      const before = JSON.stringify(forest.stats);
      const unchanged = !forest.update(camera,600) && before === JSON.stringify(forest.stats);
      updateSun(sun, forest.bounds, { ...DEFAULT_SUN, enabled: true, shadows });
      renderer.shadowMap.needsUpdate = true;
      let shadowCalls = 0, shadowTriangles = 0, duplicates = 0;
      const placements = new Map<string, number[]>();
      forest.group.traverse((object: any) => {
        if (object.isMesh) object.onBeforeShadow = () => {
          shadowCalls++;
          shadowTriangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3 * (object.isInstancedMesh ? object.count : 1);
        };
      });
      forest.group.traverseVisible((object: any) => {
        if (!object.isInstancedMesh) return;
        for (let i = 0; i < object.count; i++) {
          const m = new THREE.Matrix4(); object.getMatrixAt(i,m);
          if (new THREE.Vector3().setFromMatrixScale(m).length() === 0) continue;
          const key = `${m.elements[12]},${m.elements[14]}`;
          if (placements.has(key)) duplicates++;
          placements.set(key,[...m.elements]);
        }
      });
      renderer.info.reset(); renderer.render(scene,camera);
      const gl = renderer.getContext();
      return { fixture, simplify, requestedQuality: quality, view, shadows, changed, unchanged, ...structuredClone(forest.stats), budget: FOREST_3D_BUDGET[quality], shadowCalls, submittedShadowTriangles: shadowTriangles, duplicates, placements: [...placements].sort(([a],[b])=>a.localeCompare(b)), rendered: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }, glError: gl.getError(), contextLost: gl.isContextLost() };
    };
    const release = () => {
      scene.remove(forest.group); forest.dispose(); forest.dispose();
      sun.castShadow = false; renderer.info.reset(); renderer.render(scene,camera);
      profiles.forEach((profile: any, i: number) => { profile.budget = policies[i]; });
      return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, shadowTextures: (sun.shadow.map ? 1 + Number(Boolean(sun.shadow.map.depthTexture)) : 0) + (sun.shadow.mapPass ? 1 : 0) };
    };
    const finish = () => {
      sun.shadow.map?.dispose(); sun.shadow.mapPass?.dispose(); renderer.dispose();
      return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    };
    (window as any).forestMatrix = { start, draw, release, finish };
    const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
    return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), viewport: [800,600], dpr: 1, shadowMapSize: 4096, seed: "forest-quality-matrix-v1", sideMeters: 48, sun: { ...DEFAULT_SUN, enabled: true } };
  });
  const results: any[] = [], releases: any[] = [];
  for (const fixture of ["native", "mixed", "bounded"]) for (const simplify of [true,false]) {
    await page.evaluate(input => (window as any).forestMatrix.start(input), { fixture, simplify });
    const signatures = new Map<string,string>();
    for (const quality of ["light","standard","high"]) for (const view of ["overview","edge","far"]) for (const shadows of [false,true]) {
      const result = await page.evaluate(input => (window as any).forestMatrix.draw(input), { quality, view, shadows });
      assert.equal(result.glError,0); assert.equal(result.contextLost,false); assert.equal(result.duplicates,0); assert.equal(result.unchanged,true);
      assert.ok(result.rendered.triangles > 0);
      assert.ok(Math.abs(result.areaM2 - 2304) < 0.001);
      assert.equal(result.placements.length,result.trees);
      if (!shadows) assert.equal(result.shadowCalls,0);
      else assert.ok(result.submittedShadowTriangles <= result.shadowTriangles);
      if (simplify) {
        assert.ok(result.shadowTriangles <= result.budget.shadowTriangles);
        if (fixture === "bounded") for (const field of ["trees","triangles","calls"]) assert.ok(result[field] <= result.budget[field]);
      } else {
        assert.equal(result.quality,"high"); assert.ok(result.trees > 0); assert.equal(result.detailedTiers.ultra,result.trees);
      }
      if (fixture === "native" || !simplify) assert.equal(result.trees,result.detailedTrees);
      const signature = JSON.stringify({ placements: result.placements, tiers: result.detailedTiers });
      const key = fixture === "native" || !simplify ? view : `${quality}:${view}`;
      if (signatures.has(key)) assert.equal(signature,signatures.get(key)); else signatures.set(key,signature);
      if (view === "overview" && quality === "standard") await page.screenshot({ path: resolve(output,`${fixture}-${simplify ? "auto" : "off"}-${shadows ? "shadow" : "plain"}.png`) });
      const placementsSha256 = createHash("sha256").update(JSON.stringify(result.placements)).digest("hex");
      delete result.placements; results.push({ ...result, placementsSha256 });
    }
    const released = await page.evaluate(() => (window as any).forestMatrix.release());
    assert.equal(released.geometries,0); assert.equal(released.textures,released.shadowTextures); releases.push({ fixture, simplify, ...released });
  }
  const finalMemory = await page.evaluate(() => (window as any).forestMatrix.finish());
  assert.deepEqual(finalMemory,{ geometries: 0, textures: 0 }); assert.deepEqual(errors,[]);
  const sources = ["scripts/verifyCeForestQualityMatrix.mts", "src/city3d/three/forestMeshes.ts", "src/city3d/three/forestTreeDetails.ts", "src/city-editor/renderers/sunLighting.ts", "src/city-editor/renderers/cityView.ts", "src/buildings/landscape/trees.ts", "src/buildings/landscape/treeQuality.ts", "src/city3d/adoption.ts"];
  writeFileSync(resolve(output,"results.json"),`${JSON.stringify({ ...setup, conditions: "3 runtime policy fixtures x 3 quality settings x 2 simplification settings x 2 shadow settings x 3 views = 108 fixed forest-layer cases. Native flora/adoption unchanged. Not full CE, frame/GPU timing or p95.", sourceSha256: Object.fromEntries(sources.map(path => [path,createHash("sha256").update(readFileSync(path)).digest("hex")])), results, releases, finalMemory, errors },null,2)}\n`);
  console.log(`Verified ${results.length} quality/simplification/shadow cases; ${setup.gpu}`);
} finally { await browser?.close(); await server.close(); }
