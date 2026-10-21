import * as THREE from "three";
import type { Point } from "../../city-editor/types/document";
import { planVertex } from "../core/planFrame";

/** Ground surfaces follow relief with a bounded triangle spacing instead of bridging entire lawns. */
export function groundSurfaceGeometry(
  surface: { ring: Point[]; holes?: Point[][]; offset: number },
  heightAt: (p: Point) => number,
  spacing = 8
): THREE.BufferGeometry {
  const shape = new THREE.Shape(surface.ring.map(p => new THREE.Vector2(...p)));
  shape.holes = (surface.holes ?? []).map(hole => new THREE.Path(hole.map(p => new THREE.Vector2(...p))));
  const { shape: ring, holes } = shape.extractPoints(12);
  const points = [...ring, ...holes.flat()];
  const positions: number[] = [];
  const addTriangle = (a: Point, b: Point, c: Point, depth = 0) => {
    const ab = Math.hypot(a[0] - b[0], a[1] - b[1]),
      bc = Math.hypot(b[0] - c[0], b[1] - c[1]),
      ca = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (Math.max(ab, bc, ca) > spacing && depth < 12) {
      const mid = (p: Point, q: Point): Point => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      if (ab >= bc && ab >= ca) {
        const m = mid(a, b);
        addTriangle(a, m, c, depth + 1);
        addTriangle(m, b, c, depth + 1);
      } else if (bc >= ca) {
        const m = mid(b, c);
        addTriangle(a, b, m, depth + 1);
        addTriangle(a, m, c, depth + 1);
      } else {
        const m = mid(c, a);
        addTriangle(a, b, m, depth + 1);
        addTriangle(m, b, c, depth + 1);
      }
      return;
    }
    for (const p of [a, b, c]) positions.push(...planVertex(p, heightAt(p) + surface.offset));
  };
  for (const tri of THREE.ShapeUtils.triangulateShape(ring, holes)) {
    const [a, b, c] = tri.map(i => points[i].toArray() as Point);
    addTriangle(a, b, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
