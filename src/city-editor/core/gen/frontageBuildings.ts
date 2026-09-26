import type { Point } from "../types";
import { polygonArea, polygonCentroid } from "./geom";
import { clipHalfPlane, insetConvexKernel } from "./lotGeometry";
import type { Rng } from "./prng";

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Point, s: number): Point => [a[0] * s, a[1] * s];
const area = (p: Point[]) => Math.abs(polygonArea(p));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export interface FrontageOptions {
  lotArea: number;
  coverage: number;
  occupancy: number;
  outskirts: boolean;
  /** Coverage applies to the complete block, leaving one compact courtyard. */
  perimeter?: boolean;
  /** Compact town houses: vary shallow rectangular footprints along a street wall. */
  compact?: boolean;
  /** Short attached houses; shallow opposing rows share their rear boundary. */
  attached?: boolean;
  /** Main-road fronts are occupied before secondary lanes. */
  primaryEdges?: number[];
  /** Organic streets and houses use the same dwelling-depth scale. */
  rowDepth?: number;
}

type Front = { a: Point; axis: Point; inward: Point; length: number; offset: number; primary: boolean };

/** Pack a convex block from its accessible edges. Lot cuts never become roads.
 * Nearest-frontage half-planes allocate corners before placing buildings, so
 * opposing rows cannot overlap. The rear of each row opens onto shared yards.
 * Core lots are street-aligned rectangles with party walls; outskirts keep L/U wings. */
