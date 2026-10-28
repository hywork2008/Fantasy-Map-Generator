import * as THREE from "three";
import type { CityDocument } from "../types/document";
import type { ScenerySettings } from "./sceneryControls";
import { createSceneryTexture, type SceneryStyle } from "./sceneryTexture";
import {
  clipSkyPanorama,
  SCENERY_PLAIN_HEIGHT,
  type SkyPanoramaFrame,
  skyPanoramaGeometry
} from "./skyPanoramaGeometry";
import type { SunSettings } from "./sunLighting";
import { createWorldTreeTexture } from "./worldTreeTexture";

/** One continuous panorama, touching the map perimeter below and curving around the sky above. */
export function createSkyBackdrop(onTextureReady?: () => void) {
  const group = new THREE.Group();
  group.name = "ce-sky";
  const forward = new THREE.Vector2(0, -1);
  const mountainOcclusion = { texture: { value: null as THREE.Texture | null }, height: { value: 0 } };
  let frame: SkyPanoramaFrame = { halfWidth: 300, halfDepth: 300, height: 1200 };
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    fog: false,
    depthWrite: false
  });
  const sceneryMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const treeMaterial = sceneryMaterial.clone();
  treeMaterial.opacity = 0.14;
  treeMaterial.visible = false;
  clipSkyPanorama(material, forward);
  clipSkyPanorama(sceneryMaterial, forward);
  clipSkyPanorama(treeMaterial, forward, mountainOcclusion);
  const mesh = (name: string, meshMaterial: THREE.MeshBasicMaterial, order = 0) => {
    const result = new THREE.Mesh(new THREE.BufferGeometry(), meshMaterial);
    result.name = name;
    result.userData.ceSky = true;
    result.raycast = () => {};
    result.renderOrder = order;
    group.add(result);
    return result;
  };
  // Background color must never occlude the landscape or tree through depth quantization.
  const sky = mesh("ce-sky-panorama", material, -100);
  const scenery = mesh("ce-scenery", sceneryMaterial, -1);
  const worldTree = mesh("ce-world-tree", treeMaterial, -2);
  scenery.visible = worldTree.visible = false;
  const zenith = new THREE.Color();
  const horizon = new THREE.Color();
  const lightColor = new THREE.Color();
  const direction = new THREE.Vector3();
  let previousColor = "";
  let previousStyle: SceneryStyle = "none";
  let previousHeight = NaN;
  let disposed = false;
  const treeTextureTop = 0.9;
  const replaceGeometry = (target: THREE.Mesh, geometry: THREE.BufferGeometry) => {
    target.geometry.dispose();
    target.geometry = geometry;
  };
  const colorSky = () => {
    const positions = sky.geometry.getAttribute("position");
    if (!positions) return;
    const colors = new Float32Array(positions.count * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      tint.copy(horizon).lerp(zenith, positions.getY(i) / frame.height);
      colors.set([tint.r, tint.g, tint.b], i * 3);
    }
    sky.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  };
  const fitTree = () => {
    const image = treeMaterial.map?.image as { width?: number; height?: number } | undefined;
    const aspect = image?.width && image?.height ? image.width / image.height : 2 / 3;
    // Restore the full root height; the landscape mask hides only overlapping portions.
    const bottom = 0,
      top = treeTextureTop;
    const imageWidth = (frame.height / (top - bottom)) * aspect;
    const radius = Math.hypot(frame.halfWidth, frame.halfDepth) * 1.02;
    const angle = Math.min(Math.PI * 1.8, imageWidth / radius);
    replaceGeometry(
      worldTree,
      skyPanoramaGeometry(
        frame,
        frame.height,
        y => bottom + (y / frame.height) * (top - bottom),
        -angle / 2,
        angle,
        frame.height * 0.0001
      )
    );
  };
  return {
    group,
    horizon,
    zenith,
    setScenery(settings: ScenerySettings) {
      worldTree.visible = settings.style === "world-tree";
      if (worldTree.visible && !treeMaterial.map) {
        treeMaterial.map = createWorldTreeTexture(() => {
          if (disposed) return;
          fitTree();
          treeMaterial.visible = true;
          onTextureReady?.();
        });
        treeMaterial.needsUpdate = true;
      }
      const styleChanged = settings.style !== previousStyle;
      if (styleChanged) {
        sceneryMaterial.map?.dispose();
        const texture = settings.style === "none" ? null : createSceneryTexture(settings.style);
        if (texture) {
          texture.wrapS = THREE.RepeatWrapping;
          texture.repeat.x = 4;
        }
        sceneryMaterial.map = texture;
        mountainOcclusion.texture.value = texture;
        sceneryMaterial.needsUpdate = true;
        previousStyle = settings.style;
      }
      if (!styleChanged && settings.height === previousHeight) return;
      previousHeight = settings.height;
      const plainHeight = SCENERY_PLAIN_HEIGHT;
      const totalHeight =
        settings.style === "mountains" || settings.style === "world-tree"
          ? Math.max(plainHeight + 1, (frame.height * settings.height) / 200)
          : plainHeight / 0.48;
      mountainOcclusion.height.value =
        settings.style === "mountains" || settings.style === "world-tree" ? totalHeight : 0;
      if (treeMaterial.map) {
        // Keep the 20% composition as the reference and follow the mountain band
        // vertically, so reducing its height cannot leave the roots suspended.
        const referenceHeight = Math.max(plainHeight + 1, frame.height / 10);
        const altitude = (totalHeight - referenceHeight) * 0.8;
        treeMaterial.map.offset.y = (-altitude / frame.height) * treeTextureTop;
      }
      replaceGeometry(
        scenery,
        skyPanoramaGeometry(
          frame,
          totalHeight,
          y =>
            y <= plainHeight
              ? (y / plainHeight) * 0.48
              : 0.48 + ((y - plainHeight) / (totalHeight - plainHeight)) * 0.52,
          -Math.PI,
          Math.PI * 2,
          frame.height * 0.00005
        )
      );
      scenery.visible = settings.style !== "none";
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
      frame = {
        halfWidth: Math.max(1, size.x / 2),
        halfDepth: Math.max(1, size.z / 2),
        height: Math.max(30, size.x, size.z) * 2
      };
      group.position.set(center.x, bounds.min.y, center.z);
      replaceGeometry(sky, skyPanoramaGeometry(frame));
      colorSky();
      fitTree();
      previousHeight = NaN;
    },
    update(camera: THREE.Camera, settings: SunSettings) {
      camera.getWorldDirection(direction);
      if (Math.hypot(direction.x, direction.z) > 0.00001) forward.set(direction.x, direction.z).normalize();
      const color = settings.enabled ? settings.color : "#ffffff";
      if (color === previousColor) return;
      previousColor = color;
      lightColor.set(color);
      const warmth = THREE.MathUtils.clamp((lightColor.r - lightColor.b) / 0.8, 0, 1);
      zenith.set(0x87bced).lerp(new THREE.Color(0xc77887), warmth);
      horizon.set(0xd9ecf6).lerp(new THREE.Color(0xffd1ab), warmth);
      sceneryMaterial.color.set(0xffffff).lerp(new THREE.Color(0xffb18a), warmth * 0.3);
      treeMaterial.color.copy(sceneryMaterial.color);
      colorSky();
    },
    dispose() {
      disposed = true;
      for (const object of [sky, scenery, worldTree]) object.geometry.dispose();
      for (const meshMaterial of [material, sceneryMaterial, treeMaterial]) {
        meshMaterial.map?.dispose();
        meshMaterial.dispose();
      }
      group.removeFromParent();
    }
  };
}
