import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelQuality } from "../../../buildings/modelQuality";
import { vectorPickHouse, vectorPickOwner } from "./picking";
import type { VectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

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
  quality: ModelQuality = "high"
) {
  let model = createVectorScene(data, { quality });
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
  } catch (error) {
    model.dispose();
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
  let frame = 0;
  const draw = () => {
      // Houses near the camera take their detailed models and façades before the frame is drawn.
      const lod = model.updateCamera(camera, renderer.domElement.clientHeight);
      renderer.render(scene, camera);
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
  controls.addEventListener("change", draw);
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
    /** Redraw the city from new render data in the same view: camera, controls and selection outline stay. Used for
     * look-only changes (the housing culture), which need no regeneration. */
    update(next: VectorRenderData) {
      if (disposed) return;
      const replacement = createVectorScene(next, { quality });
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
      controls.removeEventListener("change", draw);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      clearSelection();
      controls.dispose();
      model.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  };
}