export function frontageBuildings(
  block: Point[],
  accessibleEdges: number[],
  options: FrontageOptions,
  rng: Rng
): Point[][] {
  const sign = -Math.sign(polygonArea(block));
  const fronts: Front[] = accessibleEdges
    .map(i => {
      const a = block[i],
        b = block[(i + 1) % block.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const axis: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
      const inward: Point = [-sign * axis[1], sign * axis[0]];
      return { a, axis, inward, length, offset: dot(a, inward), primary: options.primaryEdges?.includes(i) ?? false };
    })
    .filter(f => f.length >= (options.attached ? 2.5 : 5));
  const buildings: Point[][] = [];
  const rowDepth = Math.sqrt(options.lotArea) * (options.outskirts ? 1.15 : 1.65);
  if (options.attached) return packAttachedHouses(block, fronts, options, rng);
  if (options.perimeter) return packPerimeter(block, fronts, options, rng);
  if (!options.outskirts) return packStreetWall(block, fronts, options, rowDepth, rng);
  for (const front of fronts) {
    let sector = block;
    for (const other of fronts) {
      if (other === front) continue;
      // distance to this supporting line <= distance to the other line.
      sector = clipHalfPlane(
        sector,
        [front.inward[0] - other.inward[0], front.inward[1] - other.inward[1]],
        front.offset - other.offset
      );
    }
    const local = sector.map(p => {
      const delta: Point = [p[0] - front.a[0], p[1] - front.a[1]];
      return [dot(delta, front.axis), dot(delta, front.inward)] as Point;
    });
    const band = clipHalfPlane(local, [0, 1], rowDepth);
    if (band.length < 3 || area(band) < 35) continue;
    const depth = Math.max(...band.map(p => p[1]));
    // Shared fronts have no per-house offset. A small uniform setback keeps
    // outline strokes clear of the road; density changes only the rear.
    const frontY = 0.15;
    const width = Math.max(5, options.lotArea / Math.max(6, depth));
    const count = Math.max(1, Math.min(256, Math.round(front.length / width)));
    const weights = Array.from({ length: count }, () => rng.range(0.8, 1.2));
    const total = weights.reduce((a, b) => a + b, 0);
    let start = 0;
    for (let i = 0; i < count; i++) {
      const end = start + (front.length * weights[i]) / total;
      const lo = start + 0.08,
        hi = end - 0.08;
      start = end;
      // Keep the random stream stable across coverage/occupancy edits.
      const occupied = rng() < options.occupancy;
      const shape = rng();
      if (!occupied || hi - lo < 3) continue;
      let lot = clipHalfPlane(band, [-1, 0], -lo);
      lot = clipHalfPlane(lot, [1, 0], hi);
      lot = clipHalfPlane(lot, [0, -1], -frontY);
      if (lot.length < 3 || area(lot) < 35) continue;
      // Open rear notches give L/U plans without holes or a convex inset of
      // a concave building. Neighbouring rows share the unbuilt courtyard.
      const rear = Math.max(...lot.map(p => p[1]));
      const span = hi - lo;
      const wing = Math.max(3, span * 0.24);
      const kind =
        span >= 12 && rear > 10 && shape < 0.18
          ? "u"
          : span >= 8 && rear > 9 && shape < 0.48
            ? i % 2
              ? "left"
              : "right"
            : "rect";
      const outline = (back: number): Point[] => {
        let template: Point[];
        if (kind === "rect")
          template = [
            [lo, frontY],
            [hi, frontY],
            [hi, back],
            [lo, back]
          ];
        else if (kind === "u")
          template = [
            [lo, frontY],
            [hi, frontY],
            [hi, rear],
            [hi - wing, rear],
            [hi - wing, back],
            [lo + wing, back],
            [lo + wing, rear],
            [lo, rear]
          ];
        else if (kind === "left")
          template = [
            [lo, frontY],
            [hi, frontY],
            [hi, back],
            [lo + wing, back],
            [lo + wing, rear],
            [lo, rear]
          ];
        else
          template = [
            [lo, frontY],
            [hi, frontY],
            [hi, rear],
            [hi - wing, rear],
            [hi - wing, back],
            [lo, back]
          ];
        // Clip the template to its convex ownership region, preserving the
        // street front and any angled corner rather than centering a rectangle.
        const winding = -Math.sign(polygonArea(lot));
        for (let j = 0; j < lot.length; j++) {
          const a = lot[j],
            b = lot[(j + 1) % lot.length];
          const normal: Point = [winding * (b[1] - a[1]), winding * (a[0] - b[0])];
          template = clipHalfPlane(template, normal, dot(a, normal));
        }
        return template;
      };
      const budget = area(lot) * options.coverage;
      let low = frontY,
        high = rear;
      // Wings alone can exceed very low coverage: fall back to a front strip.
      const useStrip = area(outline(frontY + 3)) > budget;
      const footprint = (back: number) => (useStrip ? clipHalfPlane(lot, [0, 1], back) : outline(back));
      for (let j = 0; j < 18; j++) {
        const back = (low + high) / 2;
        if (area(footprint(back)) <= budget) low = back;
        else high = back;
      }
      const shapePoints = footprint(low);
      if (shapePoints.length < 3 || area(shapePoints) < 30 || low - frontY < 3) continue;
      // Discard corner slivers which have lost their actual street frontage.
      const frontXs = shapePoints.filter(p => Math.abs(p[1] - frontY) < 1e-5).map(p => p[0]);
      if (frontXs.length < 2 || Math.max(...frontXs) - Math.min(...frontXs) < 3) continue;
      const distinct = shapePoints.filter((p, j) => {
        const next = shapePoints[(j + 1) % shapePoints.length];
        return Math.hypot(p[0] - next[0], p[1] - next[1]) > 1e-6;
      });
      const clean = distinct.filter((p, j) => {
        const prev = distinct[(j + distinct.length - 1) % distinct.length];
        const next = distinct[(j + 1) % distinct.length];
        const a: Point = [p[0] - prev[0], p[1] - prev[1]];
        const b: Point = [next[0] - p[0], next[1] - p[1]];
        return Math.abs(a[0] * b[1] - a[1] * b[0]) > 1e-7 || dot(a, b) < 0;
      });
      if (clean.length < 3) continue;
      buildings.push(
        clean.map(([x, y]) => [
          front.a[0] + x * front.axis[0] + y * front.inward[0],
          front.a[1] + x * front.axis[1] + y * front.inward[1]
        ])
      );
    }
  }
  return buildings;
}

const FRONT_Y = 0.15;
const PARTY_GAP = 0.02;

/** Compact houses, not elongated burgage holdings. Shared frontage sectors
 * partition the block without overlap; their common back line is not an alley.
 * Each house stays rectangular. Acute corners and tapering remainders remain
 * visibly open instead of becoming triangular buildings. */
function packAttachedHouses(block: Point[], fronts: Front[], options: FrontageOptions, rng: Rng): Point[][] {
  if (options.coverage <= 0 || options.occupancy <= 0) return [];
  const buildings: Point[][] = [];
  const houseWidth = Math.max(7, Math.min(11, Math.sqrt(options.lotArea) * 0.95));
  for (const front of fronts) {
    let sector = block;
    for (const other of fronts) {
      if (other === front) continue;
      sector = clipHalfPlane(
        sector,
        [front.inward[0] - other.inward[0], front.inward[1] - other.inward[1]],
        front.offset - other.offset
      );
    }
    if (sector.length < 3) continue;
    const local = sector.map(p => {
      const delta: Point = [p[0] - front.a[0], p[1] - front.a[1]];
      return [dot(delta, front.axis), dot(delta, front.inward)] as Point;
    });
    const count = Math.max(1, Math.min(256, Math.round(front.length / houseWidth)));
    const weights = Array.from({ length: count }, () => rng.range(0.88, 1.12));
    const total = weights.reduce((sum, w) => sum + w, 0);
    const cuts = [0];
    for (const weight of weights) cuts.push(cuts[cuts.length - 1] + (front.length * weight) / total);
    const plot = (lo: number, hi: number) => clipHalfPlane(clipHalfPlane(local, [-1, 0], -lo), [1, 0], hi);
    // Absorb unusably small corner remnants into the next house, not an empty
    // frontage. No gaps are inserted between adjacent houses in a row.
    for (let i = 0; i < cuts.length - 1 && cuts.length > 2; ) {
      const lot = plot(cuts[i], cuts[i + 1]);
      if (lot.length < 3 || area(lot) < 16) {
        cuts.splice(i === cuts.length - 2 ? i : i + 1, 1);
        i = Math.max(0, i - 1);
      } else i++;
    }
    for (let i = 0; i < cuts.length - 1; i++) {
      const lo = cuts[i],
        hi = cuts[i + 1];
      const occupied = rng() < options.occupancy;
      // A low occupancy removes secondary-lane houses first; it must not
      // randomly punch holes into the principal commercial street wall.
      if (!front.primary && !occupied) continue;
      const lot = plot(lo, hi);
      if (lot.length < 3 || area(lot) < 12) continue;
      // Fitting the rectangle before choosing its depth is essential at a
      // wedge-shaped block corner: clipping a facade rectangle to the wedge
      // would turn the house into a triangle.
      const fitted = fitRectangle(lot, lo, hi, 0);
      if (!fitted) continue;
      const rear = fitted.back;
      // MFCG-like proportions: typically 7–11m wide, at most 16m deep and
      // never extend a narrow house more than 1.8 times its frontage width.
      const depthLimit = Math.min(16, (hi - lo) * 1.8);
      const paired = !options.outskirts && options.coverage >= 0.85 && rear <= depthLimit;
      let depth = Math.min(rear, depthLimit);
      if (!paired) {
        // Lower density and deeper blocks leave space behind the house. Keep
        // the full street frontage; do not shrink all four sides of each lot.
        const fittedLot: Point[] = [
          [fitted.lo, 0],
          [fitted.hi, 0],
          [fitted.hi, depth],
          [fitted.lo, depth]
        ];
        const budget = area(fittedLot) * Math.min(1, options.coverage);
        let low = 0,
          high = depth;
        for (let step = 0; step < 18; step++) {
          const candidate = (low + high) / 2;
          if ((fitted.hi - fitted.lo) * candidate <= budget) low = candidate;
          else high = candidate;
        }
        depth = low;
      }
      if (depth < 2.5 || fitted.hi - fitted.lo < 2.5) continue;
      const rectangle: Point[] = [
        [fitted.lo, 0],
        [fitted.hi, 0],
        [fitted.hi, depth],
        [fitted.lo, depth]
      ];
      buildings.push(rectangle.map(([x, y]) => toWorld(front, x, y)));
    }
  }
  return buildings;
}

function packPerimeter(block: Point[], fronts: Front[], options: FrontageOptions, rng: Rng): Point[][] {
  const buildings: Point[][] = [];
  let rowDepth = Math.sqrt(options.lotArea) * 1.65;
  let low = 0,
    high = Math.sqrt(area(block));
  const yardArea = area(block) * (1 - options.coverage);
  for (let i = 0; i < 24; i++) {
    const depth = (low + high) / 2;
    if (
      area(
        insetConvexKernel(
          block,
          block.map(() => depth)
        )
      ) > yardArea
    )
      low = depth;
    else high = depth;
  }
  rowDepth = options.rowDepth === undefined ? high : Math.min(high, options.rowDepth);
  const ordered = fronts.slice().sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return b.length - a.length;
  });
  const first = ordered[0];
  let opposite: Front | undefined;
  if (first) {
    const candidates = ordered.slice(1).sort((a, b) => dot(a.inward, first.inward) - dot(b.inward, first.inward));
    if (candidates.length && dot(candidates[0].inward, first.inward) < -0.35) {
      opposite = candidates[0];
      ordered.splice(ordered.indexOf(opposite), 1);
      ordered.splice(1, 0, opposite);
    }
  }
  const localY = first ? block.map(p => dot([p[0] - first.a[0], p[1] - first.a[1]], first.inward)) : [0];
  const span = Math.max(...localY);

  // 街区が背中合わせ型（back-to-back: 2d）か中庭型（courtyard block: 2d + c）かの判定:
  // - 街区厚み span が 32m 以下かつ coverage >= 0.82 の細長い街区は背中合わせ型
  // - 街区厚み span が 32m 超（中庭型街区）または coverage < 0.82 の街区は、中央に中庭（空地）を残す
  const backToBack = Boolean(
    opposite && span <= (options.rowDepth === undefined ? 32 : options.rowDepth * 2 + 3) && options.coverage >= 0.82
  );

  let unassigned = block;
  for (const front of ordered) {
    let sector = unassigned;
    let targetDepth = rowDepth;
    if (backToBack && (front === first || front === opposite)) {
      // In ribbon blocks, pair opposite street fronts along their Voronoi bisector.
      // Buildings meet back-to-back in the block interior instead of hollowing out
      // an artificial central donut hole.
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
    } else {
      unassigned = clipHalfPlane(unassigned, [-front.inward[0], -front.inward[1]], -front.offset - targetDepth);
    }
    const streetStart = Math.min(...band.map(p => p[0]));
    const streetLength = Math.max(...band.map(p => p[0])) - streetStart;
    const width = front.primary
      ? Math.max(4.2, Math.min(5.6, depth * 0.75, Math.sqrt(options.lotArea) * 0.52))
      : Math.max(3.8, Math.min(5.4, depth * 0.75, Math.sqrt(options.lotArea) * 0.52));
    const count = Math.max(1, Math.min(256, Math.round(streetLength / width)));
    const weights = Array.from({ length: count }, () => rng.range(0.88, 1.12));
    const total = weights.reduce((a, b) => a + b, 0);
    let start = streetStart;
    for (let i = 0; i < weights.length; i++) {
      const end = start + (streetLength * weights[i]) / total;
      const lo = start + (i === 0 ? 1e-5 : 0),
        hi = end - (i === weights.length - 1 ? 1e-5 : 0);
      start = end;
      const occupied = rng() < options.occupancy;
      rng();
      if (!occupied || hi - lo < (front.primary ? 3.55 : 3.0)) continue;
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
      if (rawPoints.length < 3 || area(rawPoints) < 12 || loD - frontY < 3) continue;

      const frontXs = rawPoints.filter(p => Math.abs(p[1] - frontY) < 1e-5).map(p => p[0]);
      if (frontXs.length < 2 || Math.max(...frontXs) - Math.min(...frontXs) < 3) {
        const exterior = block.map(p => {
          const delta: Point = [p[0] - front.a[0], p[1] - front.a[1]];
          return [dot(delta, front.axis), dot(delta, front.inward)] as Point;
        });
        const hasCornerFront = exterior.some((a, j) => {
          const b = exterior[(j + 1) % exterior.length];
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const onLine = (p: Point) =>
            Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / length < 1e-4;
          return rawPoints.some((p, k) => {
            const q = rawPoints[(k + 1) % rawPoints.length];
            return onLine(p) && onLine(q) && Math.hypot(q[0] - p[0], q[1] - p[1]) >= 3;
          });
        });
        if (!hasCornerFront) continue;
      }

      // 住宅形状を長方形・台形・三角形のいずれかに収束させる:
      // 直線道路に面する住宅は長方形（直角矩形）を基本とする。
      // 太い道沿いは短辺接道（町屋型）、一般道路沿いも整った長方形を最優先。
      // カーブ部・斜め区画・角地のみ台形または三角形とする。
      const shapePoints = resolveHouseShape(rawPoints, lot, frontY, lo, hi, front.primary, options.lotArea);
      if (shapePoints.length < 3 || area(shapePoints) < 12) continue;

      // 近接頂点（距離 < 0.35m）をマージして極小エッジ・退化多角形を解消
      const merged: Point[] = [];
      for (const p of shapePoints) {
        if (!merged.some(u => Math.hypot(u[0] - p[0], u[1] - p[1]) < 0.35)) {
          merged.push(p);
        }
      }
      if (merged.length < 3 || area(merged) < 12) continue;

      // マージによって3頂点になった場合は、台形化して四角形に修復
      let cleanPoints = merged;
      if (cleanPoints.length === 3) {
        cleanPoints = simplifyToHouseShape(cleanPoints, frontY, lo, hi);
      }
      if (cleanPoints.length < 3 || area(cleanPoints) < 12) continue;

      const distinct = cleanPoints.filter((p, j) => {
        const next = cleanPoints[(j + 1) % cleanPoints.length];
        return Math.hypot(p[0] - next[0], p[1] - next[1]) > 1e-4;
      });
      const clean = distinct.filter((p, j) => {
        const prev = distinct[(j + distinct.length - 1) % distinct.length];
        const next = distinct[(j + 1) % distinct.length];
        const a: Point = [p[0] - prev[0], p[1] - prev[1]];
        const b: Point = [next[0] - p[0], next[1] - p[1]];
        return Math.abs(a[0] * b[1] - a[1] * b[0]) > 1e-7 || dot(a, b) < 0;
      });
      let finalPoly = clean;
      if (finalPoly.length === 3) {
        finalPoly = simplifyToHouseShape(finalPoly, frontY, lo, hi);
      }
      if (finalPoly.length < 4 || area(finalPoly) < 12) continue;
      const center = polygonCentroid(finalPoly);
      buildings.push(
        finalPoly
          .map(p => [p[0] + (center[0] - p[0]) * 1e-7, p[1] + (center[1] - p[1]) * 1e-7] as Point)
          .map(([x, y]) => [
            front.a[0] + x * front.axis[0] + y * front.inward[0],
            front.a[1] + x * front.axis[1] + y * front.inward[1]
          ])
      );
    }
  }
  return buildings;
}

