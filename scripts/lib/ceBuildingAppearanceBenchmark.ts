import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { models as dwellings } from "../../src/buildings/medieval/07-dwellingsModels";
import { models as jettied } from "../../src/buildings/medieval/45-jettied-housesModels";
import { createCityMassing } from "../../src/city3d/three/cityMeshes";
import type { BuildingLot } from "../../src/city-editor/generators/buildingLots.types";

// Research harness only. No production rendering behavior is changed.
export async function run(lots: BuildingLot[]) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(1000, 720);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0xc5c5bf);
  document.body.replaceChildren(renderer.domElement);
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const environment = {
    userAgent: navigator.userAgent,
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    three: THREE.REVISION,
    viewport: [1000, 720],
    dpr: 1,
    shadows: false,
    timing: "CPU wall time; render includes gl.finish; not GPU timer queries or interactive FPS"
  };
  const definitions = [dwellings[1], dwellings[2], jettied[0]];
  const templates = definitions.map(def => {
    const start = performance.now();
    const model = def.create();
    return { def, model, coldMs: performance.now() - start };
  });
  const stats = (group: THREE.Group) => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    let meshes = 0,
      triangles = 0,
      bufferBytes = 0;
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes++;
      const count = object instanceof THREE.InstancedMesh ? object.count : 1;
      triangles += ((object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3) * count;
      if (object instanceof THREE.InstancedMesh) {
        bufferBytes += object.instanceMatrix.array.byteLength + (object.instanceColor?.array.byteLength ?? 0);
      }
      geometries.add(object.geometry);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
    });
    for (const geometry of geometries) {
      bufferBytes += geometry.index?.array.byteLength ?? 0;
      for (const attr of Object.values(geometry.attributes)) bufferBytes += attr.array.byteLength;
    }
    return { meshes, triangles, geometries: geometries.size, materials: materials.size, bufferBytes };
  };
  const assets = templates.map(t => ({ id: t.def.id, coldMs: t.coldMs, ...stats(t.model.group) }));
  const nside = (n: number) => Math.ceil(Math.sqrt(n));
  const translation = (i: number, n: number) =>
    new THREE.Matrix4().makeTranslation(
      ((i % nside(n)) - nside(n) / 2) * 16,
      0,
      (Math.floor(i / nside(n)) - nside(n) / 2) * 16
    );
  const make = (mode: string, n: number) => {
    if (mode === "ce-massing") {
      const sample = Array.from({ length: n }, (_, i) => {
        const lot = lots[i % lots.length];
        const cx = lot.polygon.reduce((s, p) => s + p[0], 0) / lot.polygon.length;
        const cy = lot.polygon.reduce((s, p) => s + p[1], 0) / lot.polygon.length;
        const p = new THREE.Vector3().setFromMatrixPosition(translation(i, n));
        return { ...lot, polygon: lot.polygon.map(v => [v[0] - cx + p.x, v[1] - cy - p.z] as [number, number]) };
      });
      return createCityMassing(sample);
    }
    const group = new THREE.Group();
    const owned: ReturnType<typeof createCityMassing>[] = [];
    if (mode === "bv-factory" || mode === "bv-clone") {
      for (let i = 0; i < n; i++) {
        const t = templates[i % templates.length];
        const model = mode === "bv-factory" ? t.def.create() : null;
        if (model) owned.push(model);
        const child = model?.group ?? t.model.group.clone(true);
        child.applyMatrix4(translation(i, n));
        group.add(child);
      }
    } else {
      // Bake every template once per case, merging parts by existing material.
      // Include baking cost: a future cache could reduce repeated preparation.
      for (let type = 0; type < templates.length; type++) {
        const template = templates[type].model;
        template.group.updateMatrixWorld(true);
        const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
        for (const mesh of template.pickables) {
          if (Array.isArray(mesh.material)) throw new Error("Multi-material template needs explicit groups");
          const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          geometry.applyMatrix4(mesh.matrixWorld);
          for (const name of Object.keys(geometry.attributes))
            if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
          const bucket = buckets.get(mesh.material) ?? [];
          bucket.push(geometry);
          buckets.set(mesh.material, bucket);
        }
        const ids = Array.from({ length: n }, (_, i) => i).filter(i => i % templates.length === type);
        for (const [material, parts] of buckets) {
          const geometry = mergeGeometries(parts);
          if (!geometry) throw new Error("Cannot merge template parts");
          parts.forEach(p => p.dispose());
          const mesh = new THREE.InstancedMesh(geometry, material, ids.length);
          ids.forEach((id, index) => mesh.setMatrixAt(index, translation(id, n)));
          mesh.instanceMatrix.needsUpdate = true;
          group.add(mesh);
        }
      }
    }
    return {
      group,
      dispose() {
        owned.forEach(m => m.dispose());
        if (mode === "bv-instanced")
          group.traverse(object => {
            if (object instanceof THREE.InstancedMesh) {
              object.geometry.dispose();
              object.dispose();
            }
          });
      }
    };
  };
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(1, 1.6, 0.4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(45, 1000 / 720, 0.5, 80000);
  const cases = [100, 1000, 5000].flatMap(n =>
    ["ce-massing", "bv-factory", "bv-clone", "bv-instanced"]
      .filter(mode => n <= 1000 || mode === "ce-massing" || mode === "bv-instanced")
      .map(mode => ({ n, mode }))
  );
  const results: object[] = [];
  const previews: Record<string, string> = {};
  for (let pass = 0; pass < 4; pass++) {
    for (let j = 0; j < cases.length; j++) {
      const { n, mode } = cases[(j + pass) % cases.length];
      if (gl.isContextLost()) throw new Error(`Context lost before ${mode}/${n}/${pass}`);
      const start = performance.now();
      const model = make(mode, n);
      const buildMs = performance.now() - start;
      scene.add(model.group);
      // Submit all objects, disabling frustum culling for comparable draw-call counts.
      model.group.traverse(o => {
        o.frustumCulled = false;
      });
      const span = nside(n) * 16;
      camera.position.set(span * 0.6, span * 0.9, span * 0.9);
      camera.lookAt(0, 0, 0);
      const first = performance.now();
      renderer.render(scene, camera);
      gl.finish();
      const firstRenderMs = performance.now() - first;
      const frameTimes: number[] = [];
      for (let frame = 0; frame < 7; frame++) {
        const before = performance.now();
        renderer.render(scene, camera);
        gl.finish();
        frameTimes.push(performance.now() - before);
      }
      if (gl.isContextLost()) throw new Error(`Context lost rendering ${mode}/${n}/${pass}`);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`WebGL error ${error} in ${mode}/${n}/${pass}`);
      if (pass === 3 && n === 100 && (mode === "ce-massing" || mode === "bv-instanced")) {
        renderer.render(scene, camera);
        gl.finish();
        previews[mode] = renderer.domElement.toDataURL("image/png");
      }
      if (pass)
        results.push({
          pass,
          n,
          mode,
          buildMs,
          firstRenderMs,
          renderMedianMs: frameTimes.sort((a, b) => a - b)[3],
          drawCalls: renderer.info.render.calls,
          renderedTriangles: renderer.info.render.triangles,
          ...stats(model.group)
        });
      scene.remove(model.group);
      model.dispose();
      renderer.renderLists.dispose();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  templates.forEach(t => t.model.dispose());
  renderer.dispose();
  return { environment, assets, results, previews };
}
