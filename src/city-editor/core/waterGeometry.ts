import { footprintTouchesWater } from "../../services/riverPhysicalGeometry";
import {
  FIXED_SITE_CROSSING_BUDGETS,
  type FixedBurgCrossings,
  validFixedBurgCrossings
} from "../../utils/fixedBurgCrossings";
import { requiredSiteExtent } from "../../utils/requiredSiteBounds";
import { nearestOnPolyline, pointInPolygon, segmentSegmentHit } from "./gen/geom";
import { convexInfillParts, triangularInfillParts } from "./gen/lotGeometry";
import { bounds, boundsOverlap, intersectConvex, plotArea, subtractConvex } from "./gen/parcelGeometry";
import { regionalCoastalWaterPolygons } from "./regionalCoast";
import type { CityDocument, Point } from "./types";

const importedWaterParts = new WeakMap<FixedBurgCrossings, Point[][]>();

/** Source rings use even/odd filling, so islands remain dry. Imported surveys
 * are immutable; replacing the survey invalidates this derived geometry. */
export function fixedWaterPolygons(fixed: FixedBurgCrossings): Point[][] {
  const cached = importedWaterParts.get(fixed);
  if (cached) return cached;
  const polygons = [...fixed.rivers, ...(fixed.obstacles ?? [])].flatMap(body => {
    const rings = body.rings.map(ring => ring.map(p => [p[0], p[1]] as Point));
    const depths = rings.map((ring, i) => rings.filter((other, j) => i !== j && pointInPolygon(ring[0], other)).length);
    return rings.flatMap((ring, i) => {
      if (depths[i] % 2) return [];
      let parts = triangularInfillParts(ring);
      for (const [j, hole] of rings.entries()) {
        if (depths[j] !== depths[i] + 1 || !pointInPolygon(hole[0], ring)) continue;
        for (const wetHole of triangularInfillParts(hole))
          parts = parts.flatMap(part => subtractConvex(part, wetHole, 0.001));
      }
      return parts;
    });
  });
  const box = fixed.schemaVersion === 3 || fixed.schemaVersion === 4 ? fixed.coverageBounds : undefined;
  const frame: Point[] | undefined = box
    ? [
        [box.minX, box.minY],
        [box.maxX, box.minY],
        [box.maxX, box.maxY],
        [box.minX, box.maxY]
      ]
    : undefined;
  const local = frame
    ? polygons.map(part => intersectConvex(part, frame)).filter(part => part.length >= 3 && plotArea(part) > 0.001)
    : polygons;
  importedWaterParts.set(fixed, local);
  return local;
}

/** The imported water boundary is independent of editing-cell resolution. */
export function waterPolygons(document: CityDocument): Point[][] {
  return [
    ...regionalCoastalWaterPolygons(document),
    ...(document.waterAreas ?? []).map(area => area.polygon),
    ...(document.importedFixedCrossings ? fixedWaterPolygons(document.importedFixedCrossings) : [])
  ];
}

function interior(point: Point, polygon: Point[]): boolean {
  return pointInPolygon(point, polygon) && nearestOnPolyline(point, [...polygon, polygon[0]]).dist > 1e-6;
}

function wetInterior(point: Point, polygons: readonly Point[][]): boolean {
  if (polygons.some(polygon => interior(point, polygon))) return true;
  // Decomposed imported water has internal seams. A point surrounded by
  // water is wet even when it lies on every individual piece's boundary.
  const nearby = polygons.filter(polygon => nearestOnPolyline(point, [...polygon, polygon[0]]).dist <= 1e-6);
  return (
    nearby.length > 1 &&
    [
      [1e-5, 0],
      [-1e-5, 0],
      [0, 1e-5],
      [0, -1e-5]
    ].every(([x, y]) => nearby.some(polygon => pointInPolygon([point[0] + x, point[1] + y], polygon)))
  );
}

/** Split at every bank intersection, including narrow channels and concave bends.
 * Boundary-only contact stays dry. */
export function dryRuns(line: Point[], polygons: readonly Point[][]): Point[][] {
  if (line.length < 2) return [];
  const runs: Point[][] = [];
  let current: Point[] = [];
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i];
    const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const cuts = [0, 1];
    for (const polygon of polygons)
      for (let j = 0; j < polygon.length; j++) {
        const hit = segmentSegmentHit(a, b, polygon[j], polygon[(j + 1) % polygon.length]);
        if (hit) cuts.push(hit.t);
      }
    const sorted = [...new Set(cuts)].sort((x, y) => x - y);
    for (let j = 1; j < sorted.length; j++) {
      const start = sorted[j - 1],
        end = sorted[j];
      if (end - start < 1e-9) continue;
      if (wetInterior(at((start + end) / 2), polygons)) {
        flush();
        continue;
      }
      if (!current.length) current.push(at(start));
      current.push(at(end));
    }
  }
  flush();
  return runs;
}

