import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelQuality } from "../../../buildings/modelQuality";
import type { ForestQualityPreference } from "../../types/contracts/forest";
import type { SimplificationPreferences } from "../../types/contracts/simplification";
import { ForestAutoQuality } from "../forestAutoQuality";
import { vectorPickHouse, vectorPickOwner } from "./picking";
import type { VectorRenderData } from "./renderData";
import { createVectorScene, VectorSceneLayers } from "./scene3d";

/** World bounds of one picked house's triangles in a batched house mesh. */
function houseBounds(mesh: THREE.Object3D, range: { firstTriangle: number; endTriangle: number }) {
  const position = (mesh as THREE.Mesh).geometry.getAttribute("position"),
    box = new THREE.Box3(),
    point = new THREE.Vector3();
  for (let v = range.firstTriangle * 3; v < range.endTriangle * 3; v++)
    box.expandByPoint(point.fromBufferAttribute(position, v));
  mesh.updateWorldMatrix(true, false);
  return box.applyMatrix4(mesh.matrixWorld);
}
export function mountVector3d(
  container: HTMLElement,
  data: VectorRenderData,
  onSelect?: (id: string) => void,
  quality: ModelQuality = "high",
  view: { simplification?: SimplificationPreferences; forestQuality?: ForestQualityPreference } = {}
) {
  // The mesh editor's forest quality: a fixed level, or automatic from the frame times while the camera moves.
  // Simplification off draws the forest at High, as there.
  const forestQuality = new ForestAutoQuality();
  forestQuality.setPreference(view.simplification?.outskirts === "off" ? "high" : (view.forestQuality ?? "auto"));
  const sceneOptions = () => ({
    quality,
    layers,
    simplification: view.simplification,
    forestQuality: forestQuality.effective
  });
  // Layers survive redraws of this view, so an edit rebuilds only the layers whose inputs changed.
  const layers = new VectorSceneLayers();
  let model = createVectorScene(data, sceneOptions());
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
  } catch (error) {
    model.dispose();
    layers.dispose();
    throw error;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor("#dad6cb");
  renderer.domElement.dataset.vector3d = "true";
  renderer.domElement.dataset.vectorStage = data.stage;
  renderer.domElement.dataset.vectorBuildings = String(
    data.surfaces.reduce((n, s) => n + (s.kind !== "building" ? 0 : s.houses ? new Set(s.houses.ids).size : 1), 0)
  );
  renderer.domElement.dataset.vectorFacilities = String(
    data.surfaces.filter(s => s.kind === "building" && s.buildingKind === "facility").length
  );
  container.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(40, 1, 1, Math.max(10000, data.extentMeters * 20));
  const bounds = new THREE.Box3().setFromObject(model.group),
    targetHeight = (bounds.min.y + bounds.max.y) / 2;
  scene.add(model.group, new THREE.HemisphereLight(0xffffff, 0x706552, 2.3));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(
    data.center[0] - data.extentMeters,
    targetHeight + data.extentMeters * 2,
    -data.center[1] + data.extentMeters
  );
  scene.add(light);
  camera.position.set(
    data.center[0] + data.extentMeters * 0.65,
    targetHeight + data.extentMeters * 0.9,
    -data.center[1] + data.extentMeters * 0.8
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(data.center[0], targetHeight, -data.center[1]);
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.maxDistance = data.extentMeters * 5;
  controls.update();
  let frame = 0,
    previousFrame: { at: number; endedAt: number } | undefined,
    moving = false;
  const draw = () => {
      const start = performance.now();
      // Houses near the camera take their detailed models and façades before the frame is drawn.
      const lod = model.updateCamera(camera, renderer.domElement.clientHeight);
      renderer.domElement.dataset.vectorDetailedHouses = String(lod.detailedHouses);
      renderer.render(scene, camera);
      // Consecutive camera frames are sampled, pauses between gestures are not (as the mesh editor's view).
      const cpuMs = performance.now() - start,
        previous = previousFrame;
      previousFrame = moving ? { at: start, endedAt: start + cpuMs } : undefined;
      if (!moving || !previous || start - previous.endedAt > 200 || document.hidden) forestQuality.interruptMotion();
      else if (
        forestQuality.sample(Math.max(cpuMs, start - previous.at), start) &&
        model.setForestQuality(forestQuality.effective) &&
        !frame
      )
        frame = requestAnimationFrame(() => {
          frame = 0;
          draw();
        });
      moving = false;
      if (lod.pending && !frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          draw();
        });
    },
    resize = () => {
      const rect = container.getBoundingClientRect(),
        width = Math.max(1, rect.width),
        height = Math.max(300, rect.height);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      draw();
    };
  // Camera events come faster than frames (every pointer move): like the mesh editor's view, they ask for one
  // frame, so the LOD and the render run once per display frame instead of once per event.
  const cameraMoved = () => {
    moving = true;
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
  };
  controls.addEventListener("change", cameraMoved);
  let selection: THREE.Box3Helper | THREE.LineSegments | undefined;
  const clearSelection = () => {
    if (!selection) return;
    selection.geometry.dispose();
    for (const m of Array.isArray(selection.material) ? selection.material : [selection.material]) m.dispose();
    scene.remove(selection);
    selection = undefined;
  };
  let down: [number, number] | undefined;
  const pointerDown = (event: PointerEvent) => {
    if (event.button === 0) down = [event.clientX, event.clientY];
  };
  const pointerUp = (event: PointerEvent) => {
    const start = down;
    down = undefined;
    if (!start || Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 4) return;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1
      ),
      camera
    );
    const hit = ray.intersectObject(model.group, true)[0],
      detailed = hit ? model.pickHouse(hit) : undefined,
      house = hit && !detailed ? vectorPickHouse(hit.object, hit.faceIndex) : null,
      id = detailed ?? house?.id ?? (hit ? vectorPickOwner(hit.object) : null);
    if (id) {
      renderer.domElement.dataset.vectorSelected = id;
      let owner = hit.object;
      for (let parent = owner.parent; parent; parent = parent.parent) if (parent.userData.id === id) owner = parent;
      clearSelection();
      // A flat surface kept only as a pick target (river, road) is outlined itself: its bounding box spans far
      // beyond a long diagonal river.
      if (!house && owner instanceof THREE.Mesh && !owner.visible) {
        owner.updateMatrixWorld(true);
        selection = new THREE.LineSegments(
          new THREE.EdgesGeometry(owner.geometry),
          new THREE.LineBasicMaterial({ color: 0xe48b32 })
        );
        selection.applyMatrix4(owner.matrixWorld);
      } else
        selection = new THREE.Box3Helper(
          house ? houseBounds(hit.object, house) : new THREE.Box3().setFromObject(owner, true),
          0xe48b32
        );
      for (const material of Array.isArray(selection.material) ? selection.material : [selection.material])
        material.depthTest = false;
      scene.add(selection);
      draw();
      onSelect?.(id);
    }
  };
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  let disposed = false;
  return {
    get warnings() {
      return model.warnings;
    },
    /** Redraw the city from new render data in the same view: camera, controls and selection outline stay, and only
     * the layers whose inputs changed are rebuilt. */
    /** Layer keys the last drawing rebuilt rather than kept. */
    get rebuiltLayers() {
      return [...layers.built];
    },
    update(next: VectorRenderData) {
      if (disposed) return;
      const replacement = createVectorScene(next, sceneOptions());
      clearSelection();
      renderer.domElement.dataset.vectorStage = next.stage;
      renderer.domElement.dataset.vectorBuildings = String(
        next.surfaces.reduce((n, s) => n + (s.kind !== "building" ? 0 : s.houses ? new Set(s.houses.ids).size : 1), 0)
      );
      renderer.domElement.dataset.vectorFacilities = String(
        next.surfaces.filter(s => s.kind === "building" && s.buildingKind === "facility").length
      );
      scene.remove(model.group);
      model.dispose();
      model = replacement;
      scene.add(model.group);
      draw();
    },
    png: () =>
      new Promise<Blob>((resolve, reject) => {
        draw();
        renderer.domElement.toBlob(b => (b ? resolve(b) : reject(new Error("vector-png"))), "image/png");
      }),
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      controls.removeEventListener("change", cameraMoved);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      clearSelection();
      controls.dispose();
      model.dispose();
      layers.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  };
}
