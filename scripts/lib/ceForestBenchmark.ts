/** F0 research harness. Proxies are deliberately separate from production land-cover generation. */
import * as THREE from "three";
import type { CityDocument, Point } from "../../src/city-editor/types/document";
import { buildBlockFabric, clearBlockFabricCache } from "../../src/city-editor/generators/blockInfill";
import { pointInPolygon } from "../../src/city-editor/generators/geom";
import { cityTerrain } from "../../src/city-editor/generators/terrainElevation";
import { renderEditorSvg } from "../../src/city-editor/renderers/editorSvg";
import { renderLandscapeLayer } from "../../src/city-editor/renderers/landscape";
import { STANDALONE_SVG_STYLE } from "../../src/city-editor/renderers/standaloneSvg";
import { mountCity3d } from "../../src/city-editor/renderers/cityView";
import { createTownFarms } from "../../src/city3d/three/farmMeshes";
import { createTownOpenSpaces } from "../../src/city3d/three/openSpaceMeshes";
import { createCityMassing } from "../../src/city3d/three/cityMeshes";
import { RuralFieldProfiler, withRuralRenderProfiler } from "../../src/city-editor/utils/ruralFieldProfiler";

const NS = "http://www.w3.org/2000/svg";
const percentile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const summary = (values: number[]) => ({
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  samples: values
});
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
function element(name: string, attrs: Record<string, string | number> = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}
function meshStats(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  let meshes = 0,
    triangles = 0,
    instances = 0,
    bufferBytes = 0;
  group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const count = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    triangles += (count * (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count)) / 3;
    geometries.add(mesh.geometry);
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      instances += count;
      bufferBytes += (mesh as THREE.InstancedMesh).instanceMatrix.array.byteLength;
    }
  });
  for (const geometry of geometries) {
    bufferBytes += geometry.index?.array.byteLength ?? 0;
    for (const attribute of Object.values(geometry.attributes)) bufferBytes += attribute.array.byteLength;
  }
  return { meshes, triangles, instances, bufferBytes, geometries: geometries.size };
}

