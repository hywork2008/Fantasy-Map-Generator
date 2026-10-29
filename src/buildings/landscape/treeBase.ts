import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface TrunkRing {
  center: readonly [number, number, number];
  radius: number;
}

/** Continuous trunk rings meet exactly; only the buttress roots extend below ground (Y=0). */
export function createTreeBase(rings: readonly TrunkRing[], rootReach: number, rootCount: number, segments = 16) {
  const positions: number[] = [],
    indices: number[] = [];
  for (const {
    center: [x, y, z],
    radius
  } of rings) {
    for (let i = 0; i < segments; i++) {
      const angle = (i * Math.PI * 2) / segments;
      const r = radius * (1 + Math.sin(angle * 5 + y * 0.3) * 0.07);
      positions.push(x + Math.cos(angle) * r, y, z + Math.sin(angle) * r);
    }
  }
  for (let row = 0; row < rings.length - 1; row++) {
    for (let i = 0; i < segments; i++) {
      const a = row * segments + i,
        b = row * segments + ((i + 1) % segments);
      indices.push(a, a + segments, b, b, a + segments, b + segments);
    }
  }
  // Cap the trunk at ground level, never below its root system.
  for (let i = 1; i < segments - 1; i++) indices.push(0, i, i + 1);
  const last = (rings.length - 1) * segments;
  for (let i = 1; i < segments - 1; i++) indices.push(last, last + i + 1, last + i);
  const trunk = new THREE.BufferGeometry();
  trunk.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  trunk.setIndex(indices);
  const parts = [trunk];
  for (let i = 0; i < rootCount; i++) {
    const angle = i * 2.39996;
    const inner = rings[0].radius * 0.65;
    const width = rings[0].radius * 0.3;
    const points = [
      [inner, 0.35, -width],
      [inner, 0.35, width],
      [rootReach, -0.22, -0.025],
      [rootReach, -0.22, 0.025],
      [inner, -0.35, -width],
      [inner, -0.35, width]
    ];
    const root = new THREE.BufferGeometry();
    root.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        points.flatMap(([r, y, t]) => [
          Math.cos(angle) * r - Math.sin(angle) * t,
          y,
          Math.sin(angle) * r + Math.cos(angle) * t
        ]),
        3
      )
    );
    root.setIndex([0, 2, 1, 1, 2, 3, 0, 4, 2, 1, 3, 5, 4, 5, 2, 2, 5, 3, 0, 1, 4, 1, 5, 4]);
    parts.push(root);
  }
  const geometry = mergeGeometries(parts)!;
  geometry.computeVertexNormals();
  for (const part of parts) part.dispose();
  return geometry;
}
