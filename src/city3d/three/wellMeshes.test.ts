import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createMedievalWellModel } from "../../buildings/wells/medievalWell";
import { createPublicWaterBasinModel } from "../../buildings/wells/publicWaterBasin";
import { createTownWells } from "./wellMeshes";

it.each(["well", "publicBasin"] as const)(
  "instances the BV %s model at plan coordinates and terrain height without changing its scale",
  kind => {
    const sites = [
      { id: "a", point: [24, 53] as [number, number], kind },
      { id: "b", point: [-17, -62] as [number, number], kind }
    ];
    const wells = createTownWells(sites, ([x]) => x + 100);
    const reference = kind === "well" ? createMedievalWellModel() : createPublicWaterBasinModel();
    const expected = new THREE.Box3().setFromObject(reference.group);
    const matrix = new THREE.Matrix4();
    sites.forEach((site, index) => {
      const bounds = new THREE.Box3();
      for (const mesh of wells.pickables as THREE.InstancedMesh[]) {
        mesh.getMatrixAt(index, matrix);
        mesh.geometry.computeBoundingBox();
        bounds.union(mesh.geometry.boundingBox!.clone().applyMatrix4(matrix));
        expect(mesh.count).toBe(2);
      }
      const offset = new THREE.Vector3(site.point[0], site.point[0] + 100, -site.point[1]);
      expect(bounds.min.distanceTo(expected.min.clone().add(offset))).toBeLessThan(0.00001);
      expect(bounds.max.distanceTo(expected.max.clone().add(offset))).toBeLessThan(0.00001);
    });
    expect(wells.pickables.length).toBeLessThan(25);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const mesh of wells.pickables) {
      resources.add(mesh.geometry);
      resources.add(mesh.material as THREE.Material);
    }
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    wells.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    reference.dispose();
  }
);

it("creates no geometry for a city without wells", () => {
  const wells = createTownWells([]);
  expect(wells.group.children).toHaveLength(0);
  wells.dispose();
});
