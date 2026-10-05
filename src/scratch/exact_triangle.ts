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

// frontageBuildings の packPerimeter を忠実に実行して、Building 10, 11, 12 を生み出した front とロットを特定
const sign = -Math.sign(polygonArea(block));
const fronts = block.map((a, i) => {
  const b = block[(i + 1) % block.length];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const axis: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const inward: Point = [-sign * axis[1], sign * axis[0]];
  return { a, axis, inward, length, offset: dot(a, inward), primary: false };
});

const ordered = fronts.slice().sort((a, b) => b.length - a.length);
const first = ordered[0];
const opposite = ordered.slice(1).sort((a, b) => dot(a.inward, first.inward) - dot(b.inward, first.inward))[0];
if (dot(opposite.inward, first.inward) < -0.35) {
  ordered.splice(ordered.indexOf(opposite), 1);
  ordered.splice(1, 0, opposite);
}

const localY = first ? block.map(p => dot([p[0] - first.a[0], p[1] - first.a[1]], first.inward)) : [0];
const span = Math.max(...localY);
const backToBack = Boolean(opposite && span <= 32);

const rng = makeRng("test:houses:f45:block0");

let unassigned = block;
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
  const streetXs = band.filter(p => Math.abs(p[1]) < 1e-6).map(p => p[0]);
  if (streetXs.length < 2) continue;

  if (backToBack && (front === first || front === opposite)) {
    const other = front === first ? opposite! : first!;
    const normal: Point = [other.inward[0] - front.inward[0], other.inward[1] - front.inward[1]];
    const offset = other.offset - front.offset;
    unassigned = clipHalfPlane(unassigned, normal, offset);
  }

  const streetStart = Math.min(...band.map(p => p[0]));
  const streetLength = Math.max(...band.map(p => p[0])) - streetStart;
  const width = Math.max(5, Math.min(Math.sqrt(110) * 0.6, depth / 1.65, 110 / Math.max(6, depth)));
  const count = Math.max(1, Math.min(256, Math.round(streetLength / width)));
  const weights = Array.from({ length: count }, () => rng.range(0.8, 1.2));
  const total = weights.reduce((a, b) => a + b, 0);
  let start = streetStart;

  console.log(`\nFront ${fIdx}: streetLength=${streetLength.toFixed(1)}, count=${count}`);

  for (let i = 0; i < count; i++) {
    const end = start + (streetLength * weights[i]) / total;
    const lo = start + (i === 0 ? 1e-5 : 0);
    const hi = end - (i === count - 1 ? 1e-5 : 0);
    start = end;
    rng(); // Preserve the occupancy draw in the reproduced random sequence.
    rng();
    let lot = clipHalfPlane(band, [-1, 0], -lo);
    lot = clipHalfPlane(lot, [1, 0], hi);
    lot = clipHalfPlane(lot, [0, -1], -frontY);
    if (lot.length < 3 || area(lot) < 12) continue;

    const rear = Math.max(...lot.map(p => p[1]));
    const outline = (back: number): Point[] => {
      let template: Point[] = [
        [lo, frontY],
        [hi, frontY],
        [hi, back],
        [lo, back]
      ];
      const winding = -Math.sign(polygonArea(lot));
      for (let j = 0; j < lot.length; j++) {
        const a = lot[j],
          b = lot[(j + 1) % lot.length];
        const normal: Point = [winding * (b[1] - a[1]), winding * (a[0] - b[0])];
        template = clipHalfPlane(template, normal, dot(a, normal));
      }
      return template;
    };
    let loD = frontY,
      hiD = rear;
    for (let j = 0; j < 18; j++) {
      const back = (loD + hiD) / 2;
      if (area(outline(back)) <= area(lot)) loD = back;
      else hiD = back;
    }
    const rawPoints = outline(loD);
    console.log(
      `  Lot ${i} [${lo.toFixed(2)} - ${hi.toFixed(2)}]: rawPoints.len=${rawPoints.length}, loD=${loD.toFixed(2)}, rear=${rear.toFixed(2)}, area=${area(rawPoints).toFixed(1)}`
    );
    console.log("    rawPoints:", JSON.stringify(rawPoints));
  }
}
