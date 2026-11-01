import * as THREE from "three";
import { clipHalfPlane } from "../../../city-editor/generators/lotGeometry";
import { subtractConvex } from "../../../city-editor/generators/parcelGeometry";
import type { Point } from "../../../city-editor/types/document";
import type { Surface } from "../../medieval/modelKit";
import { notreDameChapelPlan } from "./chevetPlan";
import type { NotreDameKit } from "./details";

type Vertex = [number, number, number];
type Height = { x: number; z: number; base: number };
const ring = (radius: number, angle: number): Point => [42 + radius * Math.sin(angle), radius * Math.cos(angle)];
const mix = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const atHeight = (p: Point, h: Height) => h.base + h.x * p[0] + h.z * p[1];

function plane(points: Vertex[]): Height {
  const p = new THREE.Plane().setFromCoplanarPoints(
    ...(points.slice(0, 3).map(v => new THREE.Vector3(...v)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3])
  );
  return { x: -p.normal.x / p.normal.y, z: -p.normal.z / p.normal.y, base: -p.constant / p.normal.y };
}

/** Exterior study fitted to the existing two aisles; no surveyed interior reconstruction. */
export function addNotreDameAmbulatory(k: NotreDameKit) {
  const chapels = notreDameChapelPlan(),
    segments = 12;
  const chapelRoofs = chapels.flatMap(({ points, center }) =>
    points.map((p, i) => {
      const q = points[(i + 1) % points.length];
      return {
        polygon: [p, q, center],
        height: plane([
          [p[0], 10.5, p[1]],
          [q[0], 10.5, q[1]],
          [center[0], 14, center[1]]
        ])
      };
    })
  );
  const outsideChapels = (polygon: Point[]) =>
    chapels.reduce((pieces, chapel) => pieces.flatMap(piece => subtractConvex(piece, chapel.points, 1e-6)), [polygon]);
  const visibleRoof = (polygon: Point[], height: Height) =>
    chapelRoofs.reduce(
      (pieces, roof) => {
        const cover = clipHalfPlane(
          roof.polygon,
          [height.x - roof.height.x, height.z - roof.height.z],
          roof.height.base - height.base - 1e-6
        );
        return cover.length < 3 ? pieces : pieces.flatMap(piece => subtractConvex(piece, cover, 1e-6));
      },
      [polygon]
    );
  const surface = (name: string, polygon: Point[], height: Height, material: Surface, offset = 0) => {
    if (polygon.length < 3) return;
    const [a, b, c] = polygon;
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0) polygon = [...polygon].reverse();
    const vertices: number[] = [];
    for (let i = 1; i < polygon.length - 1; i++)
      for (const p of [polygon[0], polygon[i], polygon[i + 1]]) vertices.push(p[0], atHeight(p, height) + offset, p[1]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((vertices.length / 3) * 2).fill(0), 2));
    geometry.computeVertexNormals();
    k.add(name, geometry, material);
  };

  for (let cell = 0; cell < segments; cell++) {
    const a = (cell * Math.PI) / segments,
      b = ((cell + 1) * Math.PI) / segments;
    const quad = (inner: number, outer: number): Point[] => [
      ring(inner, a),
      ring(inner, b),
      ring(outer, b),
      ring(outer, a)
    ];
    // Floors are annular strips; the choir and chapel footprints are never filled or duplicated.
    for (const polygon of outsideChapels(quad(6.5, 18.3)))
      k.prism("ambulatory-ground-floor", polygon, 0, 0.08, "stone");
    k.prism("ambulatory-gallery-floor", quad(6.5, 12.4), 11.42, 0.08, "stone");
    for (const polygon of outsideChapels(quad(18.0, 18.3)))
      k.prism("ambulatory-exposed-outer-wall", polygon, 0.08, 11.42, "plaster");

    const start = ring(12.4, a),
      end = ring(12.4, b),
      dx = end[0] - start[0],
      dz = end[1] - start[1],
      width = Math.hypot(dx, dz),
      angle = Math.atan2(-dz / width, dx / width),
      x = (start[0] + end[0]) / 2,
      z = (start[1] + end[1]) / 2;
    // The lower arcade supports the gallery; both the arch and upper lancet are real wall openings.
    for (const [bottom, top, base, openingWidth, openingHeight] of [
      [0.08, 11.42, 0.09, width - 0.7, 9.7],
      [11.5, 19, 12.2, 2.1, 5.7]
    ]) {
      const wall = new THREE.Shape([
        new THREE.Vector2(-width / 2, bottom),
        new THREE.Vector2(width / 2, bottom),
        new THREE.Vector2(width / 2, top),
        new THREE.Vector2(-width / 2, top)
      ]);
      wall.holes.push(new THREE.Path(k.arch(openingWidth, openingHeight, base).getPoints(8).reverse()));
      k.panel("ambulatory-open-gallery-wall", wall, ...k.point(x, 0, z, angle, 0, 0, -0.38), angle, 0.38, "plaster");
      const outer = new THREE.Shape(k.arch(openingWidth + 0.22, openingHeight + 0.18, base - 0.08).getPoints(8));
      outer.holes.push(new THREE.Path(k.arch(openingWidth, openingHeight, base).getPoints(8).reverse()));
      k.panel("ambulatory-arch-surround", outer, x, 0, z, angle, 0.09, "white");
      if (base > 10) {
        const glass = k.add(
          "ambulatory-recessed-glazing",
          new THREE.ShapeGeometry(k.arch(openingWidth, openingHeight, base), 8),
          "water"
        );
        glass.position.set(...k.point(x, 0, z, angle, 0, 0, -0.26));
        glass.rotation.y = angle;
        k.beam(
          "ambulatory-window-mullion",
          k.point(x, base, z, angle, 0, 0, -0.18),
          k.point(x, base + openingHeight * 0.85, z, angle, 0, 0, -0.18),
          0.075,
          "white"
        );
        for (const u of [-0.52, 0.52]) {
          const trace = new THREE.Shape(k.arch(0.94, 3.8, base + 0.06, u).getPoints(6));
          trace.holes.push(
            new THREE.Path(
              k
                .arch(0.82, 3.7, base + 0.12, u)
                .getPoints(6)
                .reverse()
            )
          );
          k.panel("ambulatory-paired-lancet", trace, ...k.point(x, 0, z, angle, 0, 0, -0.14), angle, 0.07, "white");
        }
      }
    }
    // Use the adjoining longitudinal aisle's gable profile at both open ends of the half-ring.
    for (const [r0, y0, r1, y1] of [
      [6.5, 19, 9.45, 22.5],
      [9.45, 22.5, 12.4, 19],
      [12.4, 11.5, 15.35, 15],
      [15.35, 15, 18.3, 11.5]
    ]) {
      const polygon = quad(r0, r1),
        height = plane([
          [polygon[0][0], y0, polygon[0][1]],
          [polygon[1][0], y0, polygon[1][1]],
          [polygon[2][0], y1, polygon[2][1]]
        ]);
      for (const piece of visibleRoof(polygon, height)) surface("ambulatory-fitted-roof", piece, height, "iron");
      for (const t of [0.3, 0.65]) {
        const strip = [
          mix(polygon[0], polygon[1], t),
          mix(polygon[0], polygon[1], t + 0.006),
          mix(polygon[3], polygon[2], t + 0.006),
          mix(polygon[3], polygon[2], t)
        ];
        for (const piece of visibleRoof(strip, height))
          surface("ambulatory-lead-roof-seam", piece, height, "stone", 0.025);
      }
    }
    for (const [radius, height] of [
      [9.45, 22.5],
      [15.35, 15]
    ]) {
      const p = ring(radius, a),
        q = ring(radius, b);
      k.beam("ambulatory-ridge-cap", [p[0], height + 0.035, p[1]], [q[0], height + 0.035, q[1]], 0.08, "iron");
    }
  }
}
