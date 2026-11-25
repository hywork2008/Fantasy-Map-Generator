import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { WebGPURenderer } from "three/webgpu";
import type { ModelQuality } from "../../../buildings/modelQuality";
import type { ForestQualityPreference } from "../../types/contracts/forest";
import type { SimplificationPreferences } from "../../types/contracts/simplification";
import { ForestAutoQuality } from "../forestAutoQuality";
import { vectorPickHouse, vectorPickOwner } from "./picking";
import type { VectorRenderData } from "./renderData";
import { createVectorScene, VectorSceneLayers } from "./scene3d";

/** A north-up plan view: its center in plan metres and the half-size fitted to the viewport's shorter side. */
export interface VectorPlanView {
  center: readonly [number, number];
  halfView: number;
}

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
  view: {
    simplification?: SimplificationPreferences;
    forestQuality?: ForestQualityPreference;
    /** The 2D map's view: the 3D view opens straight above it at the same scale, as the mesh editor's view. */
    planView?: VectorPlanView | null;
  } = {}
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
  let renderer: WebGPURenderer;
  try {
    // Opaque 8-bit output. Reversed depth covers the large range; logarithmic depth would run in every material.
    renderer = new WebGPURenderer({
      antialias: true,
      alpha: false,
      outputBufferType: THREE.UnsignedByteType,
      reversedDepthBuffer: true
    });
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
    camera = new THREE.PerspectiveCamera(45, 1, 1, Math.max(10000, data.extentMeters * 20));
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
  const controls = new OrbitControls(camera, renderer.domElement);
  // The mesh editor's controls: the wheel zooms toward the cursor and panning stays on the ground plane.
  controls.enableDamping = false;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.maxDistance = data.extentMeters * 5;
  const groundAt = (x: number, z: number) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, bounds.max.y + 1, z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(model.group, true);
    return hits.length ? hits[hits.length - 1].point.y : model.group.position.y;
  };
  // Straight above the 2D view at its scale. A tiny +Z offset defines screen-up at the pole without a visible tilt.
  const framePlan = (plan: VectorPlanView) => {
    const halfView = Math.max(1, plan.halfView),
      elevation = groundAt(plan.center[0], -plan.center[1]),
      distance = halfView / Math.min(1, camera.aspect) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(plan.center[0], elevation + distance, -plan.center[1] + 0.001);
    controls.target.set(plan.center[0], elevation, -plan.center[1]);
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);
    controls.update();
  };
  const initialPlan =
    view.planView && view.planView.center.every(Number.isFinite) && view.planView.halfView > 0
      ? view.planView
      : { center: data.center, halfView: data.extentMeters / 2 };
  {
    // The camera aspect is known before the first frame, so the framing matches the 2D map's fit.
    const rect = container.getBoundingClientRect();
    camera.aspect = Math.max(1, rect.width) / Math.max(300, rect.height);
    camera.updateProjectionMatrix();
  }
  framePlan(initialPlan);
  let frame = 0,
    previousFrame: { at: number; endedAt: number } | undefined,
    moving = false,
    gpuReady = false,
    disposed = false;
  const draw = () => {
      if (!gpuReady) return;
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
  const observer = new ResizeObserver(resize);
  // Init is async. Draws before it finishes are skipped; a rejection is left for the caller of ready.
  const ready = renderer.init().then(() => {
    gpuReady = true;
    if (!disposed) resize();
  });
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
  observer.observe(container);
  resize();
  return {
    get warnings() {
      return model.warnings;
    },
    /** Resolves when the WebGPU renderer has started. A rejection means the view could not start. */
    ready,
    /** The 3D view as a north-up 2D view: the target and the scale seen along the viewing ray, as the mesh
     * editor's view hands back to its 2D map. Null when the camera looks too flat to resolve a scale. */
    getPlanView(): VectorPlanView | null {
      const delta = camera.position.clone().sub(controls.target),
        distance = delta.length();
      if (!Number.isFinite(distance) || distance <= 0) return null;
      const direction = delta.normalize();
      if (direction.y <= 0.01) return null;
      const halfView =
        (distance *
          Math.max(0.01, direction.y) *
          Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
          Math.min(1, camera.aspect)) /
        camera.zoom;
      return Number.isFinite(halfView) && halfView > 0
        ? { center: [controls.target.x, -controls.target.z], halfView }
        : null;
    },
    /** Layer keys the last drawing rebuilt rather than kept. */
    get rebuiltLayers() {
      return [...layers.built];
    },
    /** Redraw the city from new render data in the same view: camera, controls and selection outline stay, and only
     * the layers whose inputs changed are rebuilt. */
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
      ready.then(
        () =>
          new Promise<Blob>((resolve, reject) => {
            draw();
            renderer.domElement.toBlob(b => (b ? resolve(b) : reject(new Error("vector-png"))), "image/png");
          })
      ),
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
      renderer.domElement.remove();
    }
  };
}
