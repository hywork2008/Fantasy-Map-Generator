/** F1-1 adopted lime/yew reference images using the CE prototype pipeline */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve(process.argv[2] ?? "docs/analytics/ce-tree-lime-yew-adjusted-20261029");
let preview: string | undefined;
if (process.env.CE_TREE_PREVIEW_DIR) {
  preview = realpathSync(process.env.CE_TREE_PREVIEW_DIR);
  const childOf = (parent: string, child: string) => {
    const path = relative(parent, child);
    return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
  };
  assert.ok(childOf(realpathSync(tmpdir()), preview) && !childOf(realpathSync(process.cwd()), preview));
}
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5219, strictPort: true }
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript({ content: "globalThis.__name = fn => fn;" });
  await page.route("**/garden-lod.html", route =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><style>body{margin:0;background:#d5cfbf;font:16px system-ui}canvas{display:block}#labels{position:absolute;inset:0;pointer-events:none;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr)}#labels>div{text-align:center;padding-top:8px}</style><canvas></canvas><div id='labels'></div>"
    })
  );
  await page.goto("http://127.0.0.1:5219/garden-lod.html");
  const setup = await page.evaluate(async () => {
    // @ts-expect-error Browser-only Vite module URL.
    const THREE = await import("/node_modules/three/build/three.module.js");
    // @ts-expect-error Browser-only Vite module URL.
    const { adoptedTree, sceneVariants } = await import("/src/city3d/adoption.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { TREE_VARIANTS } = await import("/src/buildings/landscape/treeVariants.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { createBvPrototypeCache } = await import("/src/city3d/three/bvInstances.ts");
    // @ts-expect-error Browser-only Vite module URL.
    const { DEFAULT_SUN, updateSun } = await import("/src/city-editor/renderers/sunLighting.ts");
    const renderer = new THREE.WebGLRenderer({
      canvas: document.querySelector("canvas"),
      antialias: true,
      preserveDrawingBuffer: true
    });
    renderer.setSize(1200, 800, false);
    renderer.setClearColor(0xc5c5bf);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(1);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    updateSun(sun, new THREE.Box3(new THREE.Vector3(-10,-0.35,-10),new THREE.Vector3(10,15,10)),DEFAULT_SUN);
    scene.add(sun, sun.target);
    const camera = new THREE.OrthographicCamera(-10.5, 10.5, 14, -14, 0.1, 300);
    const qualities = ["low", "medium", "high", "ultra"];
    const cache = createBvPrototypeCache();
    const models = ["garden_parkland", "sacred_yew"].flatMap(species =>
      qualities.map(quality => {
        const variant = adoptedTree(species, quality);
        const source = variant.create();
        const bounds = new THREE.Box3().setFromObject(source.group);
        const nativeGeometry = new Set(), nativeMaterials = new Set();
        let nativeTriangles = 0;
        source.group.traverseVisible(object => {
          if (!object.isMesh) return;
          nativeGeometry.add(object.geometry); nativeMaterials.add(object.material);
          nativeTriangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3;
        });
        let nativeBufferBytes = 0;
        for (const geometry of nativeGeometry) {
          nativeBufferBytes += geometry.index?.array.byteLength ?? 0;
          for (const attribute of Object.values(geometry.attributes)) nativeBufferBytes += attribute.array.byteLength;
        }
        const native = { triangles: nativeTriangles, materials: nativeMaterials.size, bufferBytes: nativeBufferBytes, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
        source.dispose();
        const start = performance.now();
        const lease = cache.acquire({ id: variant.id, cacheKey: variant.id, create: variant.create });
        if (!lease) throw new Error(`Unsupported CE prototype: ${variant.id}`);
        const group = new THREE.Group();
        group.add(new THREE.Mesh(lease.geometry, lease.material));
        return {
          species,
          quality,
          variant: variant.id,
          author: variant.author,
          basedOn: variant.basedOn ?? [],
          native,
          prototype: { buildMs: performance.now() - start, triangles: (lease.geometry.index?.count ?? lease.geometry.getAttribute("position").count) / 3, bufferBytes: Object.values(lease.geometry.attributes).reduce((n,attribute)=>n+attribute.array.byteLength,lease.geometry.index?.array.byteLength ?? 0), bounds: { min: lease.bounds.min.toArray(), max: lease.bounds.max.toArray() } },
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
          y = 400 - Math.floor(i / 4) * 400;
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
      renderer.setViewport(0, 0, 1200, 800);
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
        renderer.setViewport((i % 4) * 300, 400 - Math.floor(i / 4) * 400, 300, 400);
        renderer.setScissor((i % 4) * 300, 400 - Math.floor(i / 4) * 400, 300, 400);
        scene.add(model.group);
        renderer.render(scene, camera);
        scene.remove(model.group);
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 800);
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
        renderer.setViewport((i % 2) * 600, 400 - Math.floor(i / 2) * 400, 600, 400);
        renderer.setScissor((i % 2) * 600, 400 - Math.floor(i / 2) * 400, 600, 400);
        scene.add(mesh);
        renderer.render(scene, standCamera);
        scene.remove(mesh);
        mesh.dispose();
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, 1200, 800);
    };
    const gl = renderer.getContext(), debug = gl.getExtension("WEBGL_debug_renderer_info");
    const measure = models.map(({ species,quality,variant,author,basedOn,native,prototype }) => ({ species,quality,variant,author,basedOn,native,prototype }));
    for (const { lease } of models) for (const name of ["position","normal","color"]) {
      const attribute=lease.geometry.getAttribute(name);
      if (!attribute || !Array.from(attribute.array).every(Number.isFinite)) throw new Error(`Invalid ${name}`);
    }
    (window as any).baselineProbe = {
      drawModels, drawSingles, drawStands,
      finish() {
        models.forEach(({ model })=>model.dispose());
        renderer.setScissorTest(false); renderer.setViewport(0,0,1200,800); renderer.render(scene,camera);
        const memory={ geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures };
        if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error("WebGL error");
        renderer.dispose(); return memory;
      }
    };
    return { gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), viewport:[1200,800], dpr:1, lighting:"CE default updateSun(DEFAULT_SUN), HemisphereLight, shadows off",measure,
      comparisonMedium: TREE_VARIANTS.filter(v=>v.level === "medium" && ["tree.garden-parkland","tree.sacred-yew"].includes(v.family)).map(v=>({ id:v.id,author:v.author,basedOn:v.basedOn ?? [] })) };
  });
  assert.ok(!/swiftshader|llvmpipe/i.test(setup.gpu));
  for (const species of ["garden_parkland","sacred_yew"]) {
    const rows=setup.measure.filter(m=>m.species === species);
    assert.deepEqual(rows.map(m=>m.quality),["low","medium","high","ultra"]);
    let previous=0;
    for (const row of rows) {
      assert.ok(row.native.triangles > previous);previous=row.native.triangles;
      assert.equal(row.native.triangles,row.prototype.triangles);
      assert.ok(Math.abs(row.native.bounds.min[1]+0.35)<0.001);
      if (row.quality === "low") assert.ok(row.native.triangles<500);
      if (row.quality === "medium") { assert.ok(row.native.triangles<3000); assert.equal(row.author,"Claude Opus 5.5"); }
    }
  }
  for (const pose of ["front","side","top"]) {
    await page.evaluate(pose=>(window as any).baselineProbe.drawModels(pose),pose);
    if (preview) await page.screenshot({ path:resolve(preview,`models-${pose}.png`) });
  }
  for (const angle of [12,40,70]) {
    await page.evaluate(angle=>(window as any).baselineProbe.drawSingles(angle),angle);
    if (preview) await page.screenshot({ path:resolve(preview,`single-medium-high-${angle}.png`) });
  }
  await page.evaluate(()=>(window as any).baselineProbe.drawStands());
  if (preview) await page.screenshot({ path:resolve(preview,"stand-medium-high.png") });
  const released=await page.evaluate(()=>(window as any).baselineProbe.finish());
  assert.deepEqual(released,{ geometries:0,textures:0 });assert.deepEqual(errors,[]);
  await page.close();
  const bv=await browser.newPage({ viewport:{ width:1440,height:1000 },deviceScaleFactor:1 });
  const bvErrors:string[]=[];bv.on("pageerror",e=>bvErrors.push(e.message));
  await bv.goto("http://127.0.0.1:5219/src/building-viewer/index.html");
  const bvChecks=[];
  for (const species of ["garden_parkland","sacred_yew"]) {
    const id=species.replaceAll("_","-");
    const button=bv.locator(`button[data-id="medieval-${id}"]`);
    await button.evaluate(element=>{ for (let p=element.parentElement;p;p=p.parentElement) if (p instanceof HTMLDetailsElement) p.open=true; });
    await button.click();
    const quality=bv.getByLabel("Tree model quality",{ exact:true });
    assert.deepEqual(await quality.locator("option").evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value)),["low","medium","high","ultra"]);
    const levels=[];
    for (const row of setup.measure.filter(m=>m.species === species)) {
      await bv.getByLabel("Tree model quality",{ exact:true }).selectOption(row.quality);
      await bv.getByLabel("AI model that created this object",{ exact:true }).selectOption(row.author);
      const facts=await bv.locator(".bv-facts").innerText();
      assert.ok(facts.includes("Adopted"));levels.push({ quality:row.quality,author:row.author });
    }
    await bv.getByLabel("Tree model quality",{ exact:true }).selectOption("medium");
    await bv.getByLabel("AI model that created this object",{ exact:true }).selectOption("Codex GPT-6.1 Sol");
    assert.ok((await bv.locator(".bv-facts").innerText()).includes("Not adopted; CE uses Claude Opus 5.5"));
    await bv.getByLabel("AI model that created this object",{ exact:true }).selectOption("Claude Opus 5.5");
    if (preview) await bv.screenshot({ path:resolve(preview,`bv-${id}-medium.png`) });
    bvChecks.push({ species,levels,previousCodexMediumRetained:true });
  }
  assert.deepEqual(bvErrors,[]);
  const sources=["scripts/verifyCeLimeYewBaseline.mts","src/buildings/landscape/smallLeavedLime.ts","src/buildings/landscape/europeanYew.ts","src/buildings/landscape/canopyLobes.ts","src/buildings/landscape/temperateTreeLod.ts","src/buildings/landscape/temperateTreeCodexMedium.ts","src/buildings/landscape/treeVariants.ts","src/buildings/landscape/trees.ts","src/city3d/adoption.ts","src/city3d/three/bvInstances.ts","src/city-editor/renderers/sunLighting.ts"];
  writeFileSync(resolve(output,"results.json"),`${JSON.stringify({ ...setup,conditions:"Eight adopted CE prototypes, fixed world scale across quality tiers, 3 angles, 45/90px high-crown reference at 12/40/70 degrees, 260-tree medium/high stands at 35 degrees/130m, actual BV adoption checks. No full-city timing claim.",released,errors,bvChecks,bvErrors,sourceSha256:Object.fromEntries(sources.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")])) },null,2)}\n`);
  console.log(`Verified eight adopted prototypes and BV authors; ${setup.gpu}`);
} finally { await browser?.close();await server.close(); }
