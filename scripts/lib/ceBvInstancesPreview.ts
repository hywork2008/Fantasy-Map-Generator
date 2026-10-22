import * as THREE from "three";
import { createGridDocument } from "../../src/city-editor/generators/document";
import { collectCityStructures } from "../../src/city-editor/renderers/structureMassing";
import { createBvPrototypeCache } from "../../src/city3d/three/bvInstances";
import { createTownSpecialBuildings } from "../../src/city3d/three/specialBuildingMeshes";
import { createTownWells } from "../../src/city3d/three/wellMeshes";

export function fixture() {
  const city = createGridDocument({ size: "tiny", grid: "hex", seed: "bv-placement" });
  city.historicalPeriod = "highMedieval";
  city.buildingAppearanceVersion = 1;
  city.buildingAppearanceProfile = "atlantic";
  city.frame.cityRadiusMeters = 65;
  city.elements = [-30, 0, 30].map((x, i) => ({
    id: `chapel-${i}`,
    kind: "temple",
    point: [x, 0],
    sizeMeters: 22,
    rotation: (i - 1) * 0.5,
    templeType: "chapel"
  }));
  return city;
}

export async function run() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(1000, 720);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0xc5c5bf);
  document.body.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(1, 1.6, 0.4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(45, 1000 / 720, 0.1, 10000);
  camera.position.set(45, 56, 80);
  camera.lookAt(0, 14, 0);
  const cache = createBvPrototypeCache(),
    city = fixture();
  const parts = collectCityStructures(city).map(part => ({ ...part, baseElevationMeters: 12 }));
  const layer = createTownSpecialBuildings(city, parts, cache);
  const wells = createTownWells(
    [
      { id: "well", point: [-12, -12] },
      { id: "basin", point: [12, -12], kind: "publicBasin" }
    ],
    () => 12,
    cache
  );
  scene.add(layer.group, wells.group);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  gl.finish();
  if (gl.isContextLost() || gl.getError() || layer.replaced.size !== 3 || renderer.info.render.calls !== 3)
    throw new Error("Invalid BV city rendering");
  const image = renderer.domElement.toDataURL("image/png");
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const report = {
    replaced: [...layer.replaced],
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    backend: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  };
  layer.dispose();
  wells.dispose();
  renderer.dispose();
  if (cache.size) throw new Error("Leaked preview prototype");
  return { image, report };
}
