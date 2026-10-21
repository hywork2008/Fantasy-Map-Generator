import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { MedievalModel } from "./modelKit";

const modules = import.meta.glob<{ models: MedievalModel[] }>("./*Models.ts", { eager: true });
const models = Object.values(modules).flatMap(module => module.models);
const bounds = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object, true);

function inspect(id: string, check: (model: ReturnType<MedievalModel["create"]>) => void) {
  const model = models.find(definition => definition.id === id)!.create();
  model.group.updateMatrixWorld(true);
  try {
    check(model);
  } finally {
    model.dispose();
  }
}

describe("medieval structural clearance", () => {
  it("keeps hall door faces clear of posts, buttresses, walls and shop displays", () => {
    for (const definition of models) {
      inspect(definition.id, model => {
        for (const door of model.pickables.filter(mesh => mesh.name === "door-leaf")) {
          const center = bounds(door).getCenter(new THREE.Vector3());
          const normal = new THREE.Vector3(0, 0, 1).transformDirection(door.matrixWorld);
          const ray = new THREE.Raycaster(center.clone().addScaledVector(normal, 0.6), normal.clone().negate(), 0, 0.7);
          const first = ray.intersectObjects(model.pickables, false)[0]?.object;
          expect(first?.name, `${definition.id}: doorway at ${center.toArray()}`).toBe("door-leaf");
        }
      });
    }
  });

  it("connects each civic exterior stair and landing to its upper doorway", () => {
    for (const definition of models.filter(definition => [26, 27, 28, 37, 38, 39].includes(definition.task))) {
      inspect(definition.id, model => {
        const landing = model.pickables.find(mesh => mesh.name === "upper-landing");
        if (!landing) return;
        const landingBounds = bounds(landing);
        const doors = model.pickables.filter(mesh => mesh.name === "door-leaf");
        for (const door of doors) {
          const doorBounds = bounds(door);
          expect(landingBounds.min.x).toBeLessThan(doorBounds.min.x);
          expect(landingBounds.max.x).toBeGreaterThan(doorBounds.max.x);
          expect(landingBounds.min.z).toBeLessThanOrEqual(doorBounds.max.z);
          expect(Math.abs(landingBounds.max.y - doorBounds.min.y)).toBeLessThan(0.1);
        }
        const stairs = model.pickables.filter(mesh => mesh.name === "civic-stair").map(bounds);
        const highest = stairs.reduce((a, b) => (a.max.y > b.max.y ? a : b));
        expect(highest.intersectsBox(landingBounds)).toBe(true);
        const walk = model.pickables.find(mesh => mesh.name === "balcony-access-walk");
        if (walk) {
          const balcony = model.pickables.find(mesh =>
            ["civic-balcony", "cloth-inspection-balcony"].includes(mesh.name)
          )!;
          const walkBounds = bounds(walk).expandByScalar(0.01);
          expect(walkBounds.intersectsBox(landingBounds)).toBe(true);
          expect(walkBounds.intersectsBox(bounds(balcony))).toBe(true);
          expect(bounds(balcony).max.y).toBeCloseTo(landingBounds.max.y);
        }
      });
    }
  });

  it("exposes chapel and friary bells above the church roof", () => {
    for (const [id, bellName] of [
      ["village-chapel", "small-bell"],
      ["mendicant-friary", "friary-bell"]
    ]) {
      inspect(id, model => {
        const mainRoof = model.pickables.find(mesh => mesh.name === "pitched-roof")!;
        const bell = model.pickables.find(mesh => mesh.name === bellName)!;
        expect(bounds(bell).min.y).toBeGreaterThan(bounds(mainRoof).max.y);
      });
    }
  });

  it("leaves a chicken opening at the head of the coop ramp", () => {
    inspect("chicken-coop", model => {
      const slats = model.pickables.filter(mesh => mesh.name === "coop-front-slat");
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.4, 1.2), new THREE.Vector3(0, 0, -1), 0, 0.6);
      expect(ray.intersectObjects(slats, false)).toHaveLength(0);
    });
  });

  it("supports both edges of the sloping produce awning without protruding posts", () => {
    inspect("market-produce-stall", model => {
      const panels = model.pickables.filter(mesh => mesh.name === "awning-panel");
      for (const post of model.pickables.filter(mesh => mesh.name === "stall-post")) {
        const top = bounds(post).max.y;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(post.position.x, 4, post.position.z),
          new THREE.Vector3(0, -1, 0)
        );
        const hit = ray.intersectObjects(panels, false)[0];
        expect(hit).toBeDefined();
        expect(Math.abs(hit.point.y - top)).toBeLessThan(0.04);
      }
    });
  });

  it("keeps cargo and work tables out of the entrance approach", () => {
    for (const id of ["merchant-warehouse", "town-brewery", "ale-brewhouse", "bread-bakehouse", "town-bakery"]) {
      inspect(id, model => {
        for (const door of model.pickables.filter(mesh => mesh.name === "door-leaf")) {
          const center = bounds(door).getCenter(new THREE.Vector3());
          center.y = 0.8;
          const ray = new THREE.Raycaster(
            center.clone().add(new THREE.Vector3(0, 2e-2, 2)),
            new THREE.Vector3(0, 0, -1),
            0,
            2.1
          );
          expect(ray.intersectObjects(model.pickables, false)[0]?.object.name, id).toBe("door-leaf");
        }
      });
    }
  });
});
