import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createDocument } from "../generators/document";
import { createSkyBackdrop } from "./skyBackdrop";
import { DEFAULT_SUN } from "./sunLighting";

it("shares a static seamless wallpaper, resizes it without regeneration, and disposes replaced textures", () => {
  const sky = createSkyBackdrop();
  try {
    sky.fit(createDocument("scenery-height", 160), () => 0);
    sky.setScenery({ style: "mountains", height: 20 });
    const planes = sky.group.children.map(wall => wall.children[0] as THREE.Mesh);
    const material = planes[0].material as THREE.MeshBasicMaterial;
    const texture = material.map!;
    const image = texture.image as { data: Uint8Array; width: number; height: number };
    for (let y = 0; y < image.height; y++) {
      const first = y * image.width * 4,
        last = first + (image.width - 1) * 4;
      expect([...image.data.slice(first, first + 4)]).toEqual([...image.data.slice(last, last + 4)]);
    }
    expect(planes.every(plane => plane.material === material && plane.visible)).toBe(true);
    expect(planes.every(plane => plane.userData.ceSky && !plane.castShadow && !plane.receiveShadow)).toBe(true);
    const plane = planes[0];
    const position = plane.geometry.getAttribute("position");
    const worldY = (index: number) => {
      plane.updateWorldMatrix(true, false);
      return new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(plane.matrixWorld).y;
    };
    const initialMountainTop = worldY(0);
    const plainTop = worldY(2);
    expect(plainTop - worldY(4)).toBeGreaterThan(6);
    expect(plainTop - worldY(4)).toBeLessThan(15);
    for (const height of [5, 40]) {
      sky.setScenery({ style: "mountains", height });
      expect(material.map).toBe(texture);
      expect(worldY(2)).toBeCloseTo(plainTop, 4);
    }
    expect(worldY(0)).toBeGreaterThan(initialMountainTop);
    const dispose = vi.spyOn(texture, "dispose");
    sky.setScenery({ style: "countryside", height: 20 });
    expect(worldY(2)).toBeCloseTo(plainTop, 4);
    sky.setScenery({ style: "countryside", height: 40 });
    expect(worldY(2)).toBeCloseTo(plainTop, 4);
    expect(dispose).toHaveBeenCalledOnce();
    expect(material.map).not.toBe(texture);
    sky.setScenery({ style: "none", height: 20 });
    expect(material.map).toBeNull();
    expect(planes.every(plane => !plane.visible)).toBe(true);
  } finally {
    sky.dispose();
  }
});

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
