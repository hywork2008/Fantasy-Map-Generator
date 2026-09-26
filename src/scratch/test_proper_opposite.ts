import { polygonArea } from "../../src/city-editor/core/gen/geom";
import { clipHalfPlane } from "../../src/city-editor/core/gen/lotGeometry";
import { makeRng } from "../../src/city-editor/core/gen/prng";
import type { Point } from "../../src/city-editor/core/types";

const area = (p: Point[]) => Math.abs(polygonArea(p));
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];

const block: Point[] = [
  [216.23370698413348, 223.67050969937077],
  [198.71157176193978, 162.11200987876595],
  [199.82864312646157, 153.9480569879362],
  [226.82584118847643, 157.4659171047646]
];

const sign = -Math.sign(polygonArea(block));
const fronts = block.map((a, i) => {
  const b = block[(i + 1) % block.length];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const axis: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const inward: Point = [-sign * axis[1], sign * axis[0]];
  return { a, axis, inward, length, offset: dot(a, inward), primary: false };
});

// 長さも考慮して opposite を選ぶ！
// first と向かい合い（dot < -0.35）、かつ十分な長さ（first.length の 0.35 倍以上、あるいは最長候補）
const ordered = fronts.slice().sort((a, b) => b.length - a.length);
const first = ordered[0];

// candidates: 向かい合っている（dot < -0.35）辺の中で、最も長い辺を選ぶ！
const candidates = ordered
  .slice(1)
  .filter(f => dot(f.inward, first.inward) < -0.35)
  .sort((a, b) => b.length - a.length);

const opposite = candidates[0];
if (opposite) {
  ordered.splice(ordered.indexOf(opposite), 1);
  ordered.splice(1, 0, opposite);
}

console.log(`First front len: ${first.length.toFixed(1)}, Opposite front len: ${opposite?.length.toFixed(1)}`);
console.log(`Dot product: ${dot(first.inward, opposite.inward).toFixed(3)}`);

const localY = first ? block.map(p => dot([p[0] - first.a[0], p[1] - first.a[1]], first.inward)) : [0];
const span = Math.max(...localY);
const backToBack = Boolean(opposite && span <= 32);

console.log(`Span: ${span.toFixed(2)}, backToBack: ${backToBack}`);

let unassigned = block;
for (let fIdx = 0; fIdx < ordered.length; fIdx++) {
  const front = ordered[fIdx];
  console.log(`\n=== Processing front ${fIdx} (len: ${front.length.toFixed(1)}) ===`);
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
  console.log(`Band vertices: ${band.length}, area: ${area(band).toFixed(1)}`);

  if (backToBack && (front === first || front === opposite)) {
    const other = front === first ? opposite! : first!;
    const normal: Point = [other.inward[0] - front.inward[0], other.inward[1] - front.inward[1]];
    const offset = other.offset - front.offset;
    unassigned = clipHalfPlane(unassigned, normal, offset);
  }

  const streetStart = Math.min(...band.map(p => p[0]));
  const streetLength = Math.max(...band.map(p => p[0])) - streetStart;
  const width = 6;
  const count = Math.max(1, Math.round(streetLength / width));
  console.log(`Street length: ${streetLength.toFixed(1)}, count: ${count}`);

  const rng = makeRng("test");
  const weights = Array.from({ length: count }, () => rng.range(0.8, 1.2));
  const total = weights.reduce((a, b) => a + b, 0);
  let start = streetStart;
  for (let i = 0; i < count; i++) {
    const end = start + (streetLength * weights[i]) / total;
    const lo = start,
      hi = end;
    start = end;
    let lot = clipHalfPlane(band, [-1, 0], -lo);
    lot = clipHalfPlane(lot, [1, 0], hi);
    lot = clipHalfPlane(lot, [0, -1], -1e-5);
    console.log(`  Lot ${i} [${lo.toFixed(1)} - ${hi.toFixed(1)}]: area=${area(lot).toFixed(1)}, pts=${lot.length}`);
  }
}
