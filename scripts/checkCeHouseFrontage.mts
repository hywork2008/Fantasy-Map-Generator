/** node --import tsx scripts/checkCeHouseFrontage.mts */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5198, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  await page.addInitScript("globalThis.__name = value => value;");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/house-frontage-check.html", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
  await page.goto("http://127.0.0.1:5198/house-frontage-check.html");
  const preview = await page.evaluate(async () => (await import("/scripts/lib/ceHouseFrontagePreview.ts")).run());
  writeFileSync("docs/analytics/ce-house-frontage-20261026.png", Buffer.from(preview.image.split(",")[1], "base64"));
  await page.goto("http://127.0.0.1:5198/house-frontage-check.html");
  await page.evaluate(async () => {
    const { THREE } = await import("/scripts/lib/ceHouseFrontagePreview.ts");
    const { createGridDocument } = await import("/src/city-editor/generators/document.ts");
    const { generateCityOnDocument } = await import("/src/city-editor/generators/generation/generateCity.ts");
    const { defaultGenerationSettings } = await import("/src/city-editor/generators/generation/settings.ts");
    const { withBuildingAppearance } = await import("/src/city-editor/generators/buildingAppearance.ts");
    const { mountCity3d } = await import("/src/city-editor/renderers/cityView.ts");
    const state = window as any;
    const originalAdd = THREE.Scene.prototype.add;
    THREE.Scene.prototype.add = function(...objects) {
      state.houseScene = this;
      return originalAdd.apply(this, objects);
    };
    const originalProjection = THREE.PerspectiveCamera.prototype.updateProjectionMatrix;
    THREE.PerspectiveCamera.prototype.updateProjectionMatrix = function() {
      state.houseCamera = this;
      originalProjection.call(this);
    };
    const seed = "regional-appearance";
    const settings = defaultGenerationSettings();
    settings.buildingPattern = "medieval";
    settings.historicalPeriod = "highMedieval";
    state.houseCity = withBuildingAppearance(generateCityOnDocument(createGridDocument({ size: "small", grid: "evolution", seed }), settings, seed), "northern-urban");
    state.houseQuality = "high";
    document.body.innerHTML = '<style>body{margin:0}.ce-3d{width:1200px;height:800px}.ce-view-toggle{position:absolute;top:8px;left:8px}.ce-3d-readout{position:absolute;bottom:8px;left:8px;background:#fff;padding:8px;white-space:pre}</style><div id="host"></div><div id="map"></div>';
    state.houseView = mountCity3d({
      canvasHost: document.querySelector("#host")!, map: document.querySelector("#map")!,
      getDocument: () => state.houseCity, getModelQuality: () => state.houseQuality, isFmgLinked: () => true,
      scope: { own() {}, listen(target: EventTarget, type: string, handler: EventListener) { target.addEventListener(type, handler); } }
    });
  });
  await page.locator(".ce-view-toggle").click();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const pick = await page.evaluate(async () => {
    const { THREE } = await import("/scripts/lib/ceHouseFrontagePreview.ts");
    const state = window as any;
    const layer = state.houseScene.getObjectByName("ce-regional-houses");
    const meshes = layer.children as InstanceType<typeof THREE.InstancedMesh>[];
    if (!meshes.length) throw new Error("No actual CE house replacements");
    const mesh = meshes.reduce((a, b) => {
      const centre = (m: InstanceType<typeof THREE.InstancedMesh>) => m.boundingBox!.getCenter(new THREE.Vector3()).length();
      return centre(a) < centre(b) ? a : b;
    });
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    mesh.updateWorldMatrix(true, false);
    matrix.premultiply(mesh.matrixWorld);
    const actualGeometry = mesh.geometry.clone().applyMatrix4(matrix);
    actualGeometry.computeBoundingBox();
    const bounds = actualGeometry.boundingBox!.clone();
    actualGeometry.dispose();
    const target = bounds.getCenter(new THREE.Vector3());
    state.houseView.restoreView({ position: [target.x + 16, target.y + 22, target.z + 28], target: target.toArray(), zoom: 1, fov: 45 });
    state.houseCamera.updateMatrixWorld(true);
    const rect = document.querySelector(".ce-3d canvas")!.getBoundingClientRect();
    state.housePickedBounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
    // Find a screen point whose closest visible surface is this exact instance.
    const candidates = [target, new THREE.Vector3(target.x, bounds.max.y - 0.2, target.z)];
    for (const point of candidates) {
      const ndc = point.clone().project(state.houseCamera);
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), state.houseCamera);
      const pickables: InstanceType<typeof THREE.Mesh>[] = [];
      state.houseScene.traverse((object: any) => { if (object instanceof THREE.Mesh) pickables.push(object); });
      const hit = ray.intersectObjects(pickables, false)[0];
      if (hit?.object === mesh && hit.instanceId === 0) return { x: (ndc.x + 1) * rect.width / 2, y: (1 - ndc.y) * rect.height / 2, houses: meshes.reduce((sum, m) => sum + m.count, 0) };
    }
    throw new Error("Selected fixture house is occluded");
  });
  await page.locator(".ce-3d canvas").click({ position: { x: pick.x, y: pick.y } });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const actual = await page.evaluate(async () => {
    const { THREE } = await import("/scripts/lib/ceHouseFrontagePreview.ts");
    const state = window as any;
    const highlight = state.houseScene.children.find((object: any) => object instanceof THREE.LineSegments);
    if (!highlight) throw new Error("No actual CE house selection outline");
    const bounds = new THREE.Box3().setFromObject(highlight);
    const expected = state.housePickedBounds;
    const delta = [...bounds.min.toArray().map((v, i) => Math.abs(v - expected.min[i])), ...bounds.max.toArray().map((v, i) => Math.abs(v - expected.max[i]))];
    if (Math.max(...delta) > 0.001) throw new Error(`Selection does not match BV geometry: ${delta}`);
    const gl = (document.querySelector(".ce-3d canvas") as HTMLCanvasElement).getContext("webgl2")!;
    const error = gl.getError();
    if (error || gl.isContextLost()) throw new Error(`WebGL failure: ${error}`);
    return { outlineErrorMeters: Math.max(...delta), readout: document.querySelector(".ce-3d-readout")!.textContent, error };
  });
  await page.locator(".ce-3d").screenshot({ path: "docs/analytics/ce-house-frontage-city-20261026.png" });
  await page.evaluate(() => { (window as any).houseQuality = "low"; (window as any).houseView.sync(); });
  await page.evaluate(() => (window as any).houseView.dispose());
  if (errors.length) throw new Error(errors.join("\n"));
  const report = { errors, preview: preview.report, actual, houses: pick.houses };
  writeFileSync("docs/analytics/ce-house-frontage-20261026.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await server.close();
}
