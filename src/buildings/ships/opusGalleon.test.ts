import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createOpusGalleon, OPUS_GALLEON, OPUS_GALLEON_QUALITIES } from "./opusGalleon";

it.each(OPUS_GALLEON_QUALITIES)("stays within the advertised envelope with finite geometry (%s)", quality => {
  const model = createOpusGalleon(quality);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(OPUS_GALLEON.length);
  expect(bounds.max.y).toBeLessThanOrEqual(OPUS_GALLEON.height);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-OPUS_GALLEON.draft);
  for (const mesh of model.pickables)
    expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
  const deck = new THREE.Raycaster(new THREE.Vector3(1, 30, 3), new THREE.Vector3(0, -1, 0)).intersectObject(
    model.pickables[0]
  );
  expect(deck[0].point.y).toBeGreaterThan(4);
  model.dispose();
});

it("keeps the low tier substantially lighter than the high tier", () => {
  const triangles = (quality: (typeof OPUS_GALLEON_QUALITIES)[number]) => {
    const model = createOpusGalleon(quality);
    const count = model.pickables.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);
    model.dispose();
    return count;
  };
  expect(triangles("low")).toBeLessThan(triangles("high") * 0.6);
});

it("releases each geometry and material exactly once", () => {
  const model = createOpusGalleon();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  model.group.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
    resources.add(object.geometry);
    for (const material of [object.material].flat()) resources.add(material);
  });
  const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const spy of disposals) expect(spy).toHaveBeenCalledTimes(1);
});
