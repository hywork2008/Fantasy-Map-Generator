import * as THREE from "three";
import { ROCK_SLOPE } from "../../city-editor/generators/terrainField/constants";
import type { ForestPlan } from "../../city-editor/types/contracts/forest";
import type { CityDocument, Point } from "../../city-editor/types/document";

/** A bounded, plan-space ground-cover mask shared by every terrain chunk. No extra surface geometry. */
export function createForestGroundTexture(document: CityDocument, plan: ForestPlan): THREE.DataTexture {
  const extent = document.frame.extentMeters;
  const size = Math.min(1024, Math.max(128, 2 ** Math.ceil(Math.log2(extent / 2))));
  const data = new Uint8Array(size * size * 4);
  const color = new THREE.Color(document.forestSettings?.density === "sparse" ? "#85966a" : "#60734b");
  const pixel = (point: Point): Point => [(point[0] / extent + 0.5) * size, (point[1] / extent + 0.5) * size];
  for (const region of plan.regions) {
    const rings = [region.outer, ...region.holes].map(ring => ring.map(pixel));
    const firstRow = Math.max(0, Math.ceil((region.bounds[1] / extent + 0.5) * size - 0.5));
    const lastRow = Math.min(size - 1, Math.floor((region.bounds[3] / extent + 0.5) * size - 0.5));
    for (let row = firstRow; row <= lastRow; row++) {
      const y = row + 0.5;
      const crossings: number[] = [];
      for (const ring of rings)
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
            crossings.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2)
        for (
          let column = Math.max(0, Math.ceil(crossings[i] - 0.5));
          column < Math.min(size, Math.ceil(crossings[i + 1] - 0.5));
          column++
        ) {
          const offset = (row * size + column) * 4;
          const hash = Math.imul(column + 1, 73856093) ^ Math.imul(row + 1, 19349663);
          const shade = 0.92 + (((hash >>> 0) % 1024) / 1024) * 0.16;
          data[offset] = Math.round(color.r * shade * 255);
          data[offset + 1] = Math.round(color.g * shade * 255);
          data[offset + 2] = Math.round(color.b * shade * 255);
          data[offset + 3] = 255;
        }
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "ce-forest-ground";
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Blend the cover into the terrain's existing Lambert material, before lighting and shadows. */
export function applyForestGroundTexture(
  material: THREE.MeshLambertMaterial,
  texture: THREE.DataTexture,
  extent: number
): void {
  material.onBeforeCompile = shader => {
    shader.uniforms.ceForestGround = { value: texture };
    shader.uniforms.ceForestExtent = { value: extent };
    shader.uniforms.ceForestRockSlope = { value: new THREE.Vector2(ROCK_SLOPE * 0.9, ROCK_SLOPE * 1.1) };
    shader.vertexShader = `varying vec2 ceGroundPoint;\nvarying vec3 ceGroundPosition;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nceGroundPoint = vec2(position.x, -position.z);\nceGroundPosition = position;"
    );
    shader.fragmentShader =
      `uniform sampler2D ceForestGround;\nuniform float ceForestExtent;\nuniform vec2 ceForestRockSlope;\nvarying vec2 ceGroundPoint;\nvarying vec3 ceGroundPosition;\n${shader.fragmentShader}`.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\nvec4 ceCover = texture2D(ceForestGround, ceGroundPoint / ceForestExtent + 0.5);\n// Use the geometric surface normal, so smoothed vertex normals cannot green a cliff.\nvec3 ceSurfaceNormal = normalize(cross(dFdx(ceGroundPosition), dFdy(ceGroundPosition)));\nfloat ceSlope = length(ceSurfaceNormal.xz) / max(abs(ceSurfaceNormal.y), 0.0001);\nceCover.a *= 1.0 - smoothstep(ceForestRockSlope.x, ceForestRockSlope.y, ceSlope);\ndiffuseColor.rgb = mix(diffuseColor.rgb, ceCover.rgb, ceCover.a);"
      );
  };
  material.customProgramCacheKey = () => "ce-forest-ground-v2";
}
