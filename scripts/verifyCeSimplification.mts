/** Verify independent CE detail controls on a hardware GPU. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
const output = resolve("docs/analytics/ce-simplification-controls");
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5205, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript({ content: "globalThis.__name = (fn) => fn;" });
  await page.route("**/simplification.html", r =>
    r.fulfill({ contentType: "text/html", body: "<!doctype html><style>body{margin:0}</style>" })
  );
  await page.goto("http://127.0.0.1:5205/simplification.html");
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Vite browser module.
    const THREE = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Vite browser module.
    const { buildingAppearancePreview } = await import("/src/city-editor/generators/buildingAppearancePreview.ts");
    // @ts-expect-error Vite browser module.
    const { createBvPrototypeCache } = await import("/src/city3d/three/bvInstances.ts");
    // @ts-expect-error Vite browser module.
    const { createTownRegionalHouseLod } = await import("/src/city3d/three/regionalHouseLod.ts");
    // @ts-expect-error Vite browser module.
    const { createTownForest } = await import("/src/city3d/three/forestMeshes.ts");
    // @ts-expect-error Vite browser module.
    const { createDocument } = await import("/src/city-editor/generators/document.ts");
    // @ts-expect-error Vite browser module.
    const { forestRegions } = await import("/src/city-editor/generators/forestGeometry.ts");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d5cfbf");
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888866, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(100, 150, 80);
    scene.add(sun);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1000, 720);
    document.body.append(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(45, 1000 / 720, 0.1, 20000);
    camera.position.set(0, 190, 240);
    camera.lookAt(0, 0, 0);
    const source = buildingAppearancePreview("northern-wooded")[0];
    const lots = Array.from({ length: 90 }, (_, i) => ({
      ...source,
      id: `h${i}`,
      polygon: source.polygon.map(([x, y]: number[]) => [x + (i % 10) * 10 - 65, y + Math.floor(i / 10) * 15 - 60])
    }));
    const regions = forestRegions([
      {
        faceId: "f",
        polygon: [
          [50, -32],
          [114, -32],
          [114, 32],
          [50, 32]
        ]
      }
    ]);
    const plan = {
      regions,
      areaM2: regions[0].areaM2,
      forestFaceIds: ["f"],
      protectedFarmCount: 0,
      protectedFarmAreaM2: 0
    };
    const city = createDocument("simplification-browser", 200);
    const cache = createBvPrototypeCache();
    let houses: ReturnType<typeof createTownRegionalHouseLod> | undefined;
    let forest: ReturnType<typeof createTownForest> | undefined;
    const gl = renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    (window as any).probe = {
      async set(urban: boolean, outskirts: boolean) {
        houses?.dispose();
        forest?.dispose();
        houses = createTownRegionalHouseLod(lots, cache, undefined, "high", undefined, urban);
        forest = createTownForest(city, plan, undefined, "high", outskirts);
        scene.add(houses.group, forest.group);
        for (let i = 0; i < 50; i++) houses.update(camera, 720);
        forest.update(camera, 720);
        renderer.render(scene, camera);
        await new Promise(requestAnimationFrame);
        return {
          housing: { ...houses.stats },
          forest: { ...forest.stats },
          render: { ...renderer.info.render },
          glError: gl.getError(),
          contextLost: gl.isContextLost(),
          geometries: renderer.info.memory.geometries
        };
      },
      dispose() {
        houses?.dispose();
        forest?.dispose();
        renderer.dispose();
      }
    };
    return { gpu };
  });
  assert.doesNotMatch(setup.gpu, /swiftshader|llvmpipe|software/i);
  const cases = [];
  for (const [name, urban, outskirts] of [
    ["automatic", true, true],
    ["urban-full", false, true],
    ["outskirts-full", true, false]
  ] as const) {
    const data = await page.evaluate(async ({ urban, outskirts }) => (window as any).probe.set(urban, outskirts), {
      urban,
      outskirts
    });
    assert.equal(data.glError, 0);
    assert.equal(data.contextLost, false);
    if (!urban) assert.equal(data.housing.buildings, 90);
    if (!outskirts) assert.ok(data.forest.detailedTrees > 16);
    await page.screenshot({ path: resolve(output, `${name}.png`) });
    cases.push({ name, urbanSimplification: urban, outskirtsSimplification: outskirts, ...data });
  }
  assert.deepEqual(cases[0].forest, cases[1].forest);
  assert.deepEqual(cases[0].housing, cases[2].housing);
  assert.deepEqual(errors, []);
  await page.evaluate(() => (window as any).probe.dispose());
  writeFileSync(
    resolve(output, "results.json"),
    JSON.stringify({ ...setup, viewport: [1000, 720], errors, cases }, null, 2) + "\n"
  );
  console.log(
    JSON.stringify({
      gpu: setup.gpu,
      cases: cases.map(c => ({
        name: c.name,
        houses: c.housing.buildings,
        bvTrees: c.forest.detailedTrees,
        triangles: c.render.triangles
      }))
    })
  );
} finally {
  await browser?.close();
  await server.close();
}
