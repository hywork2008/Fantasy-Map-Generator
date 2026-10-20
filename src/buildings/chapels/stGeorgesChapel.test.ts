import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { meshProjection } from "../meshProjection";
import { createStGeorgesChapel, ST_GEORGES_CHAPEL } from "./stGeorgesChapel";

it("keeps the nave above the aisles, projects both views and releases shared resources once", () => {
  const model = createStGeorgesChapel();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBe(0);
  expect(bounds.max.y).toBeLessThanOrEqual(ST_GEORGES_CHAPEL.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(ST_GEORGES_CHAPEL.width);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(ST_GEORGES_CHAPEL.depth);
  const top = (x: number, z: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0)).intersectObjects(model.pickables)[0]
      .point.y;
  expect(top(-19, 0)).toBeGreaterThan(top(-19, 10) + 8);
  expect(top(-1, 17)).toBeGreaterThan(19);
  for (const view of ["top", "side"] as const) {
    const svg = meshProjection(model, view);
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/NaN|Infinity/);
  }
  const geometries = new Set(model.pickables.map(mesh => mesh.geometry));
  expect(geometries.size).toBeLessThan(model.pickables.length / 10);
  const disposals = [...geometries].map(geometry => vi.spyOn(geometry, "dispose"));
  const materials = new Set(model.pickables.flatMap(mesh => mesh.material));
  const materialDisposals = [...materials].map(material => vi.spyOn(material, "dispose"));
  model.dispose();
  for (const dispose of [...disposals, ...materialDisposals]) expect(dispose).toHaveBeenCalledTimes(1);
});
