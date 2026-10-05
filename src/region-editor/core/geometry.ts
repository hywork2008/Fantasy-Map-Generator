import type { Point } from "./types";

export function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function pointAdd(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1]];
}

export function pointSub(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1]];
}

export function pointScale(p: Point, s: number): Point {
  return [p[0] * s, p[1] * s];
}

export function pointLerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function normalize(v: Point): Point {
  const len = Math.hypot(v[0], v[1]);
  if (len === 0) return [0, 0];
  return [v[0] / len, v[1] / len];
}

export function dot(a: Point, b: Point): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function cross(a: Point, b: Point): number {
  return a[0] * b[1] - a[1] * b[0];
}

/**
 * 2次元法線ベクトル（左手系・時計回りに90度回転）
 */
export function normal(v: Point): Point {
  return [-v[1], v[0]];
}

/**
 * 2つの線分 p1-p2 と q1-q2 の交差判定と交点
 */
export function segmentIntersection(
  p1: Point,
  p2: Point,
  q1: Point,
  q2: Point
): { intersects: boolean; point?: Point; t?: number; u?: number } {
  const r = pointSub(p2, p1);
  const s = pointSub(q2, q1);
  const rxs = cross(r, s);

  if (Math.abs(rxs) < 1e-9) {
    // 平行
    return { intersects: false };
  }

  const qp = pointSub(q1, p1);
  const t = cross(qp, s) / rxs;
  const u = cross(qp, r) / rxs;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      intersects: true,
      point: [p1[0] + t * r[0], p1[1] + t * r[1]],
      t,
      u
    };
  }

  return { intersects: false };
}

/**
 * ポリライン上の指定点（またはインデックス）における接線単位ベクトルを求める
 */
export function polylineTangent(points: Point[], segmentIndex: number, _t: number): Point {
  if (points.length < 2) return [1, 0];
  const p1 = points[segmentIndex];
  const p2 = points[segmentIndex + 1] ?? points[segmentIndex];
  return normalize(pointSub(p2, p1));
}

/**
 * 点が多角形内部にあるか判定（Ray casting）
 */
export function pointInPolygon(point: Point, vs: Point[]): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0];
    const yi = vs[i][1];
    const xj = vs[j][0];
    const yj = vs[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
