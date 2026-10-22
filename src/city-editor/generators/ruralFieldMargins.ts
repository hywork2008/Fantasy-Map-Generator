import type { Point } from "../types/document";
import { isSimplePolygon, polygonArea } from "./geom";
import { triangularInfillParts } from "./lotGeometry";
import { bounds, boundsOverlap, intersectConvex } from "./parcelGeometry";

/** Replace raster margins with checked chords within a convex field envelope.
 * Envelope contacts stay fixed so independently clipped strips still meet.
 * Only rings within this envelope need overlap checks; envelopes are disjoint. */
export function straightenRuralMargins(
  rings: Point[][],
  envelope: Point[],
  quantum: number,
  clear: (polygon: Point[]) => boolean
): Point[][] {
  const current = [...rings];
  const parts = new WeakMap<Point[], { polygon: Point[]; box: ReturnType<typeof bounds> }[]>();
  const triangles = (ring: Point[]) => {
    let value = parts.get(ring);
    if (!value) {
      value = triangularInfillParts(ring).map(polygon => ({ polygon, box: bounds(polygon) }));
      parts.set(ring, value);
    }
    return value;
  };
  const checked = new Map<string, boolean>();
  const safe = (polygon: Point[]) => {
    const key = polygon
      .map(p => p.join(":"))
      .sort()
      .join("|");
    let value = checked.get(key);
    if (value === undefined) {
      value = clear(polygon);
      checked.set(key, value);
    }
    return value;
  };
  rings.forEach((ring, index) => {
    if (ring.length < 4) return;
    const contacts = ring.flatMap((p, i) =>
      envelope.some((a, j) => {
        const b = envelope[(j + 1) % envelope.length];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return length > 1e-7 && Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / length < 1e-6;
      })
        ? [i]
        : []
    );
    if (!contacts.length) contacts.push(0);
    if (contacts.length === 1) {
      const a = ring[contacts[0]];
      let far = contacts[0],
        distance = 0;
      ring.forEach((p, i) => {
        const d = Math.hypot(p[0] - a[0], p[1] - a[1]);
        if (d > distance) {
          far = i;
          distance = d;
        }
      });
      contacts.push(far);
      contacts.sort((a, b) => a - b);
    }
    const removed = new Set<number>();
    const replace = (ids: number[]) => {
      const deleted = new Set([...removed, ...ids]);
      const candidate = ring.filter((_, i) => !deleted.has(i));
      if (!isSimplePolygon(candidate, 150) || Math.sign(polygonArea(candidate)) !== Math.sign(polygonArea(ring)))
        return false;
      const pieces = triangles(candidate);
      if (!pieces.length || pieces.some(piece => !safe(piece.polygon))) return false;
      for (let j = 0; j < current.length; j++) {
        if (j === index || !boundsOverlap(bounds(candidate), bounds(current[j]))) continue;
        for (const a of pieces)
          for (const b of triangles(current[j]))
            if (boundsOverlap(a.box, b.box) && Math.abs(polygonArea(intersectConvex(a.polygon, b.polygon))) > 0.001)
              return false;
      }
      for (const id of ids) removed.add(id);
      current[index] = candidate;
      return true;
    };
    const simplify = (chain: number[], first: number, last: number) => {
      if (last - first < 2) return;
      const a = ring[chain[first]],
        b = ring[chain[last]];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy);
      let far = first + 1,
        deviation = -1;
      for (let i = first + 1; i < last; i++) {
        const p = ring[chain[i]];
        const d = length
          ? Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / length
          : Math.hypot(p[0] - a[0], p[1] - a[1]);
        if (d > deviation) {
          far = i;
          deviation = d;
        }
      }
      if (deviation <= quantum * 1.25 && replace(chain.slice(first + 1, last))) return;
      simplify(chain, first, far);
      simplify(chain, far, last);
    };
    contacts.forEach((start, i) => {
      let end = contacts[(i + 1) % contacts.length];
      if (end <= start) end += ring.length;
      const chain = Array.from({ length: end - start + 1 }, (_, n) => (start + n) % ring.length);
      simplify(chain, 0, chain.length - 1);
    });
  });
  return current;
}