export function lineHitsWater(line: Point[], polygons: readonly Point[][]): boolean {
  if (!polygons.length || line.length < 2) return false;
  const length = (runs: Point[][]) =>
    runs.reduce(
      (sum, run) => sum + run.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - run[i][0], p[1] - run[i][1]), 0),
      0
    );
  return length(dryRuns(line, polygons)) < length([line]) - 1e-5;
}

const parts = new WeakMap<Point[], Point[][]>();
function convexParts(polygon: Point[]): Point[][] {
  let value = parts.get(polygon);
  if (!value) {
    value = convexInfillParts(polygon);
    parts.set(polygon, value);
  }
  return value;
}

export function polygonHitsWater(polygon: Point[], polygons: readonly Point[][]): boolean {
  const box = bounds(polygon);
  return polygons.some(
    water =>
      boundsOverlap(box, bounds(water)) &&
      convexParts(polygon).some(p => convexParts(water).some(w => plotArea(intersectConvex(p, w)) > 0.001))
  );
}

/** Partial cells remain land; exact polygons reserve their wet portion. */
export function cellInsideWater(polygon: Point[], water: Point[]): boolean {
  const area = plotArea(polygon);
  if (area < 0.001) return false;
  const wetArea = convexParts(polygon).reduce(
    (sum, piece) => sum + convexParts(water).reduce((n, part) => n + plotArea(intersectConvex(piece, part)), 0),
    0
  );
  return wetArea >= area - 0.001;
}

const fixedWaterChecks = new WeakMap<FixedBurgCrossings, { valid: boolean }>();

/** Throws unless the fixed payload is valid and covers the city frame.
 * The payload is copy-on-write, so the same object is validated once. */
function validateFixedWater(document: CityDocument, fixed: FixedBurgCrossings): void {
  if (!fixed || typeof fixed !== "object") throw new RangeError("Invalid fixed water geometry or city frame");
  let checked = fixedWaterChecks.get(fixed);
  if (!checked) {
    checked = { valid: validFixedBurgCrossings(fixed, FIXED_SITE_CROSSING_BUDGETS) };
    fixedWaterChecks.set(fixed, checked);
  }
  if (
    !checked.valid ||
    !Number.isFinite(document.frame.extentMeters) ||
    document.frame.extentMeters <= 0 ||
    requiredSiteExtent(fixed.requiredBounds) > document.frame.extentMeters
  )
    throw new RangeError("Invalid fixed water geometry or city frame");
  if (fixed.schemaVersion === 3 || fixed.schemaVersion === 4) {
    const coverage = fixed.coverageBounds,
      half = document.frame.extentMeters / 2;
    if (!coverage || coverage.minX > -half || coverage.minY > -half || coverage.maxX < half || coverage.maxY < half)
      throw new RangeError("Fixed water coverage does not contain city frame");
  }
}

export type DocumentWaterTest = (polygon: Point[]) => boolean;

type MovingWater = Parameters<typeof footprintTouchesWater>[1];

interface FrozenMovingWater {
  lengths: number[];
  coords: Float64Array;
  frozen: MovingWater;
}

const frozenMovingWater = new WeakMap<object, FrozenMovingWater>();

function sameMovingRings(cached: FrozenMovingWater, body: MovingWater): boolean {
  if (body.rings.length !== cached.lengths.length) return false;
  let cursor = 0;
  for (let ringIndex = 0; ringIndex < body.rings.length; ringIndex++) {
    const ring = body.rings[ringIndex];
    if (ring.length !== cached.lengths[ringIndex]) return false;
    for (const point of ring) {
      if (cached.coords[cursor++] !== point[0] || cached.coords[cursor++] !== point[1]) return false;
    }
  }
  return true;
}

/** A frozen ring copy so the water edge index can be built without freezing the caller's survey.
 * The copy is reused while the source coordinates stay put, including across separate tests. */
function freezeMovingWater(body: MovingWater): MovingWater {
  if (
    Object.isFrozen(body) &&
    Object.isFrozen(body.rings) &&
    body.rings.every(ring => Object.isFrozen(ring) && ring.every(point => Object.isFrozen(point)))
  )
    return body;
  const cached = frozenMovingWater.get(body);
  if (cached && sameMovingRings(cached, body)) return cached.frozen;
  let count = 0;
  for (const ring of body.rings) count += ring.length;
  const coords = new Float64Array(count * 2);
  const lengths: number[] = [];
  let cursor = 0;
  for (const ring of body.rings) {
    lengths.push(ring.length);
    for (const point of ring) {
      coords[cursor++] = point[0];
      coords[cursor++] = point[1];
    }
  }
  const frozen = Object.freeze({
    ...body,
    rings: Object.freeze(
      body.rings.map(ring => Object.freeze(ring.map(point => Object.freeze([point[0], point[1]] as [number, number]))))
    )
  });
  frozenMovingWater.set(body, { lengths, coords, frozen });
  return frozen;
}

