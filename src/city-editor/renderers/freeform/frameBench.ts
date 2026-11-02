import * as THREE from "three";
import { createRegionalHouseGeometry, defaultRegionalHouseSpec } from "../../../buildings/houses/regionalHouses";
import { instanceCellKey } from "../../generators/freeform/instanceGrid";
import {
  buildChunkPositions,
  type ChunkAddress,
  chunkLayout,
  samplesForStep,
  sharedChunkIndices
} from "../../generators/freeform/lodChunks";
import type { Point } from "../../types/primitives";

const EXTENT = 2400;
const RADIUS = 900;
const HEIGHT = 80;

function dome(point: Point): number {
  const r2 = point[0] * point[0] + point[1] * point[1];
  const limit = RADIUS * RADIUS;
  return r2 >= limit ? 0 : HEIGHT * (1 - r2 / limit);
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function _chunkBox(chunk: ChunkAddress): THREE.Box3 {
  const south = chunk.origin[1];
  const north = south + 64;
  return new THREE.Box3(
    new THREE.Vector3(chunk.origin[0], 0, -north),
    new THREE.Vector3(chunk.origin[0] + 64, HEIGHT, -south)
  );
}

interface ViewSample {
  label: string;
  visibleChunks: number;
  calls: number;
  triangles: number;
  p95Ms: number;
  maxMs: number;
  shadowRefreshMs?: number;
}

function sampleView(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  chunks: THREE.Mesh[],
  label: string
): ViewSample {
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  );
  let visible = 0;
  for (const mesh of chunks) {
    const show = frustum.intersectsBox(mesh.geometry.boundingBox!);
    mesh.visible = show;
    if (show) visible += 1;
  }
  const gl = renderer.getContext();
  for (let warm = 0; warm < 4; warm++) {
    renderer.render(scene, camera);
    gl.finish();
  }
  const times: number[] = [];
  let calls = 0;
  let triangles = 0;
  for (let frame = 0; frame < 30; frame++) {
    const started = performance.now();
    renderer.render(scene, camera);
    gl.finish();
    times.push(performance.now() - started);
    calls = renderer.info.render.calls;
    triangles = renderer.info.render.triangles;
  }
  return {
    label,
    visibleChunks: visible,
    calls,
    triangles,
    p95Ms: percentile(times, 0.95),
    maxMs: Math.max(...times)
  };
}

export interface FreeformFrameReport {
  gpu: string;
  houseTriangles: number;
  buildings: number;
  instanceMeshes: number;
  chunkCount: number;
  views: ViewSample[];
}

/** Frame times for a 2,400 m lod ground and 2,000 instanced houses. Times `gl.finish`, not animation frames. */
export function measureFreeformFrame(canvas: HTMLCanvasElement): FreeformFrameReport {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(1280, 720, false);
  renderer.setClearColor(0xc5c5bf);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(200, 400, 120);
  scene.add(sun);

  const ground = new THREE.MeshLambertMaterial({ color: 0xd5cfbf });
  const indices = new Map<number, THREE.BufferAttribute>();
  const chunks = chunkLayout(EXTENT, [0, 0]);
  const meshes: THREE.Mesh[] = [];
  for (const chunk of chunks) {
    const samples = samplesForStep(chunk.stepMeters);
    let index = indices.get(samples);
    if (!index) {
      index = new THREE.BufferAttribute(sharedChunkIndices(samples), 1);
      indices.set(samples, index);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(buildChunkPositions(chunk.origin, chunk.stepMeters, dome), 3)
    );
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, ground);
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  }

  const house = createRegionalHouseGeometry(defaultRegionalHouseSpec("mediterranean", 0), "low");
  house.computeVertexNormals();
  const houseTriangles = (house.index?.count ?? house.getAttribute("position").count) / 3;
  const houseMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const batches = new Map<string, THREE.Matrix4[]>();
  let buildings = 0;
  for (let row = 0; row < 45 && buildings < 2000; row++) {
    for (let column = 0; column < 45 && buildings < 2000; column++) {
      const point: Point = [-260 + column * 12, -260 + row * 12];
      const matrix = new THREE.Matrix4().makeTranslation(point[0], dome(point), -point[1]);
      const key = instanceCellKey(point);
      const batch = batches.get(key) ?? [];
      batch.push(matrix);
      batches.set(key, batch);
      buildings += 1;
    }
  }
  const houses: THREE.InstancedMesh[] = [];
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(house, houseMaterial, batch.length);
    for (let index = 0; index < batch.length; index++) mesh.setMatrixAt(index, batch[index]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    houses.push(mesh);
  }

  const camera = new THREE.PerspectiveCamera(45, 1280 / 720, 0.5, 8000);
  const edit = new THREE.Vector3(0, 40, 0);
  camera.position.set(80, 220, 520);
  camera.lookAt(edit);
  camera.updateProjectionMatrix();
  const views = [sampleView(renderer, scene, camera, meshes, "edit")];
  camera.position.set(0, 2400, 1800);
  camera.lookAt(0, 20, 0);
  camera.updateProjectionMatrix();
  views.push(sampleView(renderer, scene, camera, meshes, "overview"));

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 2500;
  const shadowReach = 700;
  sun.shadow.camera.left = -shadowReach;
  sun.shadow.camera.right = shadowReach;
  sun.shadow.camera.top = shadowReach;
  sun.shadow.camera.bottom = -shadowReach;
  sun.shadow.bias = -0.0005;
  sun.shadow.camera.updateProjectionMatrix();
  for (const mesh of meshes) mesh.receiveShadow = true;
  for (const mesh of houses) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  camera.position.set(80, 220, 520);
  camera.lookAt(edit);
  camera.updateProjectionMatrix();
  renderer.shadowMap.autoUpdate = true;
  const shadowRefreshStarted = performance.now();
  renderer.render(scene, camera);
  gl.finish();
  const shadowRefreshMs = performance.now() - shadowRefreshStarted;
  renderer.shadowMap.autoUpdate = false;
  views.push({ ...sampleView(renderer, scene, camera, meshes, "edit-shadow-steady"), shadowRefreshMs });

  const report: FreeformFrameReport = {
    gpu,
    houseTriangles,
    buildings,
    instanceMeshes: batches.size,
    chunkCount: meshes.length,
    views
  };
  renderer.dispose();
  ground.dispose();
  houseMaterial.dispose();
  house.dispose();
  return report;
}
