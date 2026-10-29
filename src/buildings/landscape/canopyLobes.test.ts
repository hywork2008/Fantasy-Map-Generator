import * as THREE from "three";
import { expect, it } from "vitest";
import { createCanopyLobes, fitCanopyLobe } from "./canopyLobes";

it.each([0, Math.PI / 4, Math.PI / 2])("retains elongated foliage and finite shading at branch bearing %s", angle => {
  const up = new THREE.Vector3(0, 1, 0);
  const center = new THREE.Vector3(1, 5, 2);
  const points = Array.from({ length: 32 }, (_, index) => {
    const t = (index / 32) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(t) * 4, Math.sin(t * 3) * 0.2, Math.sin(t) * 0.5)
      .applyAxisAngle(up, angle)
      .add(center);
  });
  const lobe = fitCanopyLobe(points, 1, true);
  const geometry = createCanopyLobes([lobe], { hue: 0.3, saturation: 0.4, lightness: 0.25 }, 42);
  try {
    const aligned = new THREE.Box3();
    const positions = geometry.getAttribute("position"),
      normals = geometry.getAttribute("normal");
    for (let i = 0; i < positions.count; i++) {
      aligned.expandByPoint(
        new THREE.Vector3().fromBufferAttribute(positions, i).sub(center).applyAxisAngle(up, -angle)
      );
      expect(new THREE.Vector3().fromBufferAttribute(normals, i).length()).toBeCloseTo(1, 5);
    }
    const size = aligned.getSize(new THREE.Vector3());
    expect(size.x / size.z).toBeGreaterThan(5);
    expect(size.y / size.x).toBeLessThan(0.1);
    expect([...geometry.getAttribute("color").array].every(Number.isFinite)).toBe(true);
  } finally {
    geometry.dispose();
  }
});

it("keeps a sloping frond thin in its own frame without changing its radii", () => {
  const center = new THREE.Vector3(1, 5, 2);
  const radius = new THREE.Vector3(3, 0.12, 0.4);
  const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 1.1, -0.9));
  const geometry = createCanopyLobes(
    [{ center, radius, orientation }],
    { hue: 0.3, saturation: 0.4, lightness: 0.25 },
    42
  );
  try {
    const box = new THREE.Box3();
    const inverse = orientation.clone().invert();
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      box.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions, i).sub(center).applyQuaternion(inverse));
      expect(new THREE.Vector3().fromBufferAttribute(geometry.getAttribute("normal"), i).length()).toBeCloseTo(1, 5);
    }
    const size = box.getSize(new THREE.Vector3());
    expect(size.x / size.y).toBeGreaterThan(15);
    expect(radius.toArray()).toEqual([3, 0.12, 0.4]);
    expect([...geometry.getAttribute("color").array].every(Number.isFinite)).toBe(true);
  } finally {
    geometry.dispose();
  }
});
