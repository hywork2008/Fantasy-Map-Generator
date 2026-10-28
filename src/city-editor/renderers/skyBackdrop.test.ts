import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createDocument } from "../generators/document";
import { createSkyBackdrop } from "./skyBackdrop";
import { DEFAULT_SUN } from "./sunLighting";

it("anchors the world tree to the mountain height without reloading it and masks landscape overlaps", () => {
  let finishLoading = () => {};
  const load = vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation((_url, onLoad) => {
    const texture = new THREE.Texture({ width: 1024, height: 1536 } as HTMLImageElement);
    finishLoading = () => onLoad?.(texture);
    return texture;
  });
  const ready = vi.fn(),
    dispose = vi.fn();
  const sky = createSkyBackdrop(ready);
  sky.fit(createDocument("world-tree", 160), () => 0);
  try {
    sky.setScenery({ style: "world-tree", height: 20 });
    const tree = sky.group.getObjectByName("ce-world-tree") as THREE.Mesh;
    const material = tree.material as THREE.MeshBasicMaterial;
    const texture = material.map!;
    texture.addEventListener("dispose", dispose);
    expect(tree.parent).toBe(sky.group);
    expect(tree.visible).toBe(true);
    expect(tree.castShadow || tree.receiveShadow || material.fog).toBe(false);
    expect(material.opacity).toBeGreaterThan(0);
    expect(material.opacity).toBeLessThan(0.2);
    expect(material.visible).toBe(false);
    finishLoading();
    expect(material.visible).toBe(true);
    expect(ready).toHaveBeenCalledOnce();
    const geometry = tree.geometry;
    const uv = geometry.getAttribute("uv");
    const positions = geometry.getAttribute("position");
    const ys = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBeLessThan(1);
    // One uninterrupted mesh spans more than one of the former 90-degree corners.
    expect(geometry.userData.panoramaAngle).toBeGreaterThan(Math.PI / 2);
    const width = geometry.userData.panoramaRadius * geometry.userData.panoramaAngle;
    const height = geometry.boundingBox!.max.y / (Math.max(...ys) - Math.min(...ys));
    expect(width / height).toBeCloseTo(1024 / 1536);
    const shader = { ...THREE.ShaderLib.basic, uniforms: {} } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const sceneryMaterial = (sky.group.getObjectByName("ce-scenery") as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(shader.uniforms.skySceneryMap.value).toBe(sceneryMaterial.map);
    const mountainHeight = shader.uniforms.skySceneryHeight.value;
    expect(mountainHeight).toBeGreaterThan(0);
    expect(Math.min(...Array.from({ length: positions.count }, (_, i) => positions.getX(i)))).toBeLessThan(-80);
    // Overlay facets must follow the sky's grid and stay in front of it, avoiding striped intersections.
    const skyPositions = (sky.group.getObjectByName("ce-sky-panorama") as THREE.Mesh).geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      if (uv.getX(i) < 0.001 || uv.getX(i) > 0.999) continue;
      const theta = Math.atan2(positions.getX(i), -positions.getZ(i));
      const match = Array.from({ length: skyPositions.count }, (_, j) => j).find(
        j =>
          skyPositions.getY(j) === positions.getY(i) &&
          Math.abs(Math.atan2(skyPositions.getX(j), -skyPositions.getZ(j)) - theta) < 0.0001
      );
      expect(match).toBeDefined();
      expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeLessThan(
        Math.hypot(skyPositions.getX(match!), skyPositions.getZ(match!))
      );
    }
    const referenceOffset = texture.offset.y;
    sky.setScenery({ style: "world-tree", height: 5 });
    expect(texture.offset.y).toBeGreaterThan(referenceOffset);
    expect(shader.uniforms.skySceneryHeight.value).toBeLessThan(mountainHeight);
    expect(tree.geometry).toBe(geometry);
    sky.setScenery({ style: "world-tree", height: 40 });
    expect(texture.offset.y).toBeLessThan(referenceOffset);
    expect(shader.uniforms.skySceneryHeight.value).toBeGreaterThan(mountainHeight);
    expect(material.map).toBe(texture);
    expect(tree.geometry).toBe(geometry);
    expect(load).toHaveBeenCalledOnce();
    sky.setScenery({ style: "countryside", height: 20 });
    expect(shader.uniforms.skySceneryHeight.value).toBe(0);
    expect(tree.visible).toBe(false);
  } finally {
    sky.dispose();
    finishLoading();
    load.mockRestore();
  }
  expect(ready).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
});

