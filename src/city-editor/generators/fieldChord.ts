import type { Point } from "../types/document";

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dot = (p: Point, n: Point) => p[0] * n[0] + p[1] * n[1];

export function chord(poly: Point[], normal: Point, offset: number): [Point, Point] | null {
  const hits: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = dot(a, normal) - offset,
      db = dot(b, normal) - offset;
    if (Math.abs(da) < 1e-6) hits.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      hits.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  let best: [Point, Point] | null = null;
  for (const a of hits) for (const b of hits) if (distance(a, b) > (best ? distance(...best) : 1e-5)) best = [a, b];
  return best;
}