/**
 * 住宅形状を長方形・台形・三角形のいずれかに収束させる:
 * 1. 直線道路に面する通常の住宅は、長方形（4頂点）を最優先。
 * 2. 斜めの境界やカーブでは、台形（4頂点）を優先。
 * 3. 三角形（3頂点）になるのは、鋭角な角地や先細りの街区末端のみに厳格に制限。
 */
function resolveHouseShape(
  rawPoints: Point[],
  lot: Point[],
  frontY: number,
  lo: number,
  hi: number,
  isPrimary: boolean,
  _lotArea: number
): Point[] {
  const lotSpan = hi - lo;
  const rear = Math.max(...rawPoints.map(p => p[1]));
  const availableDepth = rear - frontY;

  if (isPrimary) {
    // 道路沿い（一等地）: 中世ヨーロッパのフロンテージ課税（間口税）に基づき、
    // 短辺が道路に面し（間口）、長辺が道路に直角（奥行き）になる短冊型町屋とする
    const targetDepth = Math.max(lotSpan * 1.15, Math.min(availableDepth, 16));
    if (targetDepth >= 3.5 && targetDepth >= lotSpan * 1.05) {
      const candidateRect: Point[] = [
        [lo, frontY],
        [hi, frontY],
        [hi, frontY + targetDepth],
        [lo, frontY + targetDepth]
      ];
      if (overlapArea(candidateRect, lot) >= lotSpan * targetDepth - 0.05) {
        return candidateRect;
      }
    }

    // 敷地の奥行きが浅い場合でも、間口を奥行きより狭くトリミングして短辺接道（間口 < 奥行き）を徹底
    if (availableDepth >= 3.5) {
      const allowedWidth = Math.max(3.0, Math.min(lotSpan, availableDepth * 0.85));
      const midX = (lo + hi) / 2;
      const adjLo = midX - allowedWidth / 2;
      const adjHi = midX + allowedWidth / 2;
      const compactRect: Point[] = [
        [adjLo, frontY],
        [adjHi, frontY],
        [adjHi, frontY + availableDepth],
        [adjLo, frontY + availableDepth]
      ];
      if (overlapArea(compactRect, lot) >= allowedWidth * availableDepth - 0.05) {
        return compactRect;
      }
    }
  }

  // 近接頂点（距離 < 0.35m）をあらかじめマージ
  const deduped: Point[] = [];
  for (const pt of rawPoints) {
    if (!deduped.some(u => Math.hypot(u[0] - pt[0], u[1] - pt[1]) < 0.35)) {
      deduped.push(pt);
    }
  }
  const pts = deduped.length >= 3 ? deduped : rawPoints;

  if (isPrimary) {
    // 道路沿い（一等地）: 中世ヨーロッパのフロンテージ課税（間口税）に基づき、
    // 短辺が道路に面し（間口）、長辺が道路に直角（奥行き）になる短冊型町屋とする
    const targetDepth = Math.max(lotSpan * 1.15, Math.min(availableDepth, 16));
    if (targetDepth >= 3.5 && targetDepth >= lotSpan * 1.05) {
      const candidateRect: Point[] = [
        [lo, frontY],
        [hi, frontY],
        [hi, frontY + targetDepth],
        [lo, frontY + targetDepth]
      ];
      if (overlapArea(candidateRect, lot) >= lotSpan * targetDepth - 0.05) {
        return candidateRect;
      }
    }

    // 敷地の奥行きが浅い場合でも、間口を奥行きより狭くトリミングして短辺接道（間口 < 奥行き）を徹底
    if (availableDepth >= 3.5) {
      const allowedWidth = Math.max(3.0, Math.min(lotSpan, availableDepth * 0.85));
      const midX = (lo + hi) / 2;
      const adjLo = midX - allowedWidth / 2;
      const adjHi = midX + allowedWidth / 2;
      const compactRect: Point[] = [
        [adjLo, frontY],
        [adjHi, frontY],
        [adjHi, frontY + availableDepth],
        [adjLo, frontY + availableDepth]
      ];
      if (overlapArea(compactRect, lot) >= allowedWidth * availableDepth - 0.05) {
        return compactRect;
      }
    }
  }

  // 1. pts 自体がすでに 4 頂点（長方形または台形）の場合:
  if (pts.length === 4) {
    const frontXs = pts.filter(p => Math.abs(p[1] - frontY) < 0.2).map(p => p[0]);
    const fW = frontXs.length >= 2 ? Math.max(...frontXs) - Math.min(...frontXs) : lotSpan;
    if (isPrimary && fW < 3.55 && availableDepth >= 3.5) {
      const midX = frontXs.length >= 2 ? (Math.min(...frontXs) + Math.max(...frontXs)) / 2 : (lo + hi) / 2;
      return [
        [midX - 1.78, frontY],
        [midX + 1.78, frontY],
        [midX + 1.78, frontY + availableDepth],
        [midX - 1.78, frontY + availableDepth]
      ];
    }
    if (fW > availableDepth * (isPrimary ? 0.95 : 1.15) && availableDepth >= 3.5) {
      // 長辺接道になってしまっている場合は整った四角形（長方形）に収束
      const allowedWidth = Math.max(3.55, Math.min(fW, availableDepth * (isPrimary ? 0.85 : 0.95)));
      const midX = (Math.min(...frontXs) + Math.max(...frontXs)) / 2;
      return [
        [midX - allowedWidth / 2, frontY],
        [midX + allowedWidth / 2, frontY],
        [midX + allowedWidth / 2, frontY + availableDepth],
        [midX - allowedWidth / 2, frontY + availableDepth]
      ];
    }
    return pts;
  }

  // 2. 5頂点以上の場合、あるいは3頂点（三角形）の場合:
  // 台形または長方形（4頂点）に単純化・矩形化
  const simplified = simplifyToHouseShape(pts, frontY, lo, hi);
  if (simplified.length === 4) {
    const frontXs = simplified.filter(p => Math.abs(p[1] - frontY) < 0.2).map(p => p[0]);
    const fW = frontXs.length >= 2 ? Math.max(...frontXs) - Math.min(...frontXs) : lotSpan;
    if (fW > availableDepth * (isPrimary ? 0.95 : 1.15) && availableDepth >= 3.5) {
      const allowedWidth = Math.max(3.55, Math.min(fW, availableDepth * (isPrimary ? 0.85 : 0.95)));
      const midX = (lo + hi) / 2;
      return [
        [midX - allowedWidth / 2, frontY],
        [midX + allowedWidth / 2, frontY],
        [midX + allowedWidth / 2, frontY + availableDepth],
        [midX - allowedWidth / 2, frontY + availableDepth]
      ];
    }
  }
  return simplified;
}

