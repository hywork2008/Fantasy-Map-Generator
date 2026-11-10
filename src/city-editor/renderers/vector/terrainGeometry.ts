import * as THREE from "three";
import type { Point } from "../../types/primitives";
/** Subdivide only derived triangles. Analytical paths and saved footprint boundaries never move. */
export function projectTerrainGeometry(
  source: THREE.BufferGeometry,
  heightAt: (p: Point) => number,
  spacing = 8
): THREE.BufferGeometry {
  const original = source.index ? source.toNonIndexed() : source,
    attribute = original.getAttribute("position"),
    out: number[] = [];
  type Vertex = [number, number, number];
  const split = (a: Vertex, b: Vertex, c: Vertex, depth: number) => {
    if (out.length > 1800000) throw Error("terrain-render-budget");
    const length = (p: Vertex, q: Vertex) => Math.hypot(p[0] - q[0], p[2] - q[2]);
    const edges = [length(a, b), length(b, c), length(c, a)],
      longest = Math.max(...edges);
    if (longest <= spacing || depth >= 12) {
      for (const v of [a, b, c]) out.push(v[0], v[1] + heightAt([v[0], -v[2]]), v[2]);
      return;
    }
    const i = edges.indexOf(longest),
      u = [a, b, c][i],
      v = [b, c, a][i],
      w = [c, a, b][i],
      mid: Vertex = [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    split(u, mid, w, depth + 1);
    split(mid, v, w, depth + 1);
  };
  try {
    for (let i = 0; i < attribute.count; i += 3) {
      const v = (j: number): Vertex => [attribute.getX(j), attribute.getY(j), attribute.getZ(j)];
      split(v(i), v(i + 1), v(i + 2), 0);
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    result.computeVertexNormals();
    return result;
  } finally {
    if (original !== source) original.dispose();
  }
}
