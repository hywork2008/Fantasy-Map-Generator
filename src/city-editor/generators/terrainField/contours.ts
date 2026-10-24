import type { Point } from "../../types/primitives";
import type { TerrainField } from "../../types/terrain";
import { CONTOUR_INTERVAL_METERS, ROCK_SLOPE } from "./constants";
import { fieldPoint, sampleField, slopeField } from "./sample";

export interface ContourLine {
  elevation: number;
  points: Point[];
}

function edgePoint(a: Point, az: number, b: Point, bz: number, level: number): Point {
  const t = az === bz ? 0 : (level - az) / (bz - az);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Contours of a height field at a fixed interval. Segments are chained within one cell width. */
export function fieldContours(field: TerrainField, interval = CONTOUR_INTERVAL_METERS): ContourLine[] {
  const segments: Array<{ elevation: number; a: Point; b: Point }> = [];
  const values = field.elevationsMeters;
  for (let row = 0; row < field.rows - 1; row++)
    for (let column = 0; column < field.columns - 1; column++) {
      const i = row * field.columns + column;
      const corners = [
        { point: fieldPoint(field, column, row), z: values[i] },
        { point: fieldPoint(field, column + 1, row), z: values[i + 1] },
        { point: fieldPoint(field, column + 1, row + 1), z: values[i + 1 + field.columns] },
        { point: fieldPoint(field, column, row + 1), z: values[i + field.columns] }
      ];
      const low = Math.min(...corners.map(corner => corner.z));
      const high = Math.max(...corners.map(corner => corner.z));
      for (let level = Math.ceil(low / interval) * interval; level < high - 1e-6; level += interval) {
        const hits: Point[] = [];
        for (let edge = 0; edge < 4; edge++) {
          const a = corners[edge];
          const b = corners[(edge + 1) % 4];
          if ((a.z - level) * (b.z - level) > 0 || a.z === b.z) continue;
          hits.push(edgePoint(a.point, a.z, b.point, b.z, level));
          if (hits.length === 2) break;
        }
        if (hits.length === 2) segments.push({ elevation: level, a: hits[0], b: hits[1] });
      }
    }
  return chain(segments, field.sampleMeters * 1.5);
}

function key(point: Point): string {
  return `${Math.round(point[0] * 10)},${Math.round(point[1] * 10)}`;
}

function chain(segments: Array<{ elevation: number; a: Point; b: Point }>, join: number): ContourLine[] {
  const byLevel = new Map<number, Array<{ a: Point; b: Point }>>();
  for (const segment of segments) {
    const list = byLevel.get(segment.elevation) ?? [];
    list.push(segment);
    byLevel.set(segment.elevation, list);
  }
  const lines: ContourLine[] = [];
  for (const [elevation, pieces] of byLevel) {
    const unused = new Set(pieces.map((_, index) => index));
    const links = new Map<string, number[]>();
    pieces.forEach((piece, index) => {
      for (const point of [piece.a, piece.b]) {
        const id = key(point);
        const list = links.get(id) ?? [];
        list.push(index);
        links.set(id, list);
      }
    });
    while (unused.size) {
      const start = unused.values().next().value!;
      unused.delete(start);
      const forward: Point[] = [pieces[start].a, pieces[start].b];
      const grow = (points: Point[], front: boolean) => {
        let guard = pieces.length;
        while (guard--) {
          const end = front ? points[0] : points[points.length - 1];
          const next = (links.get(key(end)) ?? []).find(index => unused.has(index));
          if (next === undefined) break;
          unused.delete(next);
          const piece = pieces[next];
          const other = Math.hypot(piece.a[0] - end[0], piece.a[1] - end[1]) <= join ? piece.b : piece.a;
          if (front) points.unshift(other);
          else points.push(other);
        }
      };
      grow(forward, false);
      grow(forward, true);
      if (forward.length >= 2) lines.push({ elevation, points: forward });
    }
  }
  return lines;
}

/** Short ticks on ground steeper than 45 degrees, pointing downhill. */
export function fieldHachures(field: TerrainField, stepMeters = 12): Array<[Point, Point]> {
  const ticks: Array<[Point, Point]> = [];
  const step = Math.max(field.sampleMeters, stepMeters);
  for (let y = field.origin[1]; y <= field.origin[1] + (field.rows - 1) * field.sampleMeters; y += step)
    for (let x = field.origin[0]; x <= field.origin[0] + (field.columns - 1) * field.sampleMeters; x += step) {
      const point: Point = [x, y];
      if (slopeField(field, point) < ROCK_SLOPE) continue;
      const probe = Math.min(1, field.sampleMeters);
      const zx = (sampleField(field, [x + probe, y]) - sampleField(field, [x - probe, y])) / (2 * probe);
      const zy = (sampleField(field, [x, y + probe]) - sampleField(field, [x, y - probe])) / (2 * probe);
      const length = Math.hypot(zx, zy) || 1;
      const reach = 3.5;
      ticks.push([point, [x - (zx / length) * reach, y - (zy / length) * reach]]);
    }
  return ticks;
}
