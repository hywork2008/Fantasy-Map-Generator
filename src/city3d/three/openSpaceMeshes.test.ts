import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createCemeteryProp } from "../../buildings/landscape/cemeteryProps";
import type { OpenSpacePlan } from "../../city-editor/renderers/openSpaceSites";
import { createTownOpenSpaces } from "./openSpaceMeshes";

it("instances repeated trees at plan coordinates and terrain heights and releases every resource once", () => {
  const plan: OpenSpacePlan = {
    surfaces: [],
    sites: [
      { model: "sacred_yew", point: [24, 53], angle: 0, radius: 2 },
      { model: "sacred_yew", point: [-17, -62], angle: 0.5, radius: 3 }
    ]
  };
  const meshes = createTownOpenSpaces(plan, { heightAt: ([x]) => x + 100, foundationAt: () => 200 });
  expect(meshes.pickables.length).toBeLessThan(6);
  const matrix = new THREE.Matrix4();
  for (const mesh of meshes.pickables as THREE.InstancedMesh[]) {
    expect(mesh.count).toBe(2);
    plan.sites.forEach((site, i) => {
      mesh.getMatrixAt(i, matrix);
      expect(matrix.elements[12]).toBeCloseTo(site.point[0]);
      expect(matrix.elements[13]).toBeCloseTo(site.point[0] + 100.05, 4);
      expect(matrix.elements[14]).toBeCloseTo(-site.point[1]);
    });
  }
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of meshes.pickables) {
    resources.add(mesh.geometry);
    resources.add(mesh.material as THREE.Material);
  }
  const spies = [...resources].map(r => vi.spyOn(r, "dispose"));
  meshes.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});

it("keeps concave horseshoe grave footprints instead of enclosing the central opening", () => {
  const footprint: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [3, 4],
    [3, 1],
    [1, 1],
    [1, 4],
    [0, 4]
  ];
  const meshes = createTownOpenSpaces({
    surfaces: [],
    sites: [{ model: "terrace_horseshoe", point: [2, 2], angle: 0, footprint }]
  });
  meshes.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(2, 10, -3), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObjects(meshes.pickables)).toHaveLength(0);
  ray.set(new THREE.Vector3(0.5, 10, -3), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObjects(meshes.pickables).length).toBeGreaterThan(0);
  meshes.dispose();
});

it("keeps the tower of silence roofless and its central well open", () => {
  const model = createCemeteryProp("tower_of_silence");
  model.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObjects(model.pickables)).toHaveLength(0);
  ray.set(new THREE.Vector3(3, 20, 0), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObjects(model.pickables).length).toBeGreaterThan(0);
  model.dispose();
});

it("drapes batched ground over relief and grounds facilities on their whole footprint", () => {
  const ring: [number, number][] = [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20]
  ];
  const meshes = createTownOpenSpaces(
    {
      surfaces: [{ ring, color: "#7ea867", offset: 0.025 }],
      sites: [{ model: "ossuary_charnel_house", point: [10, 10], angle: 0, width: 6, depth: 4, footprint: ring }]
    },
    { heightAt: ([x, y]) => (x + y) / 10, foundationAt: () => 4 }
  );
  const ground = meshes.pickables.find(m => m.name === "open-space-ground")!;
  const p = ground.geometry.getAttribute("position");
  expect(p.count).toBeGreaterThan(6);
  for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeCloseTo((p.getX(i) - p.getZ(i)) / 10 + 0.025, 5);
  for (const mesh of meshes.pickables.filter(m => m instanceof THREE.InstancedMesh) as THREE.InstancedMesh[]) {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeCloseTo(4.05);
  }
  meshes.dispose();
});

it("renders reused BV buildings with mixed primitive and roof attributes", () => {
  const models = ["chapel", "cottage", "woodyard", "basin", "headstone", "ledger"] as const;
  const meshes = createTownOpenSpaces({
    surfaces: [],
    sites: models.map((model, i) => ({ model, point: [i * 20, 0], angle: 0.2, width: 5, depth: 4 }))
  });
  for (const model of models) expect(meshes.pickables.some(mesh => mesh.name === `${model}-instances`)).toBe(true);
  expect(meshes.pickables.every(mesh => mesh.geometry.getAttribute("position").count > 0)).toBe(true);
  meshes.dispose();
});

it("uses saved tower openings even when an edited tower is not circular", () => {
  const footprint: [number, number][] = [
    [0, 0],
    [12, 0],
    [12, 10],
    [0, 10]
  ];
  const holes: [number, number][][] = [
    [
      [1, 1],
      [11, 1],
      [11, 9],
      [1, 9]
    ],
    [
      [4, 3],
      [8, 3],
      [8, 7],
      [4, 7]
    ]
  ];
  const meshes = createTownOpenSpaces({
    surfaces: [],
    sites: [{ model: "tower_of_silence", point: [6, 5], angle: 0, footprint, holes }]
  });
  meshes.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(6, 20, -5), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObjects(meshes.pickables)).toHaveLength(0);
  ray.set(new THREE.Vector3(2, 20, -5), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObjects(meshes.pickables).length).toBeGreaterThan(0);
  const bounds = new THREE.Box3().setFromObject(meshes.group);
  expect(bounds.min.x).toBe(0);
  expect(bounds.max.x).toBe(12);
  expect(bounds.min.z).toBe(-10);
  expect(bounds.max.z).toBeCloseTo(0);
  meshes.dispose();
});
