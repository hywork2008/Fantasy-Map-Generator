import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { triangularInfillParts } from "../../city-editor/generators/lotGeometry";
import { bounds, intersectConvex, PlotIndex, subtractConvex } from "../../city-editor/generators/parcelGeometry";
import type { CityTerrain } from "../../city-editor/generators/terrainElevation";
import { dryRuns } from "../../city-editor/generators/waterGeometry";
import type { FarmPlot } from "../../city-editor/types/contracts/ruralFields";
import type { Point } from "../../city-editor/types/primitives";
import type { TerrainPatch } from "../../city-editor/types/terrain";
import { planVertex } from "../core/planFrame";
import { groundSurfaceGeometry } from "./groundSurfaceGeometry";

export interface TownFarmMeshes {
  parent: THREE.Group;
  dispose(): void;
}

const WHEAT_HEIGHT = 0.85;

/** Shade a continuous crop canopy without stalk meshes, textures or extra draw calls. */
function fieldMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute vec3 crop;
varying vec3 vCrop;
varying vec2 vFieldPosition;
${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vCrop = crop;
      vFieldPosition = vec2(position.x, -position.z);`
    );
    shader.fragmentShader = `varying vec3 vCrop;
varying vec2 vFieldPosition;
${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      if (vCrop.x > 0.5) {
        float across = dot(vFieldPosition, vCrop.yz);
        float along = dot(vFieldPosition, vec2(-vCrop.z, vCrop.y));
        // Derivative filtering fades fine detail before it can shimmer at distance.
        float rowPhase = across * 5.0;
        float rows = cos(rowPhase) * (1.0 - smoothstep(0.4, 2.0, fwidth(rowPhase)));
        float grainPhase = along * 31.0 + sin(across * 43.0) * 2.0;
        float grain = sin(grainPhase) * (1.0 - smoothstep(0.4, 2.0, fwidth(grainPhase)));
        float patches = sin(across * 0.37 + sin(along * 0.23)) * sin(along * 0.41);
        diffuseColor.rgb *= 0.93 + 0.09 * rows + 0.055 * grain + 0.06 * patches;
      }`
    );
  };
  material.customProgramCacheKey = () => "ce-field-canopy-v1";
  return material;
}

/** Reuse the saved field footprints and working rows. Two batches keep large
 * rural layouts cheap to draw; neither batch participates in building picking. */
export function createTownFarms(
  farms: readonly FarmPlot[],
  terrain?: Pick<CityTerrain, "heightAt" | "relief"> & Partial<Pick<CityTerrain, "triangles" | "field">>,
  wetPolygons: readonly Point[][] = [],
  simplify = true
): TownFarmMeshes {
  const parent = new THREE.Group();
  parent.name = "ce-farmland";
  const heightAt = terrain?.heightAt ?? (() => 0);
  // Cell banks have explicit creases that uniform sampling can bridge below the ground.
  const patches = new PlotIndex<TerrainPatch>();
  if (terrain?.relief && !terrain.field)
    for (const patch of terrain.triangles ?? []) patches.add(patch, bounds(patch.points));
  const surfaceGeometry = (polygon: Point[], offset: number): THREE.BufferGeometry => {
    const candidates = patches.query(bounds(polygon));
    if (!candidates.length)
      return groundSurfaceGeometry(
        { ring: polygon, offset },
        heightAt,
        terrain?.relief ? (simplify ? 8 : 1) : Infinity
      );
    const positions: number[] = [];
    for (const part of triangularInfillParts(polygon))
      for (const patch of candidates) {
        const clipped = intersectConvex(part, patch.points);
        const [a, b, c] = patch.points;
        const cross = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        const area = cross(a, b, c);
        if (Math.abs(area) < 1e-10) continue;
        for (let i = 1; i < clipped.length - 1; i++)
          for (const point of [clipped[0], clipped[i], clipped[i + 1]]) {
            const u = cross(point, b, c) / area;
            const v = cross(a, point, c) / area;
            const height = u * patch.heights[0] + v * patch.heights[1] + (1 - u - v) * patch.heights[2];
            positions.push(...planVertex(point, height + offset));
          }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  };
  const wetParts = new PlotIndex<Point[]>(),
    wetRings = new PlotIndex<Point[]>();
  for (const polygon of wetPolygons) {
    wetRings.add(polygon, bounds(polygon));
    for (const triangle of triangularInfillParts(polygon)) wetParts.add(triangle, bounds(triangle));
  }
  const dryPolygons = (polygon: Point[]): Point[][] => {
    const water = wetParts.query(bounds(polygon));
    if (!water.length) return [polygon];
    let pieces = triangularInfillParts(polygon);
    for (const part of water) pieces = pieces.flatMap(piece => subtractConvex(piece, part, 0.000001));
    return pieces;
  };
  const surfaces: THREE.BufferGeometry[] = [];
  const lines: number[] = [],
    lineColors: number[] = [];
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  const addDryLine = (line: Point[], color: THREE.Color, offset: number) => {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i];
      const steps = terrain?.relief
        ? Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (simplify ? 8 : 1)))
        : 1;
      const cuts = Array.from({ length: steps + 1 }, (_, n) => n / steps);
      for (const patch of patches.query(bounds([a, b])))
        for (let edge = 0; edge < 3; edge++) {
          const c = patch.points[edge],
            d = patch.points[(edge + 1) % 3];
          const dx = b[0] - a[0],
            dy = b[1] - a[1];
          const ex = d[0] - c[0],
            ey = d[1] - c[1];
          const denominator = dx * ey - dy * ex;
          if (Math.abs(denominator) < 1e-10) continue;
          const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / denominator;
          const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / denominator;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
        }
      const sorted = [...new Set(cuts)].sort((a, b) => a - b);
      for (let n = 1; n < sorted.length; n++)
        for (const t of [sorted[n - 1], sorted[n]]) {
          const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          lines.push(...planVertex(p, heightAt(p) + offset));
          lineColors.push(color.r, color.g, color.b);
        }
    }
  };
  const addLine = (line: Point[], color: THREE.Color, offset = 0.07) => {
    if (line.length < 2) return;
    const water = wetRings.query(bounds(line));
    for (const run of water.length ? dryRuns(line, water) : [line]) addDryLine(run, color, offset);
  };
  farms.forEach((farm, index) => {
    if (farm.polygon.length < 3) return;
    const garden = farm.kind === "kitchen-garden" || farm.system === "market-garden";
    const wheat =
      !garden && farm.cropState !== "fallow" && farm.cropState !== "spring-crop" && farm.cropState !== "horticulture";
    const angle =
      farm.orientationRadians ??
      (() => {
        const row = farm.rows.find(row => row.length >= 2);
        return row ? Math.atan2(row[1][1] - row[0][1], row[1][0] - row[0][0]) : 0;
      })();
    const tone = Math.abs(Math.round(farm.polygon[0][0] / 17) + Math.round(farm.polygon[0][1] / 13) + index) % 2;
    const color = new THREE.Color(
      garden
        ? tone
          ? "#bccd9c"
          : "#aec392"
        : farm.cropState === "fallow"
          ? "#b8bd98"
          : farm.cropState === "spring-crop"
            ? "#c5ce9d"
            : wheat
              ? tone
                ? "#e4b847"
                : "#d5a437"
              : "#aec392"
    );
    // Punch actual openings in the soil; water remains below the terrain.
    for (const polygon of dryPolygons(farm.polygon)) {
      const geometry = surfaceGeometry(polygon, wheat ? WHEAT_HEIGHT : 0.035);
      if (wheat) {
        // Close the canopy down to the soil, including the clipped river banks.
        const positions = Array.from(geometry.getAttribute("position").array);
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i],
            b = polygon[(i + 1) % polygon.length];
          const steps = terrain?.relief
            ? Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (simplify ? 8 : 1)))
            : 1;
          const at = (n: number): Point => [a[0] + ((b[0] - a[0]) * n) / steps, a[1] + ((b[1] - a[1]) * n) / steps];
          for (let n = 0; n < steps; n++) {
            const p = at(n),
              q = at(n + 1);
            const bottomA = planVertex(p, heightAt(p) + 0.035),
              topA = planVertex(p, heightAt(p) + WHEAT_HEIGHT);
            const bottomB = planVertex(q, heightAt(q) + 0.035),
              topB = planVertex(q, heightAt(q) + WHEAT_HEIGHT);
            positions.push(...bottomA, ...topA, ...topB, ...bottomA, ...topB, ...bottomB);
          }
        }
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
      }
      const crop = new Float32Array(geometry.getAttribute("position").count * 3);
      for (let i = 0; i < crop.length; i += 3) crop.set([wheat ? 1 : 0, -Math.sin(angle), Math.cos(angle)], i);
      geometry.setAttribute("crop", new THREE.BufferAttribute(crop, 3));
      const colors = new Float32Array(geometry.getAttribute("position").count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      surfaces.push(geometry);
    }
    const rowColor = new THREE.Color(garden ? "#52653b" : "#78704e");
    if ((!wheat || !simplify) && farm.cropState !== "fallow")
      for (const row of farm.rows) addLine(row, rowColor, wheat ? WHEAT_HEIGHT + 0.025 : 0.07);
    const boundaryColor = new THREE.Color(farm.boundaryKind === "hedge" ? "#405a35" : "#706955");
    const boundaries = farm.boundaries ?? (farm.clippedByFrame ? [] : [[...farm.polygon, farm.polygon[0]]]);
    for (const boundary of boundaries) addLine(boundary, boundaryColor);
  });
  if (surfaces.length) {
    const geometry = mergeGeometries(surfaces)!;
    for (const part of surfaces) part.dispose();
    // A negative depth bias on the soil would hide the furrows above it.
    const material = fieldMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "ce-field-surfaces";
    mesh.raycast = () => {};
    parent.add(mesh);
    geometries.push(geometry);
    materials.push(material);
  }
  if (lines.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(lineColors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    const rows = new THREE.LineSegments(geometry, material);
    rows.name = "ce-field-rows-and-boundaries";
    rows.renderOrder = 1;
    rows.raycast = () => {};
    parent.add(rows);
    geometries.push(geometry);
    materials.push(material);
  }
  return {
    parent,
    dispose() {
      parent.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}
