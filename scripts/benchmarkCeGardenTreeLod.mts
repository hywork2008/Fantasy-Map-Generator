/** Finite real-GPU park benchmark; writes JSON only. node --import tsx scripts/benchmarkCeGardenTreeLod.mts */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve(process.argv[2] ?? "docs/analytics/ce-tree-garden-performance-20261029.json");
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 5219, strictPort: true } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/garden-perf.html", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><canvas></canvas>" }));
  await page.goto("http://127.0.0.1:5219/garden-perf.html");
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite module URL.
    const THREE = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser-only Vite module URL.
    const { adoptedTree, sceneVariants } = await import("/src/city3d/adoption.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { createTownOpenSpaces } = await import("/src/city3d/three/openSpaceMeshes.ts");
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: true });
    renderer.setSize(1200, 1600, false);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const gl = renderer.getContext();
    const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (!timer || /swiftshader|llvmpipe/i.test(gpu)) throw new Error(`Real GPU timer required: ${gpu}`);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(80, 160, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 400 });
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: 0x809468 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(45, 0.75, 0.1, 20000);
    camera.position.set(120, 500, 600);
    camera.lookAt(0, 5, 0);
    renderer.shadowMap.enabled = false;
    renderer.render(scene, camera);
    // Three retains its empty shadow sampler texture for this renderer's lifetime.
    const baselineMemory = { ...renderer.info.memory };
    const next = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
    const summarize = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { n: sorted.length, median: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)], max: sorted.at(-1) };
    };
    const frames = [];
    const cleanup = [];
    for (const species of ["mediterranean_cypress", "oriental_evergreen", "sacred_bodhi_and_fig", "peaceful_willow"]) {
      const native = adoptedTree(species, "ultra").create();
      const bounds = new THREE.Box3().setFromObject(native.group);
      let radius = 0;
      native.group.traverseVisible(mesh => {
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) radius = Math.max(radius, Math.hypot(positions.getX(i), positions.getZ(i)));
      });
      native.dispose();
      const sites = Array.from({ length: 260 }, (_, j) => ({ model: species, point: [((j % 20) - 9.5) * 5.5, (Math.floor(j / 20) - 6) * 6], angle: j * 2.39996, height: bounds.max.y, radius }));
      const park = createTownOpenSpaces({ surfaces: [], sites });
      scene.add(park.group);
      for (const shadows of [false, true]) for (const pose of ["overview", "edge", "low"]) {
        renderer.shadowMap.enabled = shadows;
        const base = pose === "overview" ? [120, 500, 600] : pose === "edge" ? [45, 24, 95] : [20, 10, 35];
        const cpu: number[] = [], gpuMs: number[] = [], intervals: number[] = [], queries: WebGLQuery[] = [];
        let previous = await next();
        for (let i = 0; i < 76; i++) {
          const now = await next();
          const at = performance.now();
          camera.position.set(base[0] + Math.sin(i / 75 * Math.PI * 2) * 3, base[1], base[2] + Math.cos(i / 75 * Math.PI * 2) * 2);
          camera.lookAt(0, 5, 0);
          park.update(camera, 1600);
          const query = i >= 12 ? gl.createQuery() : null;
          if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          renderer.render(scene, camera);
          if (query) {
            gl.endQuery(timer.TIME_ELAPSED_EXT);
            queries.push(query);
            cpu.push(performance.now() - at);
            intervals.push(now - previous);
          }
          previous = now;
        }
        for (let i = 0; i < 120 && queries.some(query => !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)); i++) await next();
        if (gl.getParameter(timer.GPU_DISJOINT_EXT)) throw new Error("Disjoint GPU samples");
        for (const query of queries) {
          if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) throw new Error("Incomplete GPU samples");
          gpuMs.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(query);
        }
        const tiers = { low: 0, medium: 0, high: 0, ultra: 0 };
        park.group.traverseVisible(mesh => {
          if (mesh.isInstancedMesh && mesh.count) tiers[mesh.userData.treeQuality] += mesh.count;
        });
        frames.push({ species, shadows, pose, cpu: summarize(cpu), gpu: summarize(gpuMs), interval: summarize(intervals), tiers, variants: sceneVariants(park.group), render: { ...renderer.info.render }, memory: { ...renderer.info.memory } });
      }
      scene.remove(park.group);
      park.dispose();
      renderer.render(scene, camera);
      cleanup.push({ species, ...renderer.info.memory });
    }
    scene.remove(ground);
    ground.geometry.dispose();
    ground.material.dispose();
    scene.remove(sun);
    sun.shadow.dispose();
    renderer.render(scene, camera);
    const memoryAfterDispose = { ...renderer.info.memory };
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error("WebGL error");
    renderer.dispose();
    return { measuredAt: new Date().toISOString(), gpu, userAgent: navigator.userAgent, viewport: [1200, 1600], dpr: 1, trees: 260, shadowMap: 2048, samples: 64, warmup: 12, frames, cleanup, baselineMemory, memoryAfterDispose };
  });
  assert.deepEqual(errors, []);
  assert.equal(result.frames.length, 24);
  for (const frame of result.frames) {
    assert.equal(frame.gpu.n, 64);
    assert.equal(frame.cpu.n, 64);
    assert.ok(Object.values(frame.tiers).reduce((sum, count) => sum + count, 0) > 0);
  }
  assert.equal(result.memoryAfterDispose.geometries, 0);
  assert.equal(result.memoryAfterDispose.textures, result.baselineMemory.textures);
  const sources = ["scripts/benchmarkCeGardenTreeLod.mts", "src/city3d/three/openSpaceMeshes.ts", "src/city3d/three/openSpaceTreeLod.ts", "src/city3d/three/forestTreeDetails.ts", "src/city3d/three/bvInstances.ts", "src/city3d/adoption.ts", "src/buildings/landscape/trees.ts", "src/buildings/landscape/sacredGardenTrees.ts"];
  writeFileSync(output, `${JSON.stringify({ ...result, errors, scope: "Isolated real CE open-space renderer, moving camera; CPU update/submission, asynchronous GPU query and rAF intervals. Not full-city operation p95 or a universal frame budget guarantee.", sourceSha256: Object.fromEntries(sources.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])) }, null, 2)}\n`);
  console.log(`Verified 24 park conditions on ${result.gpu}; wrote ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
