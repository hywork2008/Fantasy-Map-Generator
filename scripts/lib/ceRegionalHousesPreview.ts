import * as THREE from "three";
import type { BuildingAppearanceProfile } from "../../src/buildings/appearance/types";
import { buildingAppearancePreview } from "../../src/city-editor/generators/buildingAppearancePreview";
import { createBvPrototypeCache } from "../../src/city3d/three/bvInstances";
import { createTownRegionalHouses } from "../../src/city3d/three/regionalHouseMeshes";

export function run() {
  const profiles: BuildingAppearanceProfile[] = ["mediterranean", "atlantic", "northern-wooded", "northern-urban", "stone-upland"];
  const coverings = ["tile", "thatch", "shingle", "slate", "turf", "lead"] as const;
  const palettes = ["terracotta", "straw", "shingle", "slate", "turf", "lead"] as const;
  const cases: object[] = [];
  for (const profile of profiles) {
    const title = document.createElement("h2");
    title.textContent = `${profile} · tile / thatch / shingle / slate / turf / lead · residential / retail / craft`;
    document.body.append(title);
    const lots = coverings.map((material, i) => {
      const lot = buildingAppearancePreview(profile)[i % 3];
      const x = (i - 2.5) * 10;
      const w = i % 2 ? 6 : 5;
      const d = i % 2 ? 10 : 8;
      lot.id = `${profile}-${material}`;
      lot.polygon = [[x - w / 2, -d / 2], [x + w / 2, -d / 2], [x + w / 2, d / 2], [x - w / 2, d / 2]];
      lot.massing!.jettyMeters = 0;
      lot.massing!.roof = { form: i % 2 ? "hip" : "gable", ridgeAzimuth: Math.PI / 2, pitchDeg: material === "turf" ? 28 : 42, material };
      lot.massing!.floors[0].use = (["residential", "retail", "craft"] as const)[i % 3];
      lot.appearance!.roofPaletteId = palettes[i];
      return lot;
    });
    const cache = createBvPrototypeCache();
    for (const quality of ["low", "high"] as const) {
      const layer = createTownRegionalHouses(lots, cache, () => 0, quality);
      if (layer.replaced.size !== lots.length) throw new Error(`Missing replacement: ${profile}/${quality}`);
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1500, 270);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#ece7dc");
      scene.add(new THREE.HemisphereLight(0xffffff, 0x807464, 2));
      const sun = new THREE.DirectionalLight(0xffffff, 2);
      sun.position.set(-15, 30, 20);
      scene.add(sun, layer.group);
      const camera = new THREE.PerspectiveCamera(28, 1500 / 270, 0.1, 300);
      camera.position.set(0, 21, 45);
      camera.lookAt(0, 4, 0);
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const error = gl.getError();
      if (error || gl.isContextLost()) throw new Error(`WebGL failure: ${error}`);
      cases.push({ profile, quality, buildings: layer.replaced.size, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
      if (quality === "high") {
        const image = document.createElement("img");
        image.src = renderer.domElement.toDataURL("image/png");
        image.style.display = "block";
        document.body.append(image);
      }
      layer.dispose();
      if (cache.size !== 0) throw new Error("Unreleased house prototypes");
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }
  return { cases };
}
