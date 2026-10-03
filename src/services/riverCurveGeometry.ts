import { curveCatmullRom, path } from "d3";
import { RIVER_GEOMETRY_TOLERANCE, type RiverPoint } from "./riverGeometry";

export type RiverCubic = readonly [RiverPoint, RiverPoint, RiverPoint, RiverPoint];
export interface RiverCurvePrecision {
  arcToleranceMeters: number;
  maxIntegrationDepth: number;
  maxEvaluations: number;
}
interface ArcLeaf {
  t0: number;
  t1: number;
  arcStart: number;
  length: number;
}
interface CubicSegment {
  index: number;
  controls: RiverCubic;
  arcStart: number;
  length: number;
  leaves: ArcLeaf[];
}
export interface CubicRiverAxis {
  kind: "cubicBezier";
  riverId: number;
  geometryVersion: number;
  length: number;
  segments: readonly CubicSegment[];
  precision: RiverCurvePrecision;
}
export type CurveBuildResult = { axis: CubicRiverAxis } | { reason: "invalid-curve" | "integration-budget" };
const epsilon = RIVER_GEOMETRY_TOLERANCE;
const delta = (a: RiverPoint, b: RiverPoint): RiverPoint => [a[0] - b[0], a[1] - b[1]];
const size = (p: RiverPoint) => Math.hypot(...p);
const unit = (p: RiverPoint): RiverPoint | null => (size(p) > epsilon ? [p[0] / size(p), p[1] / size(p)] : null);
export function evaluateRiverCubic(c: RiverCubic, t: number) {
  const v = 1 - t;
  const point: RiverPoint = [0, 1].map(
    i => v ** 3 * c[0][i] + 3 * v * v * t * c[1][i] + 3 * v * t * t * c[2][i] + t ** 3 * c[3][i]
  ) as [number, number];
  const derivative: RiverPoint = [0, 1].map(
    i => 3 * v * v * (c[1][i] - c[0][i]) + 6 * v * t * (c[2][i] - c[1][i]) + 3 * t * t * (c[3][i] - c[2][i])
  ) as [number, number];
  const second: RiverPoint = [0, 1].map(
    i => 6 * v * (c[2][i] - 2 * c[1][i] + c[0][i]) + 6 * t * (c[3][i] - 2 * c[2][i] + c[1][i])
  ) as [number, number];
  return { point, derivative, second };
}
function endpointTangent(c: RiverCubic, end: boolean): RiverPoint | null {
  const origin = end ? c[3] : c[0];
  for (const p of end ? [c[2], c[1], c[0]] : [c[1], c[2], c[3]]) {
    const tangent = unit(end ? delta(origin, p) : delta(p, origin));
    if (tangent) return tangent;
  }
  return null;
}
function quadraticRoots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) <= epsilon) return Math.abs(b) <= epsilon ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}
function hasInteriorStationaryPoint(c: RiverCubic): boolean {
  const roots = [0, 1].flatMap(i =>
    quadraticRoots(
      -c[0][i] + 3 * c[1][i] - 3 * c[2][i] + c[3][i],
      2 * (c[0][i] - 2 * c[1][i] + c[2][i]),
      c[1][i] - c[0][i]
    )
  );
  return roots.some(t => t > 0 && t < 1 && size(evaluateRiverCubic(c, t).derivative) <= epsilon);
}
interface IntegrationBudget {
  remaining: number;
  failed: boolean;
}
function integrate(
  c: RiverCubic,
  lo: number,
  hi: number,
  tolerance: number,
  depth: number,
  budget: IntegrationBudget
): ArcLeaf[] | null {
  const speed = (t: number) => {
    if (--budget.remaining < 0) {
      budget.failed = true;
      return NaN;
    }
    return size(evaluateRiverCubic(c, t).derivative);
  };
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) => ((b - a) * (fa + 4 * fm + fb)) / 6;
  const leaves: ArcLeaf[] = [];
  let arc = 0;
  function visit(
    a: number,
    b: number,
    fa: number,
    fm: number,
    fb: number,
    estimate: number,
    tol: number,
    remaining: number
  ): boolean {
    const m = (a + b) / 2,
      fl = speed((a + m) / 2),
      fr = speed((m + b) / 2);
    if (budget.failed || !Number.isFinite(fl + fr)) return false;
    const left = simpson(a, m, fa, fl, fm),
      right = simpson(m, b, fm, fr, fb);
    const error = left + right - estimate;
    if (Math.abs(error) <= 15 * tol) {
      const length = left + right + error / 15;
      if (!Number.isFinite(length) || length < 0) return false;
      leaves.push({ t0: a, t1: b, arcStart: arc, length });
      arc += length;
      return Number.isFinite(arc);
    }
    if (remaining === 0) {
      budget.failed = true;
      return false;
    }
    return (
      visit(a, m, fa, fl, fm, left, tol / 2, remaining - 1) && visit(m, b, fm, fr, fb, right, tol / 2, remaining - 1)
    );
  }
  if (lo === hi) return [];
  const a = speed(lo),
    m = speed((lo + hi) / 2),
    b = speed(hi);
  return visit(lo, hi, a, m, b, simpson(lo, hi, a, m, b), tolerance, depth) ? leaves : null;
}
export function buildCubicRiverAxis(
  riverId: number,
  geometryVersion: number,
  curves: readonly RiverCubic[],
  precision: RiverCurvePrecision
): CurveBuildResult {
  if (
    !curves.length ||
    !Number.isFinite(precision.arcToleranceMeters) ||
    precision.arcToleranceMeters <= 0 ||
    !Number.isSafeInteger(precision.maxIntegrationDepth) ||
    precision.maxIntegrationDepth < 0 ||
    precision.maxIntegrationDepth > 30 ||
    !Number.isSafeInteger(precision.maxEvaluations) ||
    precision.maxEvaluations < 5
  )
    return { reason: "invalid-curve" };
  const budget: IntegrationBudget = { remaining: precision.maxEvaluations, failed: false };
  const segments: CubicSegment[] = [];
  let length = 0;
  for (let index = 0; index < curves.length; index++) {
    const c = curves[index];
    if (
      c.some(p => p.some(v => !Number.isFinite(v))) ||
      !endpointTangent(c, false) ||
      !endpointTangent(c, true) ||
      hasInteriorStationaryPoint(c) ||
      (index && size(delta(curves[index - 1][3], c[0])) > epsilon)
    )
      return { reason: "invalid-curve" };
    const controls = c.map(p => [...p]) as unknown as RiverCubic;
    const leaves = integrate(
      controls,
      0,
      1,
      precision.arcToleranceMeters / curves.length,
      precision.maxIntegrationDepth,
      budget
    );
    if (!leaves) return { reason: budget.failed ? "integration-budget" : "invalid-curve" };
    const segmentLength = leaves.reduce((sum, leaf) => sum + leaf.length, 0);
    if (segmentLength <= epsilon || !Number.isFinite(length + segmentLength)) return { reason: "invalid-curve" };
    segments.push({ index, controls, leaves, length: segmentLength, arcStart: length });
    length += segmentLength;
  }
  return { axis: { kind: "cubicBezier", riverId, geometryVersion, segments, length, precision: { ...precision } } };
}
/** Capture d3's actual Catmull–Rom cubics; no renderer-specific approximate formula. */
export function buildCatmullRomRiverAxis(
  riverId: number,
  geometryVersion: number,
  points: readonly RiverPoint[],
  alpha: number,
  precision: RiverCurvePrecision
): CurveBuildResult {
  if (
    points.length < 2 ||
    points.some(p => p.some(v => !Number.isFinite(v))) ||
    !Number.isFinite(alpha) ||
    alpha < 0 ||
    alpha > 1
  )
    return { reason: "invalid-curve" };
  const curves: RiverCubic[] = [];
  let current: RiverPoint = points[0];
  const context = path();
  context.moveTo = (x, y) => {
    current = [x, y];
  };
  context.lineTo = (x, y) => {
    const end: RiverPoint = [x, y];
    curves.push([
      current,
      [current[0] + (x - current[0]) / 3, current[1] + (y - current[1]) / 3],
      [current[0] + (2 * (x - current[0])) / 3, current[1] + (2 * (y - current[1])) / 3],
      end
    ]);
    current = end;
  };
  context.bezierCurveTo = (x1, y1, x2, y2, x, y) => {
    const end: RiverPoint = [x, y];
    curves.push([current, [x1, y1], [x2, y2], end]);
    current = end;
  };
  const curve = curveCatmullRom.alpha(alpha)(context);
  curve.lineStart();
  for (const p of points) curve.point(p[0], p[1]);
  curve.lineEnd();
  return buildCubicRiverAxis(riverId, geometryVersion, curves, precision);
}
/** Arc inversion uses integrated speed. Rendering subdivisions never define tRiver. */
export function evaluateCubicRiverAxis(axis: CubicRiverAxis, arcLength: number) {
  if (!Number.isFinite(arcLength) || arcLength < 0 || arcLength > axis.length) return null;
  const segment = axis.segments.find(s => arcLength <= s.arcStart + s.length);
  if (!segment) return null;
  const local = arcLength - segment.arcStart;
  const leaf = segment.leaves.find(l => local <= l.arcStart + l.length) ?? segment.leaves.at(-1)!;
  const target = local - leaf.arcStart;
  let t = target <= 0 ? leaf.t0 : target >= leaf.length ? leaf.t1 : (leaf.t0 + leaf.t1) / 2;
  if (target > 0 && target < leaf.length) {
    let lo = leaf.t0,
      hi = leaf.t1;
    const budget: IntegrationBudget = { remaining: axis.precision.maxEvaluations, failed: false };
    for (let iteration = 0; iteration < 60; iteration++) {
      t = (lo + hi) / 2;
      const parts = integrate(
        segment.controls,
        leaf.t0,
        t,
        axis.precision.arcToleranceMeters / 4,
        axis.precision.maxIntegrationDepth,
        budget
      );
      if (!parts) return null;
      const distance = parts.reduce((sum, p) => sum + p.length, 0);
      if (Math.abs(distance - target) <= axis.precision.arcToleranceMeters) break;
      if (distance < target) lo = t;
      else hi = t;
      if (iteration === 59) return null;
    }
  }
  const value = evaluateRiverCubic(segment.controls, t);
  const tangent = unit(value.derivative) ?? (t === 0 || t === 1 ? endpointTangent(segment.controls, t === 1) : null);
  if (!tangent) return null;
  const speed = size(value.derivative);
  const curvature =
    speed > epsilon ? (value.derivative[0] * value.second[1] - value.derivative[1] * value.second[0]) / speed ** 3 : 0;
  return {
    segmentIndex: segment.index,
    arcLength,
    parameter: t,
    point: value.point,
    tangent,
    normal: [-tangent[1], tangent[0]] as RiverPoint,
    curvature
  };
}
export function sampleCubicRiverAxis(axis: CubicRiverAxis, arcLength: number, window = 0) {
  if (!Number.isFinite(window) || window < 0 || arcLength <= window || arcLength >= axis.length - window) return null;
  // Cubic joins may encode a genuine corner; never average its two tangents.
  for (let i = 1; i < axis.segments.length; i++) {
    const join = axis.segments[i].arcStart;
    if (Math.abs(join - arcLength) > window) continue;
    const before = endpointTangent(axis.segments[i - 1].controls, true)!;
    const after = endpointTangent(axis.segments[i].controls, false)!;
    if (size(delta(before, after)) > epsilon) return null;
  }
  return evaluateCubicRiverAxis(axis, arcLength);
}
