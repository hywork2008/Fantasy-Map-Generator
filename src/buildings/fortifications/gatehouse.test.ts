import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createGatehouse, GATEHOUSE, type GatehouseView } from "./gatehouse";

function hits(meshes: THREE.Mesh[], origin: number[], direction: number[], distance: number) {
  return new THREE.Raycaster(
    new THREE.Vector3(...origin),
    new THREE.Vector3(...direction),
    0,
    distance
  ).intersectObjects(meshes);
}

describe("inhabited town gatehouse", () => {
  it("keeps carts, porter access, the inspection window and the town-side stair entrance clear", () => {
    const model = createGatehouse();
    model.group.updateMatrixWorld(true);
    try {
      for (const x of [-1.4, 0, 1.4])
        for (const y of [0.3, 1.8, 3.2]) expect(hits(model.pickables, [x, y, -6], [0, 0, 1], 12)).toHaveLength(0);
      // Short rays cross only the relevant wall, not furniture elsewhere in the room.
      expect(hits(model.pickables, [-2.8, 1.2, -2.4], [1, 0, 0], 1.2)).toHaveLength(0);
      expect(hits(model.pickables, [-2.8, 1.8, 1.14], [1, 0, 0], 1.2)).toHaveLength(0);
      for (const x of [-4.45, 4.65]) expect(hits(model.pickables, [x, 1.6, -5.8], [0, 0, 1], 1.5)).toHaveLength(0);
      expect(hits(model.pickables, [-4.5, 2.2, 4.5], [0, 0, 1], 1)).toHaveLength(0);
      expect(hits(model.pickables, [-4, 2.2, 4.5], [0, 0, 1], 1).length).toBeGreaterThan(0);
      // Every stair tread has standing headroom through the real floor opening.
      for (const mesh of model.pickables.filter(mesh => mesh.name === "stair-tread")) {
        const p = mesh.position;
        expect(hits(model.pickables, [p.x, p.y + 0.12, p.z], [0, 1, 0], 1.95)).toHaveLength(0);
      }
      // Raised grille passes through a slot rather than intersecting the upper floor.
      const floors = model.pickables.filter(mesh => mesh.name.includes("floor"));
      expect(hits(floors, [0, 5, 3.85], [0, 1, 0], 0.6)).toHaveLength(0);
      // The garderobe is accessible and its seat has a continuous waste opening.
      expect(hits(model.pickables, [-7.1, 6.3, 2], [1, 0, 0], 0.9)).toHaveLength(0);
      expect(hits(model.pickables, [-7.4, 6.1, 2], [0, -1, 0], 1.3)).toHaveLength(0);
    } finally {
      model.dispose();
    }
  });

  for (const view of ["exterior", "ground-floor", "upper-floor"] as GatehouseView[]) {
    it(`${view} stays finite, grounded, within its envelope, and releases resources once`, () => {
      const model = createGatehouse("legacy", view);
      try {
        model.group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model.group);
        const size = bounds.getSize(new THREE.Vector3());
        expect(bounds.min.y).toBeCloseTo(0);
        expect(size.x).toBeLessThanOrEqual(GATEHOUSE.size[0]);
        expect(size.z).toBeLessThanOrEqual(GATEHOUSE.size[1]);
        expect(bounds.max.y).toBeLessThanOrEqual(GATEHOUSE.size[2]);
        for (const mesh of model.pickables)
          expect(Array.from(mesh.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
        const names = new Set(model.pickables.map(mesh => mesh.name));
        expect(names.has("pitched-roof")).toBe(view === "exterior");
        expect(names.has("upper-floor")).toBe(view !== "ground-floor");
        const resources = new Set(model.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
        const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
        model.dispose();
        for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
      } catch (error) {
        model.dispose();
        throw error;
      }
    });
  }
});
