import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { VectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";
export function mountVector3d(container: HTMLElement, data: VectorRenderData) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    logarithmicDepthBuffer: true
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor("#dad6cb");
  renderer.domElement.dataset.vector3d = "true";
  renderer.domElement.dataset.vectorStage = data.stage;
  renderer.domElement.dataset.vectorBuildings = String(data.surfaces.filter(s => s.kind === "building").length);
  renderer.domElement.dataset.vectorFacilities = String(
    data.surfaces.filter(s => s.kind === "building" && s.buildingKind === "facility").length
  );
  container.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(40, 1, 1, Math.max(10000, data.extentMeters * 20)),
    model = createVectorScene(data);
  scene.add(model.group, new THREE.HemisphereLight(0xffffff, 0x706552, 2.3));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(data.center[0] - data.extentMeters, data.extentMeters * 2, -data.center[1] + data.extentMeters);
  scene.add(light);
  camera.position.set(
    data.center[0] + data.extentMeters * 0.65,
    data.extentMeters * 0.9,
    -data.center[1] + data.extentMeters * 0.8
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(data.center[0], 0, -data.center[1]);
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.maxDistance = data.extentMeters * 5;
  controls.update();
  const draw = () => renderer.render(scene, camera),
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
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  let disposed = false;
  return {
    warnings: model.warnings,
    png: () =>
      new Promise<Blob>((resolve, reject) => {
        draw();
        renderer.domElement.toBlob(b => (b ? resolve(b) : reject(new Error("vector-png"))), "image/png");
      }),
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      controls.removeEventListener("change", draw);
      controls.dispose();
      model.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  };
}