/**
 * 住宅形状を長方形・台形の四角形に収束させる:
 * 三角形敷地や多角形敷地であっても、奥の尖った頂点を手前でカットして台形（4頂点）にする。
 */
function simplifyToHouseShape(poly: Point[], frontY: number, _lo: number, _hi: number): Point[] {
  // 前面の2点を探す
  const frontIndices: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    if (Math.abs(poly[i][1] - frontY) < 0.2) frontIndices.push(i);
  }

  if (frontIndices.length < 2) {
    const xs = poly.map(p => p[0]);
    const ys = poly.map(p => p[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    return [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY]
    ];
  }

  let idxFL = frontIndices[0];
  let idxFR = frontIndices[1];
  if (poly[idxFL][0] > poly[idxFR][0]) {
    const tmp = idxFL;
    idxFL = idxFR;
    idxFR = tmp;
  }
  const pFL = poly[idxFL];
  const pFR = poly[idxFR];
  const frontWidth = Math.hypot(pFR[0] - pFL[0], pFR[1] - pFL[1]);

  // 奥側の頂点
  const backPts = poly.filter(p => p[1] > frontY + 0.3);
  if (backPts.length < 1) {
    const depth = Math.max(4.0, frontWidth * 1.4);
    return [pFL, pFR, [pFR[0], frontY + depth], [pFL[0], frontY + depth]];
  }

  if (backPts.length === 1) {
    // 奥が1点（三角形敷地）:
    // 奥の尖った先端を切り落とし、内部に完全に収まる美しい台形（4頂点）にする
    const b = backPts[0];
    const H = b[1] - frontY;
    if (H >= 3.0) {
      const cutRatio = 0.74;
      const bL: Point = [pFL[0] + (b[0] - pFL[0]) * cutRatio, frontY + H * cutRatio];
      const bR: Point = [pFR[0] + (b[0] - pFR[0]) * cutRatio, frontY + H * cutRatio];
      return [pFL, pFR, bR, bL];
    } else {
      const bL: Point = [Math.max(pFL[0], b[0] - frontWidth * 0.2), b[1]];
      const bR: Point = [Math.min(pFR[0], b[0] + frontWidth * 0.2), b[1]];
      return [pFL, pFR, bR, bL];
    }
  }

  const sortedBack = backPts.slice().sort((a, b) => a[0] - b[0]);
  const pBL = sortedBack[0];
  const pBR = sortedBack[sortedBack.length - 1];
  const backWidth = Math.hypot(pBR[0] - pBL[0], pBR[1] - pBL[1]);

  // 奥の幅が極めて狭い場合（< 1.0m）も三角形にはせず、手前でカットして台形上辺を確保
  if (backWidth < 1.0) {
    const H = Math.max(pBL[1], pBR[1]) - frontY;
    if (H >= 3.0) {
      const cutRatio = 0.78;
      const bL: Point = [pFL[0] + (pBL[0] - pFL[0]) * cutRatio, frontY + H * cutRatio];
      const bR: Point = [pFR[0] + (pBR[0] - pFR[0]) * cutRatio, frontY + H * cutRatio];
      return [pFL, pFR, bR, bL];
    }
  }

  // それ以外はすべて安定した「台形（4頂点）」
  return [pFL, pFR, pBR, pBL];
}

