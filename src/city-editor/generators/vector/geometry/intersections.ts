import RBush from "rbush";
import type { CurveAnchor, VectorPath } from "../../../types/vector/document";
import { evaluateAnchor } from "./curves";
import { samplePath } from "./sampling";
export function pathIntersections(a: VectorPath, b: VectorPath): { a: CurveAnchor; b: CurveAnchor }[] {
  const spans = (path: VectorPath) => {
    const samples = samplePath(path);
    return samples.slice(1).flatMap((s, i) =>
      s.anchor.segmentId === samples[i].anchor.segmentId
        ? [
            {
              from: samples[i],
              to: s,
              minX: Math.min(s.point[0], samples[i].point[0]) - 0.01,
              maxX: Math.max(s.point[0], samples[i].point[0]) + 0.01,
              minY: Math.min(s.point[1], samples[i].point[1]) - 0.01,
              maxY: Math.max(s.point[1], samples[i].point[1]) + 0.01
            }
          ]
        : []
    );
  };
  const first = spans(a),
    second = spans(b),
    tree = new RBush<(typeof second)[number]>();
  tree.load(second);
  const hits: { a: CurveAnchor; b: CurveAnchor }[] = [];
  for (const u of first)
    for (const v of tree.search(u)) {
      const ux = u.to.point[0] - u.from.point[0],
        uy = u.to.point[1] - u.from.point[1],
        vx = v.to.point[0] - v.from.point[0],
        vy = v.to.point[1] - v.from.point[1],
        den = ux * vy - uy * vx;
      if (Math.abs(den) < 1e-12) continue;
      const dx = v.from.point[0] - u.from.point[0],
        dy = v.from.point[1] - u.from.point[1],
        t = (dx * vy - dy * vx) / den,
        s = (dx * uy - dy * ux) / den;
      if (t < -0.01 || t > 1.01 || s < -0.01 || s > 1.01) continue;
      const aa = { ...u.from.anchor, t: u.from.anchor.t + (u.to.anchor.t - u.from.anchor.t) * t },
        bb = { ...v.from.anchor, t: v.from.anchor.t + (v.to.anchor.t - v.from.anchor.t) * s };
      let valid = true;
      for (let n = 0; n < 12; n++) {
        if (aa.t < 0 || aa.t > 1 || bb.t < 0 || bb.t > 1) {
          valid = false;
          break;
        }
        for (const anchor of [aa, bb]) {
          if (anchor.t < 1e-10) anchor.t = 0;
          else if (anchor.t > 1 - 1e-10) anchor.t = 1;
        }
        const p = evaluateAnchor(a, aa),
          q = evaluateAnchor(b, bb),
          d = evaluateAnchor(a, aa, true),
          e = evaluateAnchor(b, bb, true),
          delta = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(delta) < 1e-12) {
          valid = false;
          break;
        }
        const x = q[0] - p[0],
          y = q[1] - p[1];
        if (Math.hypot(x, y) < 1e-8) break;
        aa.t += (x * e[1] - y * e[0]) / delta;
        bb.t += (x * d[1] - y * d[0]) / delta;
      }
      if (!valid || aa.t < 0 || aa.t > 1 || bb.t < 0 || bb.t > 1) continue;
      for (const anchor of [aa, bb]) {
        if (anchor.t < 1e-10) anchor.t = 0;
        else if (anchor.t > 1 - 1e-10) anchor.t = 1;
      }
      const p = evaluateAnchor(a, aa),
        q = evaluateAnchor(b, bb);
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) continue;
      if (
        !hits.some(h => {
          const r = evaluateAnchor(a, h.a);
          return Math.hypot(r[0] - p[0], r[1] - p[1]) < 1e-6;
        })
      )
        hits.push({ a: aa, b: bb });
    }
  return hits;
}
