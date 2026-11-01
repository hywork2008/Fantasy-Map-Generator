import * as THREE from "three";
import { expect, it } from "vitest";
import { collectModelMetrics } from "../../../building-viewer/modelMetrics";
import { model } from "../notreDame";

const factory = (role: string) => model.highDetail!.parts!().find(part => part.role === role)!;
const down = (meshes: THREE.Object3D[], x: number, z: number) =>
  new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0)).intersectObjects(meshes);

it("keeps the choir void open, joins both aisle roof profiles and leaves the ambulatory ends accessible", () => {
  const ambulatory = factory("ambulatory").create(),
    body = factory("longitudinal-body").create();
  try {
    ambulatory.group.updateMatrixWorld(true);
    body.group.updateMatrixWorld(true);
    expect(down(ambulatory.pickables, 45, 0)).toHaveLength(0);
    for (const side of [-1, 1]) {
      for (const [radius, y] of [
        [13.4, 1.4],
        [9.45, 13.4]
      ]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(41.9, y, side * radius), new THREE.Vector3(1, 0, 0), 0, 2);
        expect(ray.intersectObjects(ambulatory.pickables)).toHaveLength(0);
      }
      for (const radius of [8, 10.8, 13.5, 16.5]) {
        const left = down(body.pickables, 41.99, side * radius)[0];
        const right = down(ambulatory.pickables, 42.01, side * radius)[0];
        expect(left).toBeDefined();
        expect(right).toBeDefined();
        expect(Math.abs(left.point.y - right.point.y)).toBeLessThan(0.03);
      }
    }
    const bounds = new THREE.Box3().setFromObject(ambulatory.group);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeLessThan(22.7);
    const compact = model.highDetail!.assembleParts!([factory("ambulatory")]);
    try {
      expect(collectModelMetrics(compact.group).triangles).toBeGreaterThan(5000);
      expect(collectModelMetrics(compact.group).triangles).toBeLessThan(20000);
      expect(compact.pickables.length).toBeLessThanOrEqual(5);
      for (const mesh of compact.pickables)
        for (const name of ["position", "normal"])
          expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    } finally {
      compact.dispose();
    }
  } finally {
    ambulatory.dispose();
    body.dispose();
  }
});

it("keeps the lower arcade open and the gallery glazing behind the actual wall face", () => {
  const assembly = factory("ambulatory").create();
  try {
    assembly.group.updateMatrixWorld(true);
    const angle = (5.5 * Math.PI) / 12,
      apothem = 12.4 * Math.cos(Math.PI / 24);
    const normal = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const ray = (u: number, y: number, far: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(42, y, 0).addScaledVector(normal, apothem + 0.1).addScaledVector(tangent, u),
        normal.clone().negate(),
        0,
        far
      );
    expect(ray(0, 1.4, 1).intersectObjects(assembly.pickables)).toHaveLength(0);
    expect(ray(0.3, 13.8, 0.25).intersectObjects(assembly.pickables)).toHaveLength(0);
    const glass = ray(0.3, 13.8, 0.5).intersectObjects(assembly.pickables)[0];
    expect(glass).toBeDefined();
    expect((glass.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>).material.color.getHex()).toBe(
      0x6c959a
    );
    expect(glass.distance).toBeCloseTo(0.36, 4);
    expect(ray(1.4, 13.8, 0.25).intersectObjects(assembly.pickables).length).toBeGreaterThan(0);
  } finally {
    assembly.dispose();
  }
});

it("removes duplicate chapel floors and lower roof surfaces while retaining one visible annular roof", () => {
  const ambulatory = factory("ambulatory").create(),
    chapels = factory("radiating-chapels").create();
  try {
    ambulatory.group.updateMatrixWorld(true);
    chapels.group.updateMatrixWorld(true);
    const floors = ambulatory.pickables.filter(mesh => mesh.name === "ambulatory-ground-floor");
    const roofs = ambulatory.pickables.filter(mesh => mesh.name === "ambulatory-fitted-roof");
    const chapelRoofs = chapels.pickables.filter(mesh => mesh.name === "chevet-chapel-roof");
    const angle = Math.PI / 14,
      x = 42 + Math.sin(angle) * 17.9,
      z = Math.cos(angle) * 17.9;
    expect(down(floors, x, z)).toHaveLength(0);
    expect(down(roofs, x, z)).toHaveLength(0);
    expect(down(chapelRoofs, x, z)[0].point.y).toBeCloseTo(14);
    for (let cell = 0; cell < 12; cell++)
      for (const radius of [7.5, 10.5, 13.4, 16, 17.9]) {
        const t = ((cell + 0.4) * Math.PI) / 12;
        const hits = down(roofs, 42 + radius * Math.sin(t), radius * Math.cos(t));
        const heights = new Set(hits.map(hit => Math.round(hit.point.y * 1000)));
        expect(heights.size).toBeLessThanOrEqual(1);
      }
  } finally {
    ambulatory.dispose();
    chapels.dispose();
  }
});