export async function run(city: CityDocument) {
  console.info("[forest-f0] browser fabric and farm meshes");
  document.body.innerHTML = "";
  const css = document.createElement("style");
  css.textContent = `${STANDALONE_SVG_STYLE} body{margin:0} #host{position:relative;width:1000px;height:720px} .ce-3d{position:absolute;inset:0}.ce-3d-canvas{display:block;width:100%;height:100%}[hidden]{display:none!important}`;
  document.head.appendChild(css);
  const host = document.createElement("div");
  host.id = "host";
  document.body.appendChild(host);
  const extent = city.frame.extentMeters;
  clearBlockFabricCache();
  const fabricAt = performance.now();
  const fabric = buildBlockFabric(city);
  const browserColdFabricMs = performance.now() - fabricAt;
  const terrainAt = performance.now();
  const terrain = cityTerrain(city);
  const terrainMs = performance.now() - terrainAt;
  const farmMeshesSamples = [];
  for (let pass = 0; pass < 4; pass++) {
    const start = performance.now();
    const farms = createTownFarms(fabric.farms, terrain);
    const buildMs = performance.now() - start;
    if (pass) farmMeshesSamples.push({ buildMs, ...meshStats(farms.parent) });
    farms.dispose();
  }
  const render = () =>
    renderEditorSvg(
      city,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      `${-extent / 2} ${-extent / 2} ${extent} ${extent}`,
      1,
      false,
      null,
      null,
      null,
      null,
      false,
      false,
      undefined,
      false,
      false,
      "detailed"
    );
  const svgSamples = [],
    landscapeSamples = [];
  console.info("[forest-f0] baseline SVG");
  let baseline!: SVGSVGElement;
  for (let pass = 0; pass < 4; pass++) {
    const profiler = new RuralFieldProfiler();
    const at = performance.now();
    const svg = withRuralRenderProfiler(city, profiler, render);
    const buildMs = performance.now() - at;
    const attachedAt = performance.now();
    host.replaceChildren(svg);
    svg.setAttribute("width", "1000");
    svg.setAttribute("height", "720");
    svg.getBoundingClientRect();
    const attachLayoutMs = performance.now() - attachedAt;
    await frame();
    await frame();
    if (pass)
      svgSamples.push({
        buildMs,
        attachLayoutMs,
        nodes: svg.querySelectorAll("*").length,
        bytes: new TextEncoder().encode(svg.outerHTML).length,
        ruralTimings: profiler.snapshot()
      });
    baseline = svg;
    const landscapeAt = performance.now();
    // Standalone call has empty facility keep-outs; actual integrated counts are collected below.
    const landscape = renderLandscapeLayer(city, true, "detailed");
    if (pass)
      landscapeSamples.push({
        buildMs: performance.now() - landscapeAt,
        nodes: landscape.querySelectorAll("*").length
      });
  }
  const integratedLandscapeNodes = baseline.querySelector(".ce-landscape-layer")?.querySelectorAll("*").length ?? 0;

  // Occupied 8 m sample cells inside actual farm polygons, not a replacement land-cover algorithm.
  const samplingAt = performance.now();
  const step = 8;
  const cells = new Map<string, Point>();
  for (const farm of fabric.farms) {
    const xs = farm.polygon.map(p => p[0]),
      ys = farm.polygon.map(p => p[1]);
    for (let x = Math.floor(Math.min(...xs) / step); x <= Math.ceil(Math.max(...xs) / step); x++)
      for (let y = Math.floor(Math.min(...ys) / step); y <= Math.ceil(Math.max(...ys) / step); y++) {
        const point: Point = [(x + 0.5) * step, (y + 0.5) * step];
        if (pointInPolygon(point, farm.polygon)) cells.set(`${x},${y}`, point);
      }
  }
  const all = [...cells.values()];
  const edge = [...cells.entries()]
    .filter(([key]) => {
      const [x, y] = key.split(",").map(Number);
      return [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1]
      ].some(([a, b]) => !cells.has(`${a},${b}`));
    })
    .map(([, point]) => point);
  const samplingMs = performance.now() - samplingAt;
  if (!all.length) throw new Error("No forest proxy samples");
  const previews: Record<string, string> = {};
  const svgProxy = [];
  console.info("[forest-f0] SVG forest proxies");
  for (const mode of ["edge-fill", "all-trees"] as const) {
    const samples = [];
    for (let pass = 0; pass < 4; pass++) {
      // Clone/remove common base outside the timed overlay build.
      const svg = baseline.cloneNode(true) as SVGSVGElement;
      svg.querySelectorAll(".ce-farms").forEach(node => node.remove());
      const at = performance.now();
      const group = element("g");
      const defs = element("defs");
      const symbol = element("g", { id: "f0-tree" });
      symbol.appendChild(element("circle", { r: 3.6, fill: "#527b43", stroke: "#355c32", "stroke-width": 0.5 }));
      defs.appendChild(symbol);
      group.appendChild(defs);
      const path = fabric.farms.map(farm => `M${farm.polygon.map(p => `${p[0]},${-p[1]}`).join("L")}Z`).join("");
      group.appendChild(element("path", { d: path, fill: "#658951", "fill-rule": "nonzero" }));
      for (const [x, y] of mode === "edge-fill" ? edge : all)
        group.appendChild(element("use", { href: "#f0-tree", x, y: -y }));
      const buildMs = performance.now() - at;
      const landscape = svg.querySelector(".ce-landscape-layer");
      if (landscape) landscape.replaceWith(group);
      else svg.appendChild(group);
      const attachAt = performance.now();
      host.replaceChildren(svg);
      svg.getBoundingClientRect();
      const attachLayoutMs = performance.now() - attachAt;
      await frame();
      await frame();
      if (pass)
        samples.push({
          buildMs,
          attachLayoutMs,
          overlayNodes: group.querySelectorAll("*").length,
          overlayBytes: new TextEncoder().encode(group.outerHTML).length
        });
      if (pass === 3) {
        const style = element("style");
        style.textContent = STANDALONE_SVG_STYLE;
        svg.prepend(style);
        const image = new Image();
        const url = URL.createObjectURL(
          new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" })
        );
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("SVG image failed"));
          image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = 1000;
        canvas.height = 720;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#d5cfbf";
        ctx.fillRect(0, 0, 1000, 720);
        ctx.drawImage(image, 0, 0);
        previews[`2d-${mode}`] = canvas.toDataURL();
        URL.revokeObjectURL(url);
      }
    }
    svgProxy.push({ mode, samples });
  }

  // Real CE mount: retain its own facilities, water, shadows and update scheduling.
  console.info("[forest-f0] real CE 3D mount");
  host.replaceChildren();
  const map = document.createElement("div");
  host.appendChild(map);
  const cleanups: (() => void)[] = [];
  const mountAt = performance.now();
  const view = mountCity3d({
    canvasHost: host,
    map,
    getDocument: () => city,
    getModelQuality: () => "standard",
    scope: {
      own: callback => cleanups.push(callback),
      listen: (target, type, handler) => {
        target.addEventListener(type, handler);
        cleanups.push(() => target.removeEventListener(type, handler));
      }
    }
  });
  const radius = city.frame.cityRadiusMeters;
  view.restoreView({ position: [radius * 0.8, radius * 1.4, radius * 1.5], target: [0, 0, 0], zoom: 1, fov: 45 });
  const mountMs = performance.now() - mountAt;
  await frame();
  await frame();
  const actualCanvas = host.querySelector("canvas")!;
  const actualGl = actualCanvas.getContext("webgl2")!;
  if (!actualGl || actualGl.isContextLost() || !view.getPerformance()?.frame) throw new Error("CE WebGL unavailable");
  const debug = actualGl.getExtension("WEBGL_debug_renderer_info");
  const environment = {
    userAgent: navigator.userAgent,
    three: THREE.REVISION,
    viewport: [1000, 720],
    dpr: 1,
    renderer: debug ? actualGl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : actualGl.getParameter(actualGl.RENDERER),
    timing:
      "Real CE CPU submit times exclude GPU completion. Probe render times include gl.finish; neither is interactive FPS."
  };
  const actualFrames = [];
  console.info("[forest-f0] real CE camera frames");
  for (const pose of ["overview", "edge"] as const) {
    const frames: number[] = [],
      completion: number[] = [];
    for (let i = 0; i < 27; i++) {
      const target = pose === "overview" ? [0, 0, 0] : [radius, terrain.heightAt([radius, 0]), 0];
      const position =
        pose === "overview"
          ? [radius * (0.8 + i * 0.001), radius * 1.4, radius * 1.5]
          : [radius + 60 + i, target[1] + 60, 90];
      view.restoreView({ position, target, zoom: 1, fov: 45 });
      await frame();
      const finishAt = performance.now();
      actualGl.finish();
      if (i >= 3) {
        frames.push(view.getPerformance()!.frame!.cpuMs);
        completion.push(performance.now() - finishAt);
      }
    }
    actualFrames.push({
      pose,
      cpuSubmitMs: summary(frames),
      gpuCompletionWaitMs: summary(completion),
      snapshot: view.getPerformance()
    });
  }
  view.dispose();
  cleanups.reverse().forEach(fn => fn());

  // Render-only proxy: same city massing + same farm-derived samples in every case.
  host.replaceChildren();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1000, 720);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0xc5c5bf);
  host.appendChild(renderer.domElement);
  const gl = renderer.getContext();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667755, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(600, 1200, 400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -extent / 2;
  sun.shadow.camera.right = sun.shadow.camera.top = extent / 2;
  sun.shadow.camera.far = 5000;
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const base = createCityMassing(fabric.buildings, terrain.foundationAt);
  scene.add(base.group);
  const camera = new THREE.PerspectiveCamera(45, 1000 / 720, 0.5, 80000);
  const forestProbe = [];
  for (const mode of ["baseline-farms", "low-poly-all", "canopy-tiles", "detailed-16-reference"] as const) {
    console.info(`[forest-f0] 3D proxy ${mode}`);
    const started = performance.now();
    let group = new THREE.Group();
    let dispose: () => void;
    if (mode === "baseline-farms") {
      const farms = createTownFarms(fabric.farms, terrain);
      group = farms.parent;
      dispose = () => farms.dispose();
    } else if (mode === "detailed-16-reference") {
      const trees = createTownOpenSpaces(
        { surfaces: [], sites: edge.slice(0, 16).map(point => ({ model: "garden_parkland", point, angle: 0 })) },
        terrain
      );
      group = trees.group;
      dispose = () => trees.dispose();
    } else {
      const material = new THREE.MeshLambertMaterial({ color: 0x527b43 });
      const geometry = mode === "low-poly-all" ? new THREE.IcosahedronGeometry(1, 1) : new THREE.BoxGeometry(1, 1, 1);
      // Tile footprint is the occupied 8 m cell; preserves the sampled gaps without inventing a union algorithm.
      const mesh = new THREE.InstancedMesh(geometry, material, all.length);
      const matrix = new THREE.Matrix4();
      all.forEach(([x, y], i) => {
        matrix.compose(
          new THREE.Vector3(x, terrain.heightAt([x, y]) + 6, -y),
          new THREE.Quaternion(),
          mode === "low-poly-all" ? new THREE.Vector3(4, 6, 4) : new THREE.Vector3(step, 8, step)
        );
        mesh.setMatrixAt(i, matrix);
      });
      mesh.computeBoundingSphere();
      group.add(mesh);
      dispose = () => {
        mesh.dispose();
        geometry.dispose();
        material.dispose();
      };
    }
    const buildMs = performance.now() - started;
    scene.add(group);
    const cases = [];
    for (const shadows of [false, true]) {
      renderer.shadowMap.enabled = shadows;
      group.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = shadows;
      });
      const samples: number[] = [];
      for (let i = 0; i < 27; i++) {
        camera.position.set(radius * (0.8 + i * 0.001), radius * 1.4, radius * 1.5);
        camera.lookAt(0, 0, 0);
        const at = performance.now();
        renderer.render(scene, camera);
        gl.finish();
        if (i >= 3) samples.push(performance.now() - at);
      }
      cases.push({
        shadows,
        renderFinishMs: summary(samples),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures
      });
      if (shadows && mode !== "detailed-16-reference") previews[`3d-${mode}`] = renderer.domElement.toDataURL();
    }
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error(`WebGL error in ${mode}`);
    forestProbe.push({ mode, buildMs, ...meshStats(group), cases });
    scene.remove(group);
    dispose();
    renderer.renderLists.dispose();
  }
  base.dispose();
  sun.shadow.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  css.remove();
  return {
    environment,
    browserColdFabricMs,
    terrainMs,
    farmMeshesSamples,
    svgSamples,
    landscapeSamples,
    integratedLandscapeNodes,
    sampling: {
      stepMeters: step,
      all: all.length,
      edge: edge.length,
      samplingMs,
      note: "Farm-polygon raster samples; no union, jitter, final exclusion or LOD. Edge is a 4-neighbor mask boundary. SVG overlay insertion does not remove every farm accessory; proxies are load probes, not finished landscapes."
    },
    svgProxy,
    actual3d: { mountMs, frames: actualFrames },
    forestProbe,
    previews
  };
}
