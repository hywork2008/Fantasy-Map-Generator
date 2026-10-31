import * as THREE from "three";
import { convexInfillParts } from "../../city-editor/generators/lotGeometry";
import { bounds, intersectConvex, PlotIndex } from "../../city-editor/generators/parcelGeometry";
import type { RiverHydraulicProfile } from "../../city-editor/types/contracts/riverHydraulics";
import type { Point } from "../../city-editor/types/document";
import { LAND_Y } from "../core/waterGeometry";

/** Paired-bank sections keep the complete river width level, even at bends and on cross-slopes. */
export function createRiverHydraulicMesh(
  profiles: readonly RiverHydraulicProfile[],
  datumMeters: number,
  color: number,
  wetPolygons?: readonly Point[][]
): THREE.Mesh | null {
  if (!profiles.length) return null;
  let positions: number[] = [],
    velocities: number[] = [],
    depths: number[] = [],
    indices: number[] = [];
  for (const profile of profiles) {
    const start = positions.length / 3;
    for (const station of profile.stations) {
      const height = LAND_Y + station.surfaceMeters - datumMeters;
      positions.push(station.left[0], height, -station.left[1], station.right[0], height, -station.right[1]);
      velocities.push(station.velocityMps, station.velocityMps);
      depths.push(station.depthMeters, station.depthMeters);
    }
    for (let i = 1; i < profile.stations.length; i++) {
      const a = start + (i - 1) * 2,
        b = a + 2;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  if (!indices.length) return null;
  // Course direction can vary. Orient each triangle upward independently of that direction.
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map(index => index * 3);
    const up =
      (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a]) -
      (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]);
    if (up < 0) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  // Surveyed water footprints can be asymmetric. Clip the hydraulic strip without changing its water plane.
  if (wetPolygons) {
    const index = new PlotIndex<Point[]>();
    for (const polygon of wetPolygons) for (const part of convexInfillParts(polygon)) index.add(part, bounds(part));
    const clippedPositions: number[] = [],
      clippedVelocities: number[] = [],
      clippedDepths: number[] = [];
    const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    for (let i = 0; i < indices.length; i += 3) {
      const ids = indices.slice(i, i + 3);
      const points: Point[] = ids.map(id => [positions[id * 3], -positions[id * 3 + 2]]);
      const area = cross(points[0], points[1], points[2]);
      if (Math.abs(area) < 1e-9) continue;
      for (const cut of index.query(bounds(points))) {
        const polygon = intersectConvex(points, cut);
        for (let k = 1; k + 1 < polygon.length; k++)
          for (const point of [polygon[0], polygon[k], polygon[k + 1]]) {
            const weights = [
              cross(point, points[1], points[2]),
              cross(points[0], point, points[2]),
              cross(points[0], points[1], point)
            ].map(value => value / area);
            clippedPositions.push(
              point[0],
              ids.reduce((sum, id, j) => sum + weights[j] * positions[id * 3 + 1], 0),
              -point[1]
            );
            clippedVelocities.push(ids.reduce((sum, id, j) => sum + weights[j] * velocities[id], 0));
            clippedDepths.push(ids.reduce((sum, id, j) => sum + weights[j] * depths[id], 0));
          }
      }
    }
    positions = clippedPositions;
    velocities = clippedVelocities;
    depths = clippedDepths;
    indices = Array.from({ length: positions.length / 3 }, (_, i) => i);
    if (!indices.length) return null;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("flowVelocity", new THREE.Float32BufferAttribute(velocities, 1));
  geometry.setAttribute("flowDepth", new THREE.Float32BufferAttribute(depths, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, side: THREE.FrontSide }));
  mesh.name = "ce-water-river";
  mesh.userData.hydraulics = profiles.map(profile => ({
    sourceId: profile.sourceId,
    dischargeM3s: profile.dischargeM3s,
    stations: profile.stations.length
  }));
  mesh.raycast = () => {};
  return mesh;
}