it("shares a seamless landscape texture and keeps its lowland height fixed when the mountains resize", () => {
  const sky = createSkyBackdrop();
  sky.fit(createDocument("scenery-height", 160), () => 0);
  try {
    sky.setScenery({ style: "mountains", height: 20 });
    const scenery = sky.group.getObjectByName("ce-scenery") as THREE.Mesh;
    const material = scenery.material as THREE.MeshBasicMaterial;
    const texture = material.map!;
    const image = texture.image as { data: Uint8Array; width: number; height: number };
    for (let y = 0; y < image.height; y++) {
      const first = y * image.width * 4,
        last = first + (image.width - 1) * 4;
      expect([...image.data.slice(first, first + 4)]).toEqual([...image.data.slice(last, last + 4)]);
    }
    const plainTop = () => {
      const positions = scenery.geometry.getAttribute("position"),
        uv = scenery.geometry.getAttribute("uv");
      const index = Array.from({ length: uv.count }, (_, i) => i).find(i => Math.abs(uv.getY(i) - 0.48) < 0.0001)!;
      return positions.getY(index);
    };
    expect(plainTop()).toBeGreaterThan(6);
    expect(plainTop()).toBeLessThan(15);
    const initialTop = plainTop();
    for (const height of [5, 40]) {
      sky.setScenery({ style: "mountains", height });
      expect(material.map).toBe(texture);
      expect(plainTop()).toBe(initialTop);
    }
    const dispose = vi.spyOn(texture, "dispose");
    sky.setScenery({ style: "countryside", height: 20 });
    expect(dispose).toHaveBeenCalledOnce();
    expect(material.map).not.toBe(texture);
    expect(plainTop()).toBe(initialTop);
    sky.setScenery({ style: "none", height: 20 });
    expect(scenery.visible).toBe(false);
    expect(material.map).toBeNull();
  } finally {
    sky.dispose();
  }
});

it("touches the rectangular ground without gaps and has no seams where the former walls met", () => {
  const sky = createSkyBackdrop();
  sky.fit(createDocument("sky-panorama", 160), () => 0);
  try {
    const panorama = sky.group.getObjectByName("ce-sky-panorama") as THREE.Mesh;
    const geometry = panorama.geometry,
      positions = geometry.getAttribute("position");
    const rings = new Map<number, number[]>();
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      rings.set(y, [...(rings.get(y) ?? []), i]);
      if (y === 0) expect(Math.max(Math.abs(positions.getX(i)), Math.abs(positions.getZ(i)))).toBeCloseTo(80);
    }
    for (const indices of rings.values()) {
      const first = new THREE.Vector3().fromBufferAttribute(positions, indices[0]);
      const last = new THREE.Vector3().fromBufferAttribute(positions, indices.at(-1)!);
      expect(first.distanceTo(last)).toBeLessThan(0.0001);
    }
    const camera = new THREE.PerspectiveCamera();
    for (const [x, z] of [
      [0, 100],
      [100, 100],
      [-100, -100],
      [100, 0]
    ]) {
      camera.position.set(x, 30, z);
      camera.lookAt(0, 0, 0);
      sky.update(camera, { ...DEFAULT_SUN });
      expect(panorama.geometry).toBe(geometry);
    }
    for (const mesh of sky.group.children as THREE.Mesh[]) {
      expect(mesh.userData.ceSky).toBe(true);
      expect(mesh.castShadow || mesh.receiveShadow).toBe(false);
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
    expect(material.depthWrite).toBe(false);
    expect(sky.group.children[0].renderOrder).toBeLessThan(-2);
    sky.update(camera, { ...DEFAULT_SUN, enabled: false, color: "#ff6040" });
    expect(sky.zenith).toEqual(daylight);
  } finally {
    sky.dispose();
  }
});