function packStreetWall(
  block: Point[],
  fronts: Front[],
  options: FrontageOptions,
  rowDepth: number,
  rng: Rng
): Point[][] {
  const buildings: Point[][] = [];
  const reserved = fronts.map(() => [] as [number, number][]);
  const houseWidth = Math.max(5, Math.min(12, options.lotArea / Math.max(6, rowDepth)));
  for (let i = 0; i < fronts.length; i++) {
    for (let j = i + 1; j < fronts.length; j++) {
      const corner = perpendicularCorner(fronts[i], fronts[j]);
      if (!corner) continue;
      const size = Math.min(rowDepth, houseWidth * 1.2, fronts[i].length * 0.4, fronts[j].length * 0.4);
      if (size < 5) continue;
      const occupied = rng() < options.occupancy;
      rng();
      if (!occupied) continue;
      const inner = size - FRONT_Y;
      if (inner < 3) continue;
      const origin = add(add(corner.point, scale(corner.alongA, FRONT_Y)), scale(fronts[i].inward, FRONT_Y));
      const ua = scale(corner.alongA, inner),
        ub = scale(fronts[i].inward, inner);
      const rect: Point[] = [origin, add(origin, ua), add(add(origin, ua), ub), add(origin, ub)];
      const owned = [...rect, add(origin, add(scale(ua, 0.5), scale(ub, 0.5)))];
      if (owned.some(p => !insideConvex(p, block) || !ownedByFronts(p, fronts[i], fronts[j], fronts))) continue;
      if (buildings.some(b => overlapArea(rect, b) > 1e-4)) continue;
      buildings.push(rect);
      reserved[i].push(corner.spanA(size));
      reserved[j].push(corner.spanB(size));
    }
  }
  for (let f = 0; f < fronts.length; f++) {
    const front = fronts[f];
    let sector = block;
    for (const other of fronts) {
      if (other === front) continue;
      sector = clipHalfPlane(
        sector,
        [front.inward[0] - other.inward[0], front.inward[1] - other.inward[1]],
        front.offset - other.offset
      );
    }
    const local = sector.map(p => {
      const delta: Point = [p[0] - front.a[0], p[1] - front.a[1]];
      return [dot(delta, front.axis), dot(delta, front.inward)] as Point;
    });
    const band = clipHalfPlane(local, [0, 1], rowDepth);
    if (band.length < 3 || area(band) < 35) continue;
    const depth = Math.max(...band.map(p => p[1]));
    const width = Math.max(5, Math.min(Math.max(12, Math.sqrt(options.lotArea)), options.lotArea / Math.max(6, depth)));
    for (const [spanLo, spanHi] of openSpans(front.length, reserved[f])) {
      if (spanHi - spanLo < 5) continue;
      const count = Math.max(1, Math.min(256, Math.round((spanHi - spanLo) / width)));
      const weights = Array.from({ length: count }, () => rng.range(0.68, 1.42));
      const total = weights.reduce((a, b) => a + b, 0);
      let start = spanLo;
      for (let i = 0; i < count; i++) {
        const end = start + ((spanHi - spanLo) * weights[i]) / total;
        const lo = start + PARTY_GAP,
          hi = end - PARTY_GAP;
        start = end;
        const occupied = rng() < options.occupancy;
        rng();
        if (!occupied || hi - lo < 3) continue;
        const fitted = fitRectangle(band, lo, hi, FRONT_Y);
        if (!fitted) continue;
        const x0 = fitted.lo,
          x1 = fitted.hi;
        const fullDepth = fitted.back - FRONT_Y;
        // Classic fabric represents the built house, not the whole burgage
        // holding. Keep the frontage continuous while varying the shallow
        // rectangular house behind it.
        const compactDepth = options.compact ? Math.min(fullDepth, (x1 - x0) * rng.range(1.25, 2.15)) : fullDepth;
        const budget = (x1 - x0) * compactDepth * options.coverage;
        let low = FRONT_Y,
          high = FRONT_Y + compactDepth;
        for (let k = 0; k < 18; k++) {
          const mid = (low + high) / 2;
          if ((x1 - x0) * (mid - FRONT_Y) <= budget) low = mid;
          else high = mid;
        }
        if (low - FRONT_Y < 3 || x1 - x0 < 3) continue;
        const rect: Point[] = [
          toWorld(front, x0, FRONT_Y),
          toWorld(front, x1, FRONT_Y),
          toWorld(front, x1, low),
          toWorld(front, x0, low)
        ];
        if (buildings.some(b => overlapArea(rect, b) > 1e-4)) continue;
        buildings.push(rect);
      }
    }
  }
  return buildings;
}

