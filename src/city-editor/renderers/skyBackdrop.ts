import * as THREE from "three";
import type { CityDocument } from "../types/document";
import type { ScenerySettings } from "./sceneryControls";
import { createSceneryTexture, type SceneryStyle } from "./sceneryTexture";
import type { SunSettings } from "./sunLighting";

/** Only the far walls of the map's open sky box are drawn; the near side stays open. */
export function createSkyBackdrop() {
  const group = new THREE.Group();
  group.name = "ce-sky";
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const sceneryMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  // Separate the lowland and mountain texture ranges so only mountains stretch.
  const sceneryGeometry = new THREE.PlaneGeometry(1, 1, 1, 2);
  const sceneryUv = sceneryGeometry.getAttribute("uv");
  sceneryUv.setY(2, 0.48);
  sceneryUv.setY(3, 0.48);
  const sceneryPlanes: THREE.Mesh[] = [];
  const walls = ["west", "east", "north", "south"].map(side => {
    const wall = new THREE.Mesh(geometry, material);
    wall.name = `ce-sky-${side}`;
    wall.userData.ceSky = true;
    wall.raycast = () => {};
    const scenery = new THREE.Mesh(sceneryGeometry, sceneryMaterial);
    scenery.name = `ce-scenery-${side}`;
    scenery.userData.ceSky = true;
    scenery.raycast = () => {};
    scenery.visible = false;
    // Draw the backdrop before transparent water, foliage and other city details.
    scenery.renderOrder = -1;
    sceneryPlanes.push(scenery);
    wall.add(scenery);
    group.add(wall);
    return wall;
  });
  const zenith = new THREE.Color();
  const horizon = new THREE.Color();
  const lightColor = new THREE.Color();
  const direction = new THREE.Vector3();
  let previousColor = "";
  let previousStyle: SceneryStyle = "none";
  let previousHeight = NaN;
  let previousWallHeight = NaN;
  return {
    group,
    horizon,
    zenith,
    setScenery(settings: ScenerySettings) {
      const styleChanged = settings.style !== previousStyle;
      if (styleChanged) {
        sceneryMaterial.map?.dispose();
        sceneryMaterial.map = settings.style === "none" ? null : createSceneryTexture(settings.style);
        sceneryMaterial.needsUpdate = true;
        previousStyle = settings.style;
      }
      const wallHeight = walls[0].scale.y;
      if (!styleChanged && settings.height === previousHeight && wallHeight === previousWallHeight) return;
      previousHeight = settings.height;
      previousWallHeight = wallHeight;
      // About one forest tree above the map edge, independent of the wallpaper slider.
      const plainHeight = 12;
      const totalHeight =
        settings.style === "mountains"
          ? Math.max(plainHeight + 1, (wallHeight * settings.height) / 200)
          : plainHeight / 0.48;
      const positions = sceneryGeometry.getAttribute("position");
      positions.setY(2, plainHeight / totalHeight - 0.5);
      positions.setY(3, plainHeight / totalHeight - 0.5);
      positions.needsUpdate = true;
      const fraction = totalHeight / wallHeight;
      for (const scenery of sceneryPlanes) {
        scenery.visible = settings.style !== "none";
        scenery.scale.set(1, fraction, 1);
        scenery.position.y = -0.5 + fraction / 2;
      }
    },
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
      sceneryMaterial.color.set(0xffffff).lerp(new THREE.Color(0xffb18a), warmth * 0.3);
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
      sceneryMaterial.map?.dispose();
      sceneryMaterial.dispose();
      sceneryGeometry.dispose();
      group.removeFromParent();
    }
  };
}
