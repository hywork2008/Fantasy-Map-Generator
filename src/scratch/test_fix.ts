import { polygonArea } from "../../src/city-editor/core/gen/geom";
import { clipHalfPlane } from "../../src/city-editor/core/gen/lotGeometry";
import { makeRng } from "../../src/city-editor/core/gen/prng";
import type { Point } from "../../src/city-editor/core/types";

const area = (p: Point[]) => Math.abs(polygonArea(p));
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];

const block0: Point[] = [
  [216.23370698413348, 223.67050969937077],
  [198.71157176193978, 162.11200987876595],
  [199.82864312646157, 153.9480569879362],
  [226.82584118847643, 157.4659171047646]
];

// 修正後のロジックをテスト
const sign = -Math.sign(polygonArea(block0));
const fronts = block0.map((a, i) => {
  const b = block0[(i + 1) % block0.length];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const axis: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const inward: Point = [-sign * axis[1], sign * axis[0]];
  return { a, axis, inward, length, offset: dot(a, inward), primary: false };
});

const ordered = fronts.slice().sort((a, b) => b.length - a.length);
const first = ordered[0];

// 改善1: 向かい合う辺（dot < -0.35）の中で、最も長い辺を選ぶ！
const candidates = ordered
  .slice(1)
  .filter(f => dot(f.inward, first.inward) < -0.35)
  .sort((a, b) => b.length - a.length);
const opposite = candidates[0];
if (opposite) {
  ordered.splice(ordered.indexOf(opposite), 1);
  ordered.splice(1, 0, opposite);
}

const localY = first ? block0.map(p => dot([p[0] - first.a[0], p[1] - first.a[1]], first.inward)) : [0];
const span = Math.max(...localY);
const backToBack = Boolean(opposite && span <= 32);

const rng = makeRng("test:houses:f45:block0");

let unassigned = block0;
const allBuildings: Point[][] = [];

for (let fIdx = 0; fIdx < ordered.length; fIdx++) {
  const front = ordered[fIdx];
  let sector = unassigned;
  let targetDepth = 15;
  if (backToBack && (front === first || front === opposite)) {
    const other = front === first ? opposite! : first!;
    const normal: Point = [front.inward[0] - other.inward[0], front.inward[1] - other.inward[1]];
    const offset = front.offset - other.offset;
    sector = clipHalfPlane(sector, normal, offset);
    targetDepth = span;
  }
  const local = sector.map(p => {
    const delta: Point = [p[0] - front.a[0], p[1] - front.a[1]];
    return [dot(delta, front.axis), dot(delta, front.inward)] as Point;
  });
  const band = clipHalfPlane(local, [0, 1], targetDepth);
  if (band.length < 3 || area(band) < 35) continue;
  const depth = Math.max(...band.map(p => p[1]));
  const frontY = 1e-5;

  // 改善2: 道路前面に接する範囲のみを streetStart, streetEnd とする！
  const streetXs = band.filter(p => Math.abs(p[1]) < 1e-5).map(p => p[0]);
  if (streetXs.length < 2) continue;
  const streetStart = Math.min(...streetXs);
  const streetEnd = Math.max(...streetXs);
  const streetLength = streetEnd - streetStart;
  if (streetLength < 3.5) continue;

  if (backToBack && (front === first || front === opposite)) {
    const other = front === first ? opposite! : first!;
    const normal: Point = [other.inward[0] - front.inward[0], other.inward[1] - front.inward[1]];
    const offset = other.offset - front.offset;
    unassigned = clipHalfPlane(unassigned, normal, offset);
  } else {
    unassigned = clipHalfPlane(unassigned, [-front.inward[0], -front.inward[1]], -front.offset - targetDepth);
  }

  const width = Math.max(5, Math.min(Math.sqrt(110) * 0.6, depth / 1.65, 110 / Math.max(6, depth)));
  const count = Math.max(1, Math.min(256, Math.round(streetLength / width)));
  const weights = Array.from({ length: count }, () => rng.range(0.8, 1.2));
  const total = weights.reduce((a, b) => a + b, 0);
  let start = streetStart;

  for (let i = 0; i < count; i++) {
    const end = start + (streetLength * weights[i]) / total;
    const lo = start + (i === 0 ? 1e-5 : 0);
    const hi = end - (i === count - 1 ? 1e-5 : 0);
    start = end;
    if (hi - lo < 3) continue;

    let lot = clipHalfPlane(band, [-1, 0], -lo);
    lot = clipHalfPlane(lot, [1, 0], hi);
    lot = clipHalfPlane(lot, [0, -1], -frontY);
    if (lot.length < 3 || area(lot) < 12) continue;

    const rear = Math.max(...lot.map(p => p[1]));
    if (rear - frontY < 3.5) continue; // 奥行き不足のゴミ区画を除外

    // 形状解決: 前面幅がしっかりあれば、奥が斜めでも台形（4頂点）または長方形（4頂点）にする！
    const _lotSpan = hi - lo;
    let bld: Point[];
    if (lot.length === 4) {
      bld = lot;
    } else {
      // 安全な台形/長方形
      const yL = Math.max(frontY + 3.5, ...lot.filter(p => Math.abs(p[0] - lo) < 0.1).map(p => p[1]));
      const yR = Math.max(frontY + 3.5, ...lot.filter(p => Math.abs(p[0] - hi) < 0.1).map(p => p[1]));
      bld = [
        [lo, frontY],
        [hi, frontY],
        [hi, yR],
        [lo, yL]
      ];
    }
    allBuildings.push(bld);
  }
}

console.log(`Total buildings: ${allBuildings.length}`);
let tri = 0,
  quad = 0;
for (const b of allBuildings) {
  if (b.length === 3) tri++;
  else if (b.length === 4) quad++;
}
console.log(`Triangles: ${tri}, Quads: ${quad}`);