function toWorld(front: Front, x: number, y: number): Point {
  return [front.a[0] + x * front.axis[0] + y * front.inward[0], front.a[1] + x * front.axis[1] + y * front.inward[1]];
}

function openSpans(length: number, reserved: [number, number][]): [number, number][] {
  const cuts = reserved
    .map(([a, b]) => [Math.max(0, a), Math.min(length, b)] as [number, number])
    .filter(([a, b]) => b - a > 1e-6)
    .sort((a, b) => a[0] - b[0]);
  const spans: [number, number][] = [];
  let x = 0;
  for (const [a, b] of cuts) {
    if (a - x >= 5) spans.push([x, a]);
    x = Math.max(x, b);
  }
  if (length - x >= 5) spans.push([x, length]);
  return spans;
}

function perpendicularCorner(a: Front, b: Front) {
  if (Math.abs(dot(a.axis, b.axis)) > 0.05) return null;
  const pairs: {
    point: Point;
    alongA: Point;
    alongB: Point;
    spanA: (s: number) => [number, number];
    spanB: (s: number) => [number, number];
  }[] = [];
  const end = (front: Front, atA: boolean): Point => (atA ? front.a : add(front.a, scale(front.axis, front.length)));
  for (const aAtStart of [true, false])
    for (const bAtStart of [true, false]) {
      const pa = end(a, aAtStart),
        pb = end(b, bAtStart);
      if (distance(pa, pb) > 1e-5) continue;
      const alongA: Point = aAtStart ? a.axis : [-a.axis[0], -a.axis[1]];
      const alongB: Point = bAtStart ? b.axis : [-b.axis[0], -b.axis[1]];
      if (dot(alongA, b.inward) < 0.94 || dot(alongB, a.inward) < 0.94) continue;
      pairs.push({
        point: pa,
        alongA,
        alongB,
        spanA: s => (aAtStart ? [0, s] : [a.length - s, a.length]),
        spanB: s => (bAtStart ? [0, s] : [b.length - s, b.length])
      });
    }
  return pairs[0] ?? null;
}

