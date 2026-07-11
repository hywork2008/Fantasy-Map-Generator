import Alea from "alea";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";

export interface CoastlineSettings {
  enabled: boolean; // master toggle — false bypasses all fractalization
  maxDepth: number; // max recursion depth per edge
  baseAmplitude: number; // peak displacement (scales with √edgeLength)
  amplitudeDecay: number; // amplitude multiplier per recursion level
  minEdge: number; // edges shorter than this are never subdivided
  smoothThreshold: number; // profile values below this → zero displacement
  roughnessContrast: number; // power applied to normalised roughness profile
  profileHarmonics: number; // cosine harmonics → rough-zone count (1 = one big zone, 8 = many small)
  lakeSmoothThreshMult: number; // smooth-threshold multiplier for lake shores (1 = same as ocean, higher = calmer)
}

export const defaultCoastSettings: CoastlineSettings = {
  enabled: true,
  maxDepth: 4,
  baseAmplitude: 1.5,
  amplitudeDecay: 0.9,
  minEdge: 1,
  smoothThreshold: 0.25,
  roughnessContrast: 1.5,
  profileHarmonics: 4,
  lakeSmoothThreshMult: 2.0
};

export const PROFILE_SIZE = 256;

// Build a smooth closed roughness envelope via sum-of-cosine harmonics.
// Intrinsically seam-free; result raised to `contrast` power for calm/rough contrast.
export function makeRoughnessProfile(
  _worldContext: Readonly<WorldContext>,
  _viewContext: Readonly<ViewContext>,
  _appServices: AppServices,
  rand: () => number,
  _contrast: number,
  _numHarmonics = 4
): Float32Array {
  const profile = new Float32Array(PROFILE_SIZE);
  for (let k = 1; k <= _numHarmonics; k++) {
    const amp = rand();
    const phase = rand() * Math.PI * 2;
    for (let i = 0; i < PROFILE_SIZE; i++) {
      profile[i] += amp * Math.cos((2 * Math.PI * k * i) / PROFILE_SIZE + phase);
    }
  }
  let min = Infinity,
    max = -Infinity;
  for (const v of profile) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  for (let i = 0; i < PROFILE_SIZE; i++) {
    profile[i] = ((profile[i] - min) / range) ** _contrast;
  }
  return profile;
}

/** Linear interpolation into the envelope at normalised perimeter position t ∈ [0, 1). */
function sampleProfile(profile: Float32Array, _t: number): number {
  const pos = (((_t % 1) + 1) % 1) * PROFILE_SIZE;
  const i = Math.floor(pos) % PROFILE_SIZE;
  const f = pos - Math.floor(pos);
  return profile[i] * (1 - f) + profile[(i + 1) % PROFILE_SIZE] * f;
}

/** Circular midpoint of two normalised perimeter positions, handling the 0/1 seam. */
function midT(t0: number, _t1: number): number {
  const diff = _t1 - t0;
  if (Math.abs(diff) <= 0.5) return t0 + diff / 2;
  const t = t0 + (diff - Math.sign(diff)) / 2;
  return ((t % 1) + 1) % 1;
}

/** Recursively subdivide an edge, inserting displaced midpoints in rough zones. */
function subdivideEdge(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t0: number,
  t1: number,
  depth: number,
  amplitude: number,
  profile: Float32Array,
  rand: () => number,
  resultPts: [number, number][],
  settings: CoastlineSettings
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (depth === 0 || len < settings.minEdge) return;

  const tm = midT(t0, t1);
  const roughness = sampleProfile(profile, tm);
  if (roughness < settings.smoothThreshold) return;

  const px = -dy / len;
  const py = dx / len;
  const disp = (rand() - 0.5) * Math.sqrt(len) * amplitude * roughness;
  const mx = (x0 + x1) / 2 + px * disp;
  const my = (y0 + y1) / 2 + py * disp;

  const nextAmp = amplitude * settings.amplitudeDecay;
  subdivideEdge(x0, y0, mx, my, t0, tm, depth - 1, nextAmp, profile, rand, resultPts, settings);
  resultPts.push([mx, my]);
  subdivideEdge(mx, my, x1, y1, tm, t1, depth - 1, nextAmp, profile, rand, resultPts, settings);
}

export interface FractalizedShape {
  points: [number, number][];
  origIndices: number[]; // index in points[] where original vertex i lives
}

