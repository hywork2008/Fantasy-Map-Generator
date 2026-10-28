import * as THREE from "three";
import type { CityDocument } from "../types/document";
import type { SunSettings } from "./sunLighting";

/** Only the far walls of the map's open sky box are drawn; the near side stays open. */
export function createSkyBackdrop() {
  const group = new THREE.Group();
  group.name = "ce-sky";
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const walls = ["west", "east", "north", "south"].map(side => {
    const wall = new THREE.Mesh(geometry, material);
    wall.name = `ce-sky-${side}`;
    wall.raycast = () => {};
    group.add(wall);
    return wall;
  });
  const zenith = new THREE.Color();
  const horizon = new THREE.Color();
  const lightColor = new THREE.Color();
  const direction = new THREE.Vector3();
  let previousColor = "";
  return {
    group,
    horizon,
    zenith,
    fit(city: CityDocument, heightAt: (point: [number, number]) => number) {
      const bounds = new THREE.Box3();
      for (const vertex of Object.values(city.mesh.vertices)) {
        const [x, y] = vertex.point;
        bounds.expandByPoint(new THREE.Vector3(x, Math.min(-2, heightAt([x, y]) - 2), -y));
      }
      if (bounds.isEmpty()) {
        const half = city.frame.extentMeters / 2;
        bounds.set(new THREE.Vector3(-half, -2, -half), new THREE.Vector3(half, 0, half));
      }
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const height = Math.max(600, size.x, size.z) * 2;
      walls.forEach((wall, i) => {
        wall.position.set(
          i < 2 ? (i === 0 ? bounds.min.x : bounds.max.x) : center.x,
          bounds.min.y + height / 2,
          i >= 2 ? (i === 2 ? bounds.min.z : bounds.max.z) : center.z
        );
        wall.rotation.y = i < 2 ? Math.PI / 2 : 0;
        wall.scale.set(i < 2 ? size.z : size.x, height, 1);
      });
    },
    update(camera: THREE.Camera, settings: SunSettings) {
      camera.getWorldDirection(direction);
      walls[0].visible = direction.x < -0.0001;
      walls[1].visible = direction.x > 0.0001;
      walls[2].visible = direction.z < -0.0001;
      walls[3].visible = direction.z > 0.0001;
      const color = settings.enabled ? settings.color : "#ffffff";
      if (color === previousColor) return;
      previousColor = color;
      lightColor.set(color);
      const warmth = THREE.MathUtils.clamp((lightColor.r - lightColor.b) / 0.8, 0, 1);
      zenith.set(0x87bced).lerp(new THREE.Color(0xc77887), warmth);
      horizon.set(0xd9ecf6).lerp(new THREE.Color(0xffd1ab), warmth);
      const colors = geometry.getAttribute("color");
      const positions = geometry.getAttribute("position");
      for (let i = 0; i < colors.count; i++) {
        const tint = positions.getY(i) > 0 ? zenith : horizon;
        colors.setXYZ(i, tint.r, tint.g, tint.b);
      }
      colors.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      group.removeFromParent();
    }
  };
}
