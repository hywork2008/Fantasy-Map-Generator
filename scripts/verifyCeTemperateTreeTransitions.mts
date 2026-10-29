/** Compare adopted tiers at a shared scale, both native and CE-normalized. JSON by default; optional OS-temp preview. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve(process.argv[2] ?? "docs/analytics/ce-tree-temperate-transitions-20261029.json");
const azimuth = Number(process.env.CE_TREE_AZIMUTH ?? 0);
const targetPixels = Number(process.env.CE_TREE_PIXELS ?? 90);
assert.ok(Number.isFinite(azimuth) && [28, 90].includes(targetPixels));
let preview: string | undefined;
if (process.env.CE_TREE_PREVIEW_DIR) {
  preview = realpathSync(process.env.CE_TREE_PREVIEW_DIR);
  const childOf = (parent: string, child: string) => {
    const path = relative(parent, child);
    return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
  };
  assert.ok(childOf(realpathSync(tmpdir()), preview) && !childOf(realpathSync(process.cwd()), preview));
}
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5220, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 720, height: 1080 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/tree-transitions.html", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><style>body{margin:0;background:#c5c5bf}canvas{display:block}#labels{position:absolute;inset:0;display:grid;grid-template-columns:repeat(4,180px);grid-template-rows:repeat(6,180px);font:12px system-ui;text-align:center}</style><canvas></canvas><div id="labels"></div>' }));
  await page.goto("http://127.0.0.1:5220/tree-transitions.html");
  const results = [];
  for (const mode of ["native", "normalized"]) {
    const result = await page.evaluate(async ({ mode, azimuth, targetPixels }) => {
      // @ts-expect-error Browser-only Vite module URL.
      const THREE = await import("/node_modules/three/build/three.module.js");
      // @ts-expect-error Browser-only Vite module URL.
      const { adoptedTree } = await import("/src/city3d/adoption.ts");
      // @ts-expect-error Browser-only Vite module URL.
      const { createBvPrototypeCache } = await import("/src/city3d/three/bvInstances.ts");
      const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(720, 1080, false);
      renderer.setClearColor(0xc5c5bf, 0);
      const gl = renderer.getContext();
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
      const sun = new THREE.DirectionalLight(0xffffff, 1.15);
      sun.position.set(80, 160, 70);
      scene.add(sun);
      const cache = createBvPrototypeCache();
      const frames = [], labels: string[] = [];
      let row = 0;
      renderer.setScissorTest(true);
      for (const species of ["garden_parkland", "sacred_yew"]) {
        const entries = ["low", "medium", "high", "ultra"].map(quality => {
          const variant = adoptedTree(species, quality);
          const lease = cache.acquire({ id: variant.id, cacheKey: variant.id, create: variant.create });
          if (!lease) throw new Error(variant.id);
          const geometry = lease.geometry.clone();
          if (mode === "normalized") {
            const positions = geometry.getAttribute("position");
            let radius = 0;
            for (let i = 0; i < positions.count; i++) radius = Math.max(radius, Math.hypot(positions.getX(i), positions.getZ(i)));
            geometry.scale(4 / radius, 10 / lease.bounds.max.y, 4 / radius);
          }
          geometry.computeBoundingBox();
          return { quality, variant: variant.id, lease, mesh: new THREE.Mesh(geometry, lease.material) };
        });
        for (const elevation of [12, 40, 70]) {
          const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 300);
          const angle = elevation * Math.PI / 180;
          const bearing = azimuth * Math.PI / 180;
          camera.position.set(Math.sin(bearing) * Math.cos(angle) * 100, 5 + Math.sin(angle) * 100, Math.cos(bearing) * Math.cos(angle) * 100);
          camera.lookAt(0, 5, 0);
          camera.updateMatrixWorld(true);
          const highBox = entries[2].mesh.geometry.boundingBox;
          const projected = new THREE.Box3();
          for (const x of [highBox.min.x, highBox.max.x]) for (const y of [highBox.min.y, highBox.max.y]) for (const z of [highBox.min.z, highBox.max.z]) projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
          const half = projected.getSize(new THREE.Vector3()).y * 180 / (2 * targetPixels);
          camera.left = camera.bottom = -half;
          camera.right = camera.top = half;
          camera.updateProjectionMatrix();
          const masks: Uint8Array[] = [];
          for (const [column, entry] of entries.entries()) {
            const x = column * 180, y = 1080 - (row + 1) * 180;
            renderer.setViewport(x, y, 180, 180);
            renderer.setScissor(x, y, 180, 180);
            scene.add(entry.mesh);
            renderer.render(scene, camera);
            scene.remove(entry.mesh);
            const pixels = new Uint8Array(180 * 180 * 4), mask = new Uint8Array(180 * 180);
            gl.readPixels(x, y, 180, 180, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            let area = 0, minX = 180, maxX = -1, minY = 180, maxY = -1;
            for (let i = 0; i < mask.length; i++) if (pixels[i * 4 + 3] >= 128) {
              mask[i] = 1;
              area++;
              minX = Math.min(minX, i % 180); maxX = Math.max(maxX, i % 180);
              minY = Math.min(minY, Math.floor(i / 180)); maxY = Math.max(maxY, Math.floor(i / 180));
            }
            masks.push(mask);
            frames.push({ species, elevation, quality: entry.quality, variant: entry.variant, area, width: maxX - minX + 1, height: maxY - minY + 1, triangles: entry.mesh.geometry.getAttribute("position").count / 3, bounds: { min: entry.mesh.geometry.boundingBox.min.toArray(), max: entry.mesh.geometry.boundingBox.max.toArray() } });
            labels.push(`<div>${species}<br>${entry.quality} ${elevation}° ${mode}</div>`);
          }
          for (let i = 0; i < 4; i++) {
            let intersection = 0, union = 0;
            for (let p = 0; p < masks[i].length; p++) { intersection += masks[i][p] & masks[2][p]; union += masks[i][p] | masks[2][p]; }
            Object.assign(frames[frames.length - 4 + i], { iouWithHigh: intersection / union });
          }
          row++;
        }
        for (const entry of entries) { entry.mesh.geometry.dispose(); entry.lease.release(); }
      }
      document.querySelector("#labels")!.innerHTML = labels.join("");
      if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error("WebGL error");
      renderer.setScissorTest(false);
      renderer.dispose();
      return { mode, gpu, frames };
    }, { mode, azimuth, targetPixels });
    results.push(result);
    if (preview) await page.screenshot({ path: resolve(preview, `${mode}.png`) });
  }
  assert.deepEqual(errors, []);
  for (const result of results) for (const frame of result.frames) assert.ok(frame.area > 0 && frame.width < 180 && frame.height < 180);
  const paths = ["scripts/verifyCeTemperateTreeTransitions.mts", "src/buildings/landscape/temperateTreeLod.ts", "src/buildings/landscape/smallLeavedLime.ts", "src/buildings/landscape/europeanYew.ts", "src/buildings/landscape/treeVariants.ts", "src/city3d/three/forestTreeDetails.ts", "src/city3d/adoption.ts"];
  writeFileSync(output, `${JSON.stringify({ measuredAt: new Date().toISOString(), azimuth, targetPixels, conditions: "CE prototypes; native or radius 4 m / above-ground height 10 m; shared high-tier projected AABB scale; alpha >= 128; shared camera across tiers; three elevations, no shadows. Pixel metrics describe this rasterization, not perceptual equivalence or a GPU benchmark.", results, errors, sourceSha256: Object.fromEntries(paths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])) }, null, 2)}\n`);
  console.log(`Verified ${results.length * 24} tier comparisons; wrote ${output}${preview ? `; temporary preview ${preview}` : ""}`);
} finally {
  await browser?.close();
  await server.close();
}
