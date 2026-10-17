import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { planVertex } from "./planFrame";

describe("plan frame", () => {
  it("stores plan +y at -Z", () => {
    expect(planVertex([3, 4], 2)).toEqual([3, 2, -4]);
  });

  it("keeps SVG chirality from the city camera", () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 80000);
    const radius = 100;
    camera.position.set(radius * 0.85, radius * 0.62, radius * 0.85);
    camera.lookAt(0, 4, 0);
    camera.updateMatrixWorld();
    const project = (plan: [number, number]) => {
      const [x, y, z] = planVertex(plan, 0);
      return new THREE.Vector3(x, y, z).project(camera);
    };
    const origin = project([0, 0]);
    const east = project([10, 0]);
    const north = project([0, 10]);
    const area = (east.x - origin.x) * (north.y - origin.y) - (east.y - origin.y) * (north.x - origin.x);
    expect(area).toBeGreaterThan(0);
  });
});
