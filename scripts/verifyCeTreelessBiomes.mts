/** Public SVG/3D entry points with stale saved forests and park candidates. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
const output = resolve("docs/analytics/ce-tree-biome-policy-20261029");
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5214, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/vegetation-audit.html", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><style>body{margin:0}canvas{display:block}</style><canvas></canvas>" }));
  await page.goto("http://127.0.0.1:5214/vegetation-audit.html");
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite module URL.
    const THREE = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser-only Vite module URL.
    const { createDocument } = await import("/src/city-editor/generators/document.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { forestRegions } = await import("/src/city-editor/generators/forestGeometry.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { createTownForest } = await import("/src/city3d/three/forestMeshes.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { createTownOpenSpaces } = await import("/src/city3d/three/openSpaceMeshes.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { collectOpenSpacePlan } = await import("/src/city-editor/renderers/openSpaceSites.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { renderForestLayer } = await import("/src/city-editor/renderers/forestSvg.ts");
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(800, 600); renderer.setClearColor(0xc5c5bf); renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15); sun.position.set(-1, 2, 1); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 2000); camera.position.set(85, 90, 120); camera.lookAt(0, 3, 0);
    const polygon = [[-48,-48],[48,-48],[48,48],[-48,48]];
    const regions = forestRegions([{ faceId: "f0", polygon }]);
    const plan = { regions, areaM2: regions[0].areaM2, forestFaceIds: ["f0"], protectedFarmAreaM2: 0, protectedFarmCount: 0 };
    const park = { faceId: "park", lawnPolygons: [], paths: [], grassTufts: [], trees: [{ center: [0, 0], radius: 3, subCircles: [] }] };
    const draw = (key: string) => {
      const city = createDocument("treeless-v1", 160);
      city.biome = { id: 1, key, name: key, color: "grey" };
      const forest = createTownForest(city, plan, undefined, "standard", false);
      const sites = collectOpenSpacePlan([park], [], city);
      const trees = createTownOpenSpaces(sites);
      forest.update(camera, 600); trees.update(camera, 600);
      scene.add(forest.group, trees.group); renderer.render(scene, camera);
      const result = { key, areaM2: forest.stats.areaM2, forestTrees: forest.stats.trees, triangles: forest.stats.triangles, parkSites: sites.sites.length, svgTrees: renderForestLayer(city, plan).querySelectorAll("use").length };
      scene.remove(forest.group, trees.group); forest.dispose(); trees.dispose();
      return result;
    };
    const releaseCheck = () => { renderer.render(scene, camera); return renderer.info.memory.geometries; };
    const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
    (window as any).vegetationProbe = { draw, releaseCheck, finish() { if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error("WebGL error"); renderer.dispose(); } };
    return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), viewport: [800, 600], dpr: 1 };
  });
  const results = [];
  for (const key of ["temperateDeciduousForest", "marine", "tundra", "glacier", "lavaField", "custom:unknown"]) {
    const result = await page.evaluate(key => (window as any).vegetationProbe.draw(key), key);
    const treeless = ["marine", "tundra", "glacier", "lavaField"].includes(key);
    for (const field of ["areaM2", "forestTrees", "triangles", "parkSites", "svgTrees"] as const)
      if (treeless) assert.equal(result[field], 0); else assert.ok(result[field] > 0);
    await page.screenshot({ path: resolve(output, `${key.replaceAll(":", "-")}.png`) });
    const geometriesAfterDispose = await page.evaluate(() => (window as any).vegetationProbe.releaseCheck());
    assert.equal(geometriesAfterDispose, 0);
    results.push({ ...result, geometriesAfterDispose });
  }
  await page.evaluate(() => (window as any).vegetationProbe.finish());
  assert.deepEqual(errors, []);
  writeFileSync(resolve(output, "results.json"), `${JSON.stringify({ ...setup, conditions: "Six fixed cases with deliberately stale forest and saved park tree candidates. Public SVG/3D entry-point check, not full CE or a frame/GPU benchmark.", results, errors }, null, 2)}\n`);
  console.log(`Verified six biome cases, zero retained geometries; ${setup.gpu}`);
} finally { await browser?.close(); await server.close(); }
