import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { meshProjection } from "../meshProjection";
import { BARBICANS, createBarbican } from "./barbicans";

describe("barbican defensive approaches", () => {
  for (const definition of BARBICANS) {
    it(`${definition.id} keeps its approach passable and its court open to the sky`, () => {
      const model = createBarbican(definition);
      try {
        model.group.updateMatrixWorld(true);
        // Sample both pedestrian and cart headroom along the whole approach, including turns.
        for (const y of [0.5, 2.8]) {
          for (let i = 1; i < definition.route.length; i++) {
            const a = definition.route[i - 1];
            const b = definition.route[i];
            const direction = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]);
            const distance = direction.length();
            const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
            for (const offset of [-0.65, 0, 0.65]) {
              const start = new THREE.Vector3(a[0], y, a[1]).addScaledVector(normal, offset);
              const ray = new THREE.Raycaster(start, direction.clone().normalize(), 0, distance);
              expect(ray.intersectObjects(model.pickables), `route ${i}, height ${y}, offset ${offset}`).toHaveLength(
                0
              );
            }
          }
        }
        const sky = new THREE.Raycaster(new THREE.Vector3(0, 30, 0), new THREE.Vector3(0, -1, 0));
        expect(sky.intersectObjects(model.pickables)).toHaveLength(0);
        // Both sides of each wall junction must remain solid, including the neck's re-entrant corners.
        for (let i = 0; i < definition.circuit.length; i++) {
          const count = definition.circuit.length;
          const a = definition.circuit[(i + count - 1) % count];
          const p = definition.circuit[i];
          const b = definition.circuit[(i + 1) % count];
          const incoming = new THREE.Vector2(p[0] - a[0], p[1] - a[1]).normalize();
          const outgoing = new THREE.Vector2(b[0] - p[0], b[1] - p[1]).normalize();
          const normal = new THREE.Vector3(-incoming.y - outgoing.y, 0, incoming.x + outgoing.x).normalize();
          for (const side of [-1, 1]) {
            const start = new THREE.Vector3(p[0], 5, p[1]).addScaledVector(normal, side * 0.65);
            const tangent = new THREE.Vector3(normal.z, 0, -normal.x);
            // Avoid a ray exactly on the shared floating-point triangle boundary.
            for (const shift of [-0.025, 0.025])
              expect(
                new THREE.Raycaster(
                  start.clone().addScaledVector(tangent, shift),
                  new THREE.Vector3(0, -1, 0)
                ).intersectObjects(model.pickables).length,
                `wall junction ${i}, side ${side}, shift ${shift}`
              ).toBeGreaterThan(0);
          }
        }
        const bounds = new THREE.Box3().setFromObject(model.group);
        expect(bounds.min.y).toBeCloseTo(0);
        for (const view of ["top", "side"] as const) {
          const svg = meshProjection(model, view);
          expect(svg).not.toMatch(/NaN|Infinity/);
          expect(svg).toContain("<path");
        }
      } finally {
        model.dispose();
      }
    });
  }
});
