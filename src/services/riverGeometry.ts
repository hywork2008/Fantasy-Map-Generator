/** Geometry primitives for an explicitly piecewise-linear, downstream-oriented axis.
 * A sampled smooth curve must supply its own derivative; it is not this representation.
 * Coordinates and arc lengths use the caller's units (physical consumers use metres).
 */
export type RiverPoint = readonly [number, number];
export const RIVER_GEOMETRY_TOLERANCE = 1e-9;
export interface RiverAxisSegment {
  index: number;
  start: RiverPoint;
  end: RiverPoint;
  arcStart: number;
  length: number;
  tangent: RiverPoint;
}
export interface RiverAxis {
  riverId: number;
  geometryVersion: number;
  segments: readonly RiverAxisSegment[];
  length: number;
}
export function buildPolylineRiverAxis(
  riverId: number,
  geometryVersion: number,
  points: readonly RiverPoint[]
): RiverAxis | null {
  if (points.length < 2 || points.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  const segments: RiverAxisSegment[] = [];
  let length = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = [...points[index]] as [number, number];
    const end = [...points[index + 1]] as [number, number];
    const dx = end[0] - start[0],
      dy = end[1] - start[1];
    const size = Math.hypot(dx, dy);
    if (size === 0) continue;
    segments.push({ index, start, end, arcStart: length, length: size, tangent: [dx / size, dy / size] });
    length += size;
  }
  return segments.length ? { riverId, geometryVersion, segments, length } : null;
}
/** Reject corners and endpoints when the required local window is not straight. */
export function samplePolylineRiverAxis(axis: RiverAxis, arcLength: number, window = 0) {
  if (
    !Number.isFinite(arcLength) ||
    !Number.isFinite(window) ||
    window < 0 ||
    arcLength <= window ||
    arcLength >= axis.length - window
  )
    return null;
  const active = axis.segments.filter(
    s => s.arcStart <= arcLength + window && s.arcStart + s.length >= arcLength - window
  );
  const segment = active.find(s => arcLength >= s.arcStart && arcLength <= s.arcStart + s.length);
  if (
    !segment ||
    active.some(
      s => Math.hypot(s.tangent[0] - segment.tangent[0], s.tangent[1] - segment.tangent[1]) > RIVER_GEOMETRY_TOLERANCE
    )
  )
    return null;
  const distance = arcLength - segment.arcStart;
  return {
    segmentIndex: segment.index,
    arcLength,
    point: [
      segment.start[0] + distance * segment.tangent[0],
      segment.start[1] + distance * segment.tangent[1]
    ] as RiverPoint,
    tangent: segment.tangent,
    normal: [-segment.tangent[1], segment.tangent[0]] as RiverPoint
  };
}