function maxYAt(poly: Point[], x: number): number {
  let best = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    if (Math.abs(a[0] - x) < 1e-9) best = Math.max(best, a[1]);
    const da = a[0] - x,
      db = b[0] - x;
    if (da * db < 0) {
      const t = da / (da - db);
      best = Math.max(best, a[1] + t * (b[1] - a[1]));
    }
  }
  return best;
}

function fitRectangle(
  lot: Point[],
  lo: number,
  hi: number,
  frontY: number
): { lo: number; hi: number; back: number } | null {
  const depthOf = (x0: number, x1: number) => Math.min(maxYAt(lot, x0), maxYAt(lot, x1)) - frontY;
  let a = lo,
    b = hi;
  if (depthOf(a, b) < 3) {
    if (maxYAt(lot, a) < maxYAt(lot, b)) {
      let loA = a,
        hiA = b;
      for (let k = 0; k < 20; k++) {
        const m = (loA + hiA) / 2;
        if (depthOf(m, b) >= 3) hiA = m;
        else loA = m;
      }
      a = hiA;
    } else {
      let loB = a,
        hiB = b;
      for (let k = 0; k < 20; k++) {
        const m = (loB + hiB) / 2;
        if (depthOf(a, m) >= 3) loB = m;
        else hiB = m;
      }
      b = loB;
    }
  }
  if (b - a < 3) return null;
  const back = frontY + depthOf(a, b);
  if (back - frontY < 3) return null;
  return { lo: a, hi: b, back };
}

function lineDist(p: Point, front: Front): number {
  return dot(p, front.inward) - front.offset;
}

function ownedByFronts(p: Point, a: Front, b: Front, fronts: Front[]): boolean {
  const nearest = fronts.reduce((best, f) => (lineDist(p, f) < lineDist(p, best) ? f : best));
  return nearest === a || nearest === b;
}

function overlapArea(a: Point[], b: Point[]): number {
  let result = a;
  const sign = -Math.sign(polygonArea(b));
  for (let i = 0; i < b.length && result.length >= 3; i++) {
    const p = b[i],
      q = b[(i + 1) % b.length];
    const n: Point = [sign * (q[1] - p[1]), sign * (p[0] - q[0])];
    result = clipHalfPlane(result, n, p[0] * n[0] + p[1] * n[1]);
  }
  return result.length >= 3 ? area(result) : 0;
}

function insideConvex(p: Point, poly: Point[]): boolean {
  const sign = -Math.sign(polygonArea(poly));
  if (!sign) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    if (sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < -1e-7) return false;
  }
  return true;
}