/** `polygonHitsDocumentWater` for a run of footprints over a document that does not change
 * meanwhile. The fixed payload is validated once, and still water — regional sea included —
 * is gathered once on first use, instead of once per footprint (Chalbianos). */
export function documentWaterTest(document: CityDocument): DocumentWaterTest {
  let prepared: {
    fixed: FixedBurgCrossings;
    still: Point[][];
    moving: Parameters<typeof footprintTouchesWater>[1][];
  } | null = null;
  let plain: Point[][] | undefined;
  return polygon => {
    if (polygon.length < 3 || polygon.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v)))) return true;
    const fixed = document.importedFixedCrossings;
    if (fixed === undefined) {
      plain ??= waterPolygons(document);
      return polygonHitsWater(polygon, plain);
    }
    let water = prepared;
    if (water?.fixed !== fixed) {
      validateFixedWater(document, fixed);
      water = prepared = {
        fixed,
        still: [...regionalCoastalWaterPolygons(document), ...(document.waterAreas ?? []).map(area => area.polygon)],
        // Frozen copies keep the caller's rings editable and let the edge index serve every lot.
        moving: [...fixed.rivers, ...(fixed.obstacles ?? [])].map(freezeMovingWater)
      };
    }
    if (fixed.schemaVersion === 3 || fixed.schemaVersion === 4) {
      const coverage = fixed.coverageBounds!;
      if (polygon.some(([x, y]) => x < coverage.minX || x > coverage.maxX || y < coverage.minY || y > coverage.maxY))
        return true;
    }
    return polygonHitsWater(polygon, water.still) || water.moving.some(body => footprintTouchesWater(polygon, body));
  };
}

/** Whole-footprint reservation against source rivers, including holes/islands.
 * Invalid source/frame must stop placement rather than turn into empty water. */
export function polygonHitsDocumentWater(document: CityDocument, polygon: Point[]): boolean {
  return documentWaterTest(document)(polygon);
}

/** Reserve the whole stroke, including round joins and terminal caps.
 * Reject the complete run instead of creating disconnected clipped pieces. */
export function lineHitsDocumentWater(
  document: CityDocument,
  points: readonly Point[],
  widthMeters: number,
  clipAtFrame = false,
  test: DocumentWaterTest = documentWaterTest(document)
): boolean {
  if (
    !Number.isFinite(widthMeters) ||
    widthMeters <= 0 ||
    points.length < 2 ||
    points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v)))
  )
    return true;
  const frameHalf = document.frame.extentMeters / 2;
  if (
    clipAtFrame &&
    (!Number.isFinite(frameHalf) || frameHalf <= 0 || points.some(p => p.some(v => v < -frameHalf || v > frameHalf)))
  )
    return true;
  const hits = (polygon: Point[]) => {
    if (!clipAtFrame) return test(polygon);
    // Viewport clipping removes the external cap, not a water crossing.
    // Centreline nodes must stay inside the measured frame above; an unknown
    // outside region can never provide a detour around an internal barrier.
    let clipped = polygon;
    for (const axis of [0, 1])
      for (const sign of [-1, 1]) {
        const next: Point[] = [];
        const bound = sign * frameHalf;
        for (let i = 0; i < clipped.length; i++) {
          const a = clipped[i],
            b = clipped[(i + 1) % clipped.length];
          const aInside = sign * a[axis] <= frameHalf,
            bInside = sign * b[axis] <= frameHalf;
          if (aInside) next.push(a);
          if (aInside !== bInside) {
            const t = (bound - a[axis]) / (b[axis] - a[axis]);
            const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            p[axis] = bound;
            next.push(p);
          }
        }
        clipped = next;
      }
    return clipped.length < 3 || test(clipped);
  };
  const half = widthMeters / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    if (!Number.isFinite(length)) return true;
    if (!length) {
      if (
        hits([
          [a[0] - half, a[1] - half],
          [a[0] + half, a[1] - half],
          [a[0] + half, a[1] + half],
          [a[0] - half, a[1] + half]
        ])
      )
        return true;
      continue;
    }
    const t = [dx / length, dy / length],
      n = [-t[1], t[0]];
    const rectangle = [
      [-half, -half],
      [-half, half],
      [length + half, half],
      [length + half, -half]
    ].map(([x, y]) => [a[0] + t[0] * x + n[0] * y, a[1] + t[1] * x + n[1] * y] as Point);
    if (hits(rectangle)) return true;
  }
  return false;
}