export function fractalizeCoastline(
  worldContext: Readonly<WorldContext>,
  _viewContext: Readonly<ViewContext>,
  _appServices: AppServices,
  points: [number, number][],
  _featureIndex: number,
  _featureType: "ocean" | "lake" | "island" = "island"
): FractalizedShape {
  if (points.length < 3) return { points, origIndices: points.map((_, i) => i) };
  if (!defaultCoastSettings.enabled) return { points, origIndices: points.map((_, i) => i) };
  const rand = Alea(`${worldContext.seed}_c${_featureIndex}`);
  const settings =
    _featureType === "lake" && defaultCoastSettings.lakeSmoothThreshMult !== 1
      ? {
          ...defaultCoastSettings,
          smoothThreshold: Math.min(1, defaultCoastSettings.smoothThreshold * defaultCoastSettings.lakeSmoothThreshMult)
        }
      : defaultCoastSettings;
  return fractalize(worldContext, _viewContext, _appServices, points, rand, settings);
}

export function fractalize(
  worldContext: Readonly<WorldContext>,
  _viewContext: Readonly<ViewContext>,
  _appServices: AppServices,
  points: [number, number][],
  rand: () => number,
  settings: CoastlineSettings
): FractalizedShape {
  const profile = makeRoughnessProfile(
    worldContext,
    _viewContext,
    _appServices,
    rand,
    settings.roughnessContrast,
    settings.profileHarmonics
  );

  const n = points.length;
  let total = 0;
  const segLens = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    const dx = x1 - x0;
    const dy = y1 - y0;
    segLens[i] = Math.sqrt(dx * dx + dy * dy);
    total += segLens[i];
  }

  if (total < 1e-9) return { points, origIndices: points.map((_, i) => i) }; // exclude degenerate polygon

  let cum = 0;
  const tParams = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    tParams[i] = cum / total;
    cum += segLens[i];
  }

  const resultPts: [number, number][] = [];
  const origIndices: number[] = [];

  for (let i = 0; i < n; i++) {
    origIndices.push(resultPts.length);
    resultPts.push(points[i]);
    if (isOnBorder(worldContext, points[i]) && isOnBorder(worldContext, points[(i + 1) % n])) continue; // Skip edges running along the map border

    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    subdivideEdge(
      x0,
      y0,
      x1,
      y1,
      tParams[i],
      tParams[(i + 1) % n],
      settings.maxDepth,
      settings.baseAmplitude,
      profile,
      rand,
      resultPts,
      settings
    );
  }

  return { points: resultPts, origIndices };
}

function isOnBorder(_worldContext: Readonly<WorldContext>, [x, y]: [number, number]) {
  const { graphWidth, graphHeight } = _worldContext;
  return x === 0 || x === graphWidth || y === 0 || y === graphHeight;
}

/**
 * Build a closed SVG path string applying the correct curve algorithm per span:
 * Smooth span: Q midpoint B-spline — identical to curveBasisClosed. Produces flowing arcs that hide Voronoi angularity.
 * Jagged span: centripetal Catmull-Rom (α=0.5) through every fractal sub-point. Rounds sharp kinks into gentle curves.
 */
