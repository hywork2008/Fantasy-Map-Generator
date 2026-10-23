import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { meshProjection } from "../meshProjection";
import { BASILICA_TEMPLE, createBasilicaTemple } from "./basilicaTemple";

it("stacks towers over nave over aisles, faces roofs outward and releases resources once", () => {
  const model = createBasilicaTemple();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-0.25);
  expect(bounds.max.y).toBeLessThanOrEqual(BASILICA_TEMPLE.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(BASILICA_TEMPLE.width);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(BASILICA_TEMPLE.depth);
  const hit = (x: number, z: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 80, z), new THREE.Vector3(0, -1, 0)).intersectObjects(model.pickables)[0];
  const top = (x: number, z: number) => hit(x, z).point.y;
  expect(top(-10, 0)).toBeGreaterThan(top(-10, 8) + 8);
  expect(top(-25.35, 8.95)).toBeGreaterThan(40);
  expect(top(4.9, 0)).toBeGreaterThan(top(-10, 0) + 10);
  // Lathe roofs (apse, ambulatory, chapels, spires) must present their outer face to the sky.
  for (const [x, z] of [
    [20, 0],
    [17.1, 7.5],
    [26.4, 0],
    [-25.35, 8.95]
  ]) {
    const face = hit(x, z).face;
    expect(face).toBeTruthy();
    expect(face?.normal.y).toBeGreaterThan(0);
  }
  for (const view of ["top", "side"] as const) {
    const svg = meshProjection(model, view);
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/NaN|Infinity/);
  }
  expect(model.pickables.length).toBeLessThanOrEqual(9);
  const disposals = model.pickables.map(mesh => vi.spyOn(mesh.geometry, "dispose"));
  const materials = new Set(model.pickables.flatMap(mesh => mesh.material));
  const materialDisposals = [...materials].map(material => vi.spyOn(material, "dispose"));
  model.dispose();
  for (const dispose of [...disposals, ...materialDisposals]) expect(dispose).toHaveBeenCalledTimes(1);
});

it("low quality keeps the silhouette with a fraction of the triangles", () => {
  const triangles = (quality: "high" | "low") => {
    const model = createBasilicaTemple(quality);
    model.group.updateMatrixWorld(true);
    const count = model.pickables.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
    const bounds = new THREE.Box3().setFromObject(model.group);
    model.dispose();
    return { count, bounds };
  };
  const high = triangles("high");
  const low = triangles("low");
  expect(low.count).toBeLessThan(high.count / 4);
  expect(low.bounds.max.y).toBeGreaterThan(high.bounds.max.y - 2);
  expect(low.bounds.max.x - low.bounds.min.x).toBeGreaterThan(high.bounds.max.x - high.bounds.min.x - 2);
});
