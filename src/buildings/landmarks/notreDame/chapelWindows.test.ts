import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { model as cologne } from "../cologne";
import { model as notreDame } from "../notreDame";
import { NotreDameKit } from "./details";

it.each([
  [notreDame, "chevet-chapel", 14],
  [cologne, "radiating-chapel", 21]
] as const)(
  "$0.id fits each radiating chapel window and its full surround to a supporting wall face",
  (definition, wallName, count) => {
    const windows = vi.spyOn(NotreDameKit.prototype, "window");
    const factory = definition.highDetail!.parts!().find(part => part.role === "radiating-chapels")!;
    const assembly = factory.create();
    try {
      expect(windows).toHaveBeenCalledTimes(count);
      const walls = assembly.pickables.filter(mesh => mesh.name === wallName);
      expect(walls.length).toBeGreaterThan(0);
      assembly.group.updateMatrixWorld(true);
      for (const [x, z, base, width = 3.2, height = 7.5, angle = 0] of windows.mock.calls) {
        const normal = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
        // Check both sides of the outer surround as well as the window centre.
        // This catches windows floating beside a polygon edge or rotated through it.
        for (const u of [-width / 2 - 0.27, 0, width / 2 + 0.27]) {
          const origin = new THREE.Vector3(x, base + height * 0.3, z)
            .addScaledVector(tangent, u)
            .addScaledVector(normal, 0.4);
          const hit = new THREE.Raycaster(origin, normal.clone().negate(), 0, 0.5).intersectObjects(walls)[0];
          expect(hit, `Wall support for window (${x}, ${z}) at offset ${u}`).toBeDefined();
          expect(hit.distance).toBeCloseTo(0.41, 4);
          expect(Math.abs(hit.face!.normal.dot(normal))).toBeCloseTo(1, 5);
        }
      }
    } finally {
      assembly.dispose();
      windows.mockRestore();
    }
  }
);
