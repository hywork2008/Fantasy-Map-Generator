import * as THREE from "three";
import { buildingAppearancePreview } from "../../src/city-editor/generators/buildingAppearancePreview";
import { createBuildingFrontageResolver } from "../../src/city-editor/generators/buildingFrontage";
import { bvInstanceGeometry, createBvPrototypeCache } from "../../src/city3d/three/bvInstances";
import { createTownRegionalHouses } from "../../src/city3d/three/regionalHouseMeshes";

export { THREE };

export function run() {
  const lots = [-Math.PI / 2, Math.PI / 2, Math.PI, 0].map((angle, i) => {
    const lot = buildingAppearancePreview("northern-urban")[i % 3];
    const x = (i - 1.5) * 13;
    const r = [Math.cos(angle), Math.sin(angle)], p = [-Math.sin(angle), Math.cos(angle)];
    lot.id = `frontage-${i}`;
    lot.polygon = [[-2.5, -4], [2.5, -4], [2.5, 4], [-2.5, 4]].map(([u, v]) => [x + p[0] * u + r[0] * v, p[1] * u + r[1] * v]);
    lot.massing!.roof.ridgeAzimuth = angle;
    lot.massing!.floors[0].use = i % 2 ? "craft" : "retail";
    return lot;
  });
  const roads = [{ centerline: [[-45, -9], [45, -9]] as [number, number][], widthMeters: 3 }];
  const cache = createBvPrototypeCache();
  const layer = createTownRegionalHouses(lots, cache, () => 12, "high", createBuildingFrontageResolver(roads, lots));
  const expected = [["gable", false], ["gable", true], ["eave", false], ["eave", true]];
  layer.accepted.forEach((site, i) => {
    if (site.frontage.kind !== expected[site.lotIndex][0] || site.frontage.flip !== expected[site.lotIndex][1] || site.frontage.source !== "street")
      throw new Error(`Wrong frontage ${i}: ${JSON.stringify(site.frontage)}`);
  });
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(1200, 800);
  renderer.setClearColor("#e5dfd2");
  const scene = new THREE.Scene();
  scene.add(layer.group, new THREE.HemisphereLight(0xffffff, 0x807464, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(-15, 35, 25);
  scene.add(sun);
  const road = new THREE.Mesh(new THREE.BoxGeometry(90, 0.05, 3), new THREE.MeshLambertMaterial({ color: "#9d998d" }));
  road.position.set(0, 12, 9);
  scene.add(road);
  const selectedMesh = layer.pickables[2];
  const selected = bvInstanceGeometry({ object: selectedMesh, instanceId: 0 })!;
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(selected), new THREE.LineBasicMaterial({ color: "#c68615" }));
  scene.add(outline);
  const camera = new THREE.PerspectiveCamera(35, 1200 / 800, 0.1, 300);
  camera.position.set(7, 35, 65);
  camera.lookAt(0, 16, 0);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  if (gl.getError() || gl.isContextLost()) throw new Error("Invalid frontage preview");
  const image = renderer.domElement.toDataURL("image/png");
  const report = layer.accepted.map(site => ({ id: site.id, ...site.frontage }));
  selected.dispose();
  outline.geometry.dispose();
  (outline.material as THREE.Material).dispose();
  road.geometry.dispose();
  (road.material as THREE.Material).dispose();
  layer.dispose();
  if (cache.size) throw new Error("Leaked frontage prototypes");
  renderer.dispose();
  return { image, report };
}
