import * as THREE from "three";
import { expect, it } from "vitest";
import { createDocument } from "../generators/document";
import { createSkyBackdrop } from "./skyBackdrop";
import { DEFAULT_SUN } from "./sunLighting";

it("fits vertical walls to the map bounds and shows only the far one or two as the camera rotates", () => {
  const sky = createSkyBackdrop();
  const city = createDocument("sky-box", 160);
  sky.fit(city, () => 0);
  const bounds = new THREE.Box3();
  for (const vertex of Object.values(city.mesh.vertices))
    bounds.expandByPoint(new THREE.Vector3(vertex.point[0], 0, -vertex.point[1]));
  const camera = new THREE.PerspectiveCamera();
  const visible = () => sky.group.children.filter(wall => wall.visible).map(wall => wall.name);
  try {
    for (const [x, z, expected] of [
      [0, 100, ["ce-sky-north"]],
      [100, 100, ["ce-sky-west", "ce-sky-north"]],
      [-100, -100, ["ce-sky-east", "ce-sky-south"]],
      [100, 0, ["ce-sky-west"]]
    ] as const) {
      camera.position.set(x, 30, z);
      camera.lookAt(0, 0, 0);
      sky.update(camera, { ...DEFAULT_SUN });
      expect(visible()).toEqual(expected);
    }
    expect(sky.group.children[0].position.x).toBe(bounds.min.x);
    expect(sky.group.children[1].position.x).toBe(bounds.max.x);
    expect(sky.group.children[2].position.z).toBe(bounds.min.z);
    expect(sky.group.children[3].position.z).toBe(bounds.max.z);
    for (const wall of sky.group.children) {
      expect(wall.position.y - wall.scale.y / 2).toBe(-2);
      expect(wall.scale.y).toBeGreaterThan(160);
    }
  } finally {
    sky.dispose();
  }
});

it("uses blue daylight and warm sunrise or sunset colors independently of fog and shadows", () => {
  const sky = createSkyBackdrop();
  const camera = new THREE.PerspectiveCamera();
  try {
    sky.update(camera, { ...DEFAULT_SUN, enabled: true });
    const daylight = sky.zenith.clone();
    expect(daylight.b).toBeGreaterThan(daylight.r);
    for (const color of ["#ff8a80", "#ff6040"]) {
      sky.update(camera, { ...DEFAULT_SUN, enabled: true, color, shadows: false });
      expect(sky.zenith.r).toBeGreaterThan(daylight.r);
      expect(sky.zenith.b).toBeLessThan(daylight.b);
      expect(sky.horizon.r).toBeGreaterThan(sky.horizon.b);
    }
    const material = (sky.group.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(material.fog).toBe(false);
    sky.update(camera, { ...DEFAULT_SUN, enabled: false, color: "#ff6040" });
    expect(sky.zenith).toEqual(daylight);
  } finally {
    sky.dispose();
  }
});
