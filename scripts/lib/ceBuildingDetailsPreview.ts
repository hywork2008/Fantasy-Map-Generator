import * as THREE from "three";
import { buildingAppearancePreview } from "../../src/city-editor/generators/buildingAppearancePreview";
import { createCityMassing } from "../../src/city3d/three/cityMeshes";
import { createTownBuildingDetails } from "../../src/city3d/three/buildingDetails";
import type { BuildingAppearanceProfile } from "../../src/buildings/appearance/types";

/** Isolated browser study with identical cameras, and terrain elevation above zero. */
export async function run() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(1000, 720);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0xc5c5bf);
  document.body.replaceChildren(renderer.domElement);
  document.body.style.margin = "0";
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(1, 1.6, 0.4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(45, 1000 / 720, 0.1, 10000);
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const backend = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const results: object[] = [],
    images: Record<string, string> = {};
  for (const profile of ["mediterranean", "northern-urban", "northern-wooded"] as BuildingAppearanceProfile[]) {
    const lots = buildingAppearancePreview(profile),
      base = createCityMassing(lots, () => 12);
    const details = createTownBuildingDetails(lots, () => 12);
    scene.add(base.group, details.group);
    for (const mode of ["base", "near", "far"] as const) {
      const zoom = mode === "far" ? 10 : 1;
      camera.position.set(20 * zoom, 12 + 14 * zoom, 25 * zoom);
      camera.lookAt(0, 15, 0);
      details.update(camera, 720);
      details.group.visible = mode !== "base";
      renderer.render(scene, camera);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      renderer.render(scene, camera);
      gl.finish();
      if (gl.isContextLost() || gl.getError()) throw new Error("Invalid detail rendering");
      images[`${profile}-${mode}`] = renderer.domElement.toDataURL("image/png");
      results.push({
        profile,
        mode,
        calls: renderer.info.render.calls,
        renderedTriangles: renderer.info.render.triangles,
        ...details.stats
      });
      if (mode === "near" && (details.stats.buildings !== 3 || renderer.info.render.calls !== 3))
        throw new Error("Near detail budget mismatch");
      if (mode === "far" && (details.stats.buildings || renderer.info.render.calls !== 2))
        throw new Error("Far view must have only the original two meshes");
    }
    scene.remove(base.group, details.group);
    details.dispose();
    base.dispose();
  }
  renderer.dispose();
  return { backend, results, images };
}
