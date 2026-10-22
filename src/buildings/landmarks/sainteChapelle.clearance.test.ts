import * as THREE from "three";
import { expect, it } from "vitest";
import { model } from "./sainteChapelle";

it("places sanctuary buttresses between the seven glazing bays", () => {
  const assembly = model.create();
  assembly.group.updateMatrixWorld(true);
  try {
    const glass = assembly.pickables.filter(
      mesh =>
        mesh.name === "upper-glazing" &&
        mesh.position.x > 10 &&
        (mesh.material as THREE.MeshLambertMaterial).color.getHex() === 0x6c959a
    );
    expect(glass).toHaveLength(7);
    for (const pane of glass) {
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(pane.quaternion);
      const tangent = new THREE.Vector3(1, 0, 0).applyQuaternion(pane.quaternion);
      const center = pane.position
        .clone()
        .add(new THREE.Vector3(0, 7, 0))
        .addScaledVector(tangent, 0.2);
      const ray = new THREE.Raycaster(center.addScaledVector(normal, 3), normal.negate(), 0, 3.1);
      expect(ray.intersectObjects(assembly.pickables, false)[0]?.object.name).toBe("upper-glazing");
    }
  } finally {
    assembly.dispose();
  }
});
