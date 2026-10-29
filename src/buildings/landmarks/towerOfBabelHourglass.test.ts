import * as THREE from "three";
import { expect } from "vitest";
import { checkLandmark } from "./landmarkTestSupport";
import { model } from "./towerOfBabelHourglass";

checkLandmark(model, assembly => {
  const lower = assembly.pickables.filter(mesh => mesh.name.startsWith("lower-tier-"));
  const upper = assembly.pickables.filter(mesh => mesh.name.startsWith("upper-tier-"));
  const roads = assembly.pickables.filter(mesh => mesh.name.startsWith("upper-road-"));
  expect(lower).toHaveLength(14);
  expect(upper).toHaveLength(14);
  expect(roads).toHaveLength(14);
  const bounds = (mesh: THREE.Mesh) => new THREE.Box3().setFromObject(mesh);
  const diameter = (mesh: THREE.Mesh) => bounds(mesh).getSize(new THREE.Vector3()).x;
  expect(diameter(lower[0])).toBeCloseTo(240);
  expect(diameter(lower[13])).toBeCloseTo(57.6);
  expect(bounds(lower[13]).max.y).toBeCloseTo(254.4);
  expect(bounds(roads[13]).max.y).toBeCloseTo(508.8);
  for (let i = 0; i < upper.length; i++) {
    expect(diameter(roads[i])).toBeCloseTo(diameter(lower[13 - i]));
    const wall = upper[i].geometry as THREE.CylinderGeometry;
    expect(wall.parameters.radiusTop).toBe(wall.parameters.radiusBottom);
    expect(upper[i].material).toBe(lower[0].material);
    expect(roads[i].material).toBe(lower[0].material);
    const previousDeck = i === 0 ? lower[13] : roads[i - 1];
    const deckTop = bounds(previousDeck).max.y;
    expect(bounds(upper[i]).min.y).toBeCloseTo(deckTop);
    expect(bounds(upper[i]).max.y).toBeCloseTo(bounds(roads[i]).min.y);
    const previousRadius = diameter(previousDeck) / 2;
    expect(wall.parameters.radiusBottom).toBeCloseTo(previousRadius - 6);
    // A worker on the outer road has 2 m of headroom beside the vertical wall.
    // Cast only from that floor, since higher decks deliberately overhang it.
    const ray = new THREE.Raycaster(new THREE.Vector3(previousRadius - 1, deckTop + 2, 0), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(assembly.pickables)[0];
    expect(hit?.point.y).toBeCloseTo(deckTop, 4);
  }
  const entrances = assembly.pickables.filter(mesh => mesh.name.includes("-entrances-"));
  expect(entrances).toHaveLength(28);
  for (const band of entrances) {
    // The painted arch must remain visible outside the polygonal wall face.
    const points = band.geometry.getAttribute("position");
    const center = new THREE.Vector3();
    for (let vertex = 0; vertex < 3; vertex++) center.add(new THREE.Vector3().fromBufferAttribute(points, vertex));
    center.divideScalar(3);
    const outward = new THREE.Vector3(Math.sin(Math.PI / 32), 0, Math.cos(Math.PI / 32));
    const ray = new THREE.Raycaster(center.clone().add(outward), outward.clone().negate(), 0, 2);
    expect(ray.intersectObjects(assembly.pickables)[0]?.object).toBe(band);
  }
});