export function buildCoastlinePath(
  _worldContext: Readonly<WorldContext>,
  _viewContext: Readonly<ViewContext>,
  _appServices: AppServices,
  { points, origIndices }: FractalizedShape
): string {
  const N = points.length;
  const M = origIndices.length;
  if (N < 3 || M < 3) return "";

  const smooth: boolean[] = new Array(M);
  for (let i = 0; i < M; i++) {
    const a = origIndices[i];
    const b = origIndices[(i + 1) % M];
    smooth[i] = (b > a ? b - a : b + N - a) === 1;
  }

  // Start at the B-spline midpoint of the last→first span when that span is
  // smooth so the closed loop is fully seamless; otherwise start at vertex 0.
  const p0 = points[origIndices[0]];
  const pL = points[origIndices[M - 1]];
  let atMid = smooth[M - 1];
  const sx = atMid ? (pL[0] + p0[0]) / 2 : p0[0];
  const sy = atMid ? (pL[1] + p0[1]) / 2 : p0[1];
  const d: string[] = [`M${sx},${sy}`];

  for (let i = 0; i < M; i++) {
    const ci = origIndices[i];
    const ni = origIndices[(i + 1) % M];
    const [cpx, cpy] = points[ci];

    if (smooth[i]) {
      // Q midpoint B-spline ≡ curveBasisClosed.
      // When arriving from a jagged span the cursor is already at cpx,cpy
      // so just line to the midpoint instead of emitting a degenerate Q.
      const [npx, npy] = points[ni];
      const mx = (cpx + npx) / 2;
      const my = (cpy + npy) / 2;
      d.push(atMid ? `Q${cpx},${cpy} ${mx},${my}` : `L${mx},${my}`);
      atMid = true;
    } else {
      // Step from the B-spline midpoint to the original vertex when needed.
      if (atMid) d.push(`L${cpx},${cpy}`);

      // Centripetal Catmull-Rom through every fractal sub-segment.
      const end = ni > ci ? ni : ni + N;
      for (let j = ci; j < end; j++) {
        const a = points[j % N];
        const b = points[(j + 1) % N];
        const prev = points[(j - 1 + N) % N];
        const nnext = points[(j + 2) % N];
        // Catmull-Rom tangents → Hermite control points (tension ≈ 0.25 for less radical curvature).
        const cp1x = a[0] + (b[0] - prev[0]) / 8;
        const cp1y = a[1] + (b[1] - prev[1]) / 8;
        const cp2x = b[0] - (nnext[0] - a[0]) / 8;
        const cp2y = b[1] - (nnext[1] - a[1]) / 8;
        d.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${b[0]},${b[1]}`);
      }
      atMid = false;
    }
  }

  return d.join("");
}

/**
 * Adaptively sample a Quadratic Bezier curve.
 */
function sampleQuadraticBezier(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  toleranceSq: number,
  out: [number, number][]
): void {
  const dx = x0 - x2;
  const dy = y0 - y2;
  const d = Math.abs((x1 - x2) * dy - (y1 - y2) * dx);
  if (d * d <= toleranceSq * (dx * dx + dy * dy)) {
    out.push([x2, y2]);
    return;
  }
  const x01 = (x0 + x1) / 2;
  const y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x012 = (x01 + x12) / 2;
  const y012 = (y01 + y12) / 2;
  sampleQuadraticBezier(x0, y0, x01, y01, x012, y012, toleranceSq, out);
  sampleQuadraticBezier(x012, y012, x12, y12, x2, y2, toleranceSq, out);
}

/**
 * Adaptively sample a Cubic Bezier curve.
 */
function sampleCubicBezier(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  toleranceSq: number,
  out: [number, number][]
): void {
  const dx = x3 - x0;
  const dy = y3 - y0;
  const d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx);
  const d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
  if ((d1 + d2) * (d1 + d2) <= toleranceSq * (dx * dx + dy * dy)) {
    out.push([x3, y3]);
    return;
  }
  const x01 = (x0 + x1) / 2;
  const y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2;
  const y23 = (y2 + y3) / 2;

  const x012 = (x01 + x12) / 2;
  const y012 = (y01 + y12) / 2;
  const x123 = (x12 + x23) / 2;
  const y123 = (y12 + y23) / 2;

  const x0123 = (x012 + x123) / 2;
  const y0123 = (y012 + y123) / 2;

  sampleCubicBezier(x0, y0, x01, y01, x012, y012, x0123, y0123, toleranceSq, out);
  sampleCubicBezier(x0123, y0123, x123, y123, x23, y23, x3, y3, toleranceSq, out);
}

/**
 * Sample the geometry evaluated in buildCoastlinePath as a dense polyline.
 * This ensures WebGL Mask and Path layers use the exact equivalent of the SVG Q/C curves.
 */
export function sampleCoastlineShape(shape: FractalizedShape, tolerance: number = 0.5): [number, number][] {
  const { points, origIndices } = shape;
  const N = points.length;
  const M = origIndices.length;
  if (N < 3 || M < 3) return points;

  const smooth: boolean[] = new Array(M);
  for (let i = 0; i < M; i++) {
    const a = origIndices[i];
    const b = origIndices[(i + 1) % M];
    smooth[i] = (b > a ? b - a : b + N - a) === 1;
  }

  const toleranceSq = tolerance * tolerance;
  const out: [number, number][] = [];

  const p0 = points[origIndices[0]];
  const pL = points[origIndices[M - 1]];
  let atMid = smooth[M - 1];
  const sx = atMid ? (pL[0] + p0[0]) / 2 : p0[0];
  const sy = atMid ? (pL[1] + p0[1]) / 2 : p0[1];

  out.push([sx, sy]);
  let cx = sx;
  let cy = sy;

  for (let i = 0; i < M; i++) {
    const ci = origIndices[i];
    const ni = origIndices[(i + 1) % M];
    const [cpx, cpy] = points[ci];

    if (smooth[i]) {
      const [npx, npy] = points[ni];
      const mx = (cpx + npx) / 2;
      const my = (cpy + npy) / 2;

      if (atMid) {
        sampleQuadraticBezier(cx, cy, cpx, cpy, mx, my, toleranceSq, out);
      } else {
        out.push([mx, my]);
      }
      cx = mx;
      cy = my;
      atMid = true;
    } else {
      if (atMid) {
        out.push([cpx, cpy]);
        cx = cpx;
        cy = cpy;
      }

      const end = ni > ci ? ni : ni + N;
      for (let j = ci; j < end; j++) {
        const a = points[j % N];
        const b = points[(j + 1) % N];
        const prev = points[(j - 1 + N) % N];
        const nnext = points[(j + 2) % N];

        const cp1x = a[0] + (b[0] - prev[0]) / 8;
        const cp1y = a[1] + (b[1] - prev[1]) / 8;
        const cp2x = b[0] - (nnext[0] - a[0]) / 8;
        const cp2y = b[1] - (nnext[1] - a[1]) / 8;

        sampleCubicBezier(cx, cy, cp1x, cp1y, cp2x, cp2y, b[0], b[1], toleranceSq, out);
        cx = b[0];
        cy = b[1];
      }
      atMid = false;
    }
  }

  return out;
}

/**
 * Sample a Catmull-Rom spline as a dense polyline.
 * Used for smoothly curving routes and rivers in WebGL.
 * @param points Original control points
 * @param alpha 0 = uniform, 0.5 = centripetal, 1 = chordal
 * @param closed Whether the curve is a closed loop
 * @param tolerance Curve sampling tolerance
 */
export function sampleCatmullRomPolyline(
  points: [number, number][],
  alpha: number = 0.5,
  closed: boolean = false,
  tolerance: number = 0.5
): [number, number][] {
  const N = points.length;
  if (N < 3) return points;

  const out: [number, number][] = [];
  const toleranceSq = tolerance * tolerance;

  const getPoint = (i: number) => {
    if (closed) return points[((i % N) + N) % N];
    if (i < 0) return points[0];
    if (i >= N) return points[N - 1];
    return points[i];
  };

  out.push(points[0]);
  const end = closed ? N : N - 1;

  for (let i = 0; i < end; i++) {
    const p0 = getPoint(i - 1);
    const p1 = getPoint(i);
    const p2 = getPoint(i + 1);
    const p3 = getPoint(i + 2);

    const d01 = Math.sqrt((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2) ** alpha;
    const d12 = Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2) ** alpha;
    const d23 = Math.sqrt((p3[0] - p2[0]) ** 2 + (p3[1] - p2[1]) ** 2) ** alpha;

    let cp1x = p1[0];
    let cp1y = p1[1];
    let cp2x = p2[0];
    let cp2y = p2[1];

    if (d12 > 1e-4) {
      if (d01 > 1e-4) {
        cp1x = p1[0] + ((p2[0] - p0[0]) * d12) / (3 * (d01 + d12));
        cp1y = p1[1] + ((p2[1] - p0[1]) * d12) / (3 * (d01 + d12));
      } else {
        cp1x = p1[0] + (p2[0] - p1[0]) / 3;
        cp1y = p1[1] + (p2[1] - p1[1]) / 3;
      }

      if (d23 > 1e-4) {
        cp2x = p2[0] - ((p3[0] - p1[0]) * d12) / (3 * (d12 + d23));
        cp2y = p2[1] - ((p3[1] - p1[1]) * d12) / (3 * (d12 + d23));
      } else {
        cp2x = p2[0] - (p2[0] - p1[0]) / 3;
        cp2y = p2[1] - (p2[1] - p1[1]) / 3;
      }
    }

    sampleCubicBezier(p1[0], p1[1], cp1x, cp1y, cp2x, cp2y, p2[0], p2[1], toleranceSq, out);
  }

  return out;
}
