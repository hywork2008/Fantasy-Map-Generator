import * as THREE from "three";

export interface SkyPanoramaFrame {
  halfWidth: number;
  halfDepth: number;
  height: number;
}

export const SCENERY_PLAIN_HEIGHT = 12;

/** The bottom follows the rectangular map; the upper sky smoothly opens into a cylinder. */
export function skyPanoramaGeometry(
  frame: SkyPanoramaFrame,
  height = frame.height,
  textureY: (y: number) => number = y => y / frame.height,
  start = -Math.PI,
  angle = Math.PI * 2,
  inset = 0
): THREE.BufferGeometry {
  const transition = Math.max(SCENERY_PLAIN_HEIGHT + 1, frame.height / 4);
  const levels = [...new Set([0, SCENERY_PLAIN_HEIGHT, transition, height].filter(y => y <= height))].sort(
    (a, b) => a - b
  );
  const corner = Math.atan2(frame.halfWidth, frame.halfDepth);
  // All layers share the same angular grid so their curved facets never intersect.
  const angles = [start, start + angle];
  for (let i = 0; i <= 96; i++) {
    const theta = -Math.PI + (i * Math.PI * 2) / 96;
    if (theta > start + 1e-8 && theta < start + angle - 1e-8) angles.push(theta);
  }
  for (const theta of [-Math.PI + corner, -corner, corner, Math.PI - corner])
    if (theta > start && theta < start + angle) angles.push(theta);
  angles.sort((a, b) => a - b);
  for (let i = angles.length - 1; i > 0; i--) if (angles[i] - angles[i - 1] < 1e-8) angles.splice(i, 1);
  const radius = Math.hypot(frame.halfWidth, frame.halfDepth) * 1.02;
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (const y of levels) {
    const blend = THREE.MathUtils.clamp((y - SCENERY_PLAIN_HEIGHT) / (transition - SCENERY_PLAIN_HEIGHT), 0, 1);
    for (const theta of angles) {
      const sin = Math.sin(theta),
        cos = Math.cos(theta);
      const rectangularRadius = Math.min(
        frame.halfWidth / Math.max(1e-9, Math.abs(sin)),
        frame.halfDepth / Math.max(1e-9, Math.abs(cos))
      );
      const r = THREE.MathUtils.lerp(rectangularRadius, radius, blend) - inset;
      positions.push(sin * r, y, -cos * r);
      uv.push((theta - start) / angle, textureY(y));
    }
  }
  for (let row = 0; row < levels.length - 1; row++)
    for (let i = 0; i < angles.length - 1; i++) {
      const a = row * angles.length + i,
        b = a + angles.length;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.panoramaRadius = radius;
  geometry.userData.panoramaAngle = angle;
  return geometry;
}

export interface PanoramaOcclusion {
  texture: { value: THREE.Texture | null };
  height: { value: number };
}

/** Hide the camera-side half and optionally mask a distant landmark behind the landscape. */
export function clipSkyPanorama(
  material: THREE.MeshBasicMaterial,
  forward: THREE.Vector2,
  occlusion?: PanoramaOcclusion
) {
  material.onBeforeCompile = shader => {
    shader.uniforms.skyForward = { value: forward };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vSkyRadial;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSkyRadial = position.xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vSkyRadial;\nuniform vec2 skyForward;")
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif (dot(vSkyRadial, skyForward) < -0.001) discard;"
      );
    if (occlusion) {
      shader.uniforms.skySceneryMap = occlusion.texture;
      shader.uniforms.skySceneryHeight = occlusion.height;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vSkyHeight;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSkyHeight = position.y;");
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        "#include <common>\nvarying float vSkyHeight;\nuniform sampler2D skySceneryMap;\nuniform float skySceneryHeight;"
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
if (skySceneryHeight > 0.0 && vSkyHeight <= skySceneryHeight) {
  float plainHeight = ${SCENERY_PLAIN_HEIGHT.toFixed(1)};
  float sceneryV = vSkyHeight <= plainHeight
    ? vSkyHeight / plainHeight * 0.48
    : 0.48 + (vSkyHeight - plainHeight) / max(0.001, skySceneryHeight - plainHeight) * 0.52;
  float sceneryU = (atan(vSkyRadial.x, -vSkyRadial.y) + PI) / (2.0 * PI);
  float coverage = texture2D(skySceneryMap, vec2(sceneryU * 4.0, sceneryV)).a;
  diffuseColor.a *= 1.0 - smoothstep(0.0, 0.02, coverage);
}`
      );
    }
  };
  material.customProgramCacheKey = () => `ce-sky-panorama:${Boolean(occlusion)}`;
}
