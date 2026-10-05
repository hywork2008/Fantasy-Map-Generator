import { evaluateRiverAxis, type PhysicalRiverAxis, sampleRiverAxis } from "./riverAxisSampling";
import type { RiverPoint } from "./riverGeometry";
import { type PhysicalRiverGeometry, type RiverBankReference, validWaterPolygon } from "./riverPhysicalGeometry";

export interface RiverWidthSurvey {
  arcLengthMeters: number;
  widthMeters: number;
}
export interface RiverBankSampling {
  maxStepMeters: number;
  maxChordErrorMeters: number;
  maxSamples: number;
  /** Known zero-width headwaters may end in one closed tip; never invent positive width. */
  allowDrySource?: boolean;
}
export type PhysicalGeometryBuildResult =
  | { geometry: PhysicalRiverGeometry; sampleCount: number }
  | { reason: "invalid-survey" | "sampling-budget" | "unstable-axis" | "folded-banks" };
/** Build one canonical physical polygon with local bank provenance. This is separate
 * from exaggerated display width. Sampling only approximates the banks; axis
 * tangents remain analytic. Callers must preserve this polygon across renderers/CE.
 */
export function buildPhysicalRiverGeometry(
  axis: PhysicalRiverAxis,
  survey: readonly RiverWidthSurvey[],
  settings: RiverBankSampling
): PhysicalGeometryBuildResult {
  if (
    survey.length < 2 ||
    survey[0].arcLengthMeters !== 0 ||
    survey.at(-1)!.arcLengthMeters !== axis.length ||
    survey.some(
      (s, i) =>
        !Number.isFinite(s.arcLengthMeters) ||
        !Number.isFinite(s.widthMeters) ||
        (s.widthMeters <= 0 && (!settings.allowDrySource || s.widthMeters < 0)) ||
        (i > 0 && s.arcLengthMeters <= survey[i - 1].arcLengthMeters)
    ) ||
    !Number.isFinite(settings.maxStepMeters) ||
    settings.maxStepMeters <= 0 ||
    !Number.isFinite(settings.maxChordErrorMeters) ||
    settings.maxChordErrorMeters <= 0 ||
    !Number.isSafeInteger(settings.maxSamples) ||
    settings.maxSamples < 2 ||
    (settings.allowDrySource !== undefined && typeof settings.allowDrySource !== "boolean")
  )
    return { reason: "invalid-survey" };
  const firstWet = survey.findIndex(s => s.widthMeters > 0);
  if (firstWet < 0 || survey.slice(firstWet).some(s => s.widthMeters <= 0)) return { reason: "invalid-survey" };
  const waterStart = firstWet > 0 ? survey[firstWet - 1].arcLengthMeters : 0;
  const isTwoPointSurvey = survey.length === 2;
  function widthAt(s: number): number {
    if (isTwoPointSurvey) {
      const a = survey[0],
        b = survey[1];
      return a.widthMeters + ((b.widthMeters - a.widthMeters) * s) / b.arcLengthMeters;
    }
    let lo = 1,
      hi = survey.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (survey[mid].arcLengthMeters >= s) hi = mid;
      else lo = mid + 1;
    }
    const a = survey[lo - 1],
      b = survey[lo];
    return (
      a.widthMeters +
      ((b.widthMeters - a.widthMeters) * (s - a.arcLengthMeters)) / (b.arcLengthMeters - a.arcLengthMeters)
    );
  }
  type BankSample = { s: number; left: RiverPoint; right: RiverPoint };
  const cache = new Map<number, BankSample>();
  let failure: PhysicalGeometryBuildResult | null = null;
  function sample(s: number): BankSample | null {
    const cached = cache.get(s);
    if (cached) return cached;
    if (cache.size >= settings.maxSamples) {
      failure = { reason: "sampling-budget" };
      return null;
    }
    const value = s === 0 || s === axis.length ? evaluateRiverAxis(axis, s) : sampleRiverAxis(axis, s);
    if (!value) {
      failure = { reason: "unstable-axis" };
      return null;
    }
    const half = widthAt(s) / 2;
    if ("curvature" in value && typeof value.curvature === "number" && Math.abs(value.curvature) * half >= 1) {
      failure = { reason: "folded-banks" };
      return null;
    }
    const left: RiverPoint = [value.point[0] + half * value.normal[0], value.point[1] + half * value.normal[1]];
    const right: RiverPoint = [value.point[0] - half * value.normal[0], value.point[1] - half * value.normal[1]];
    const result = { s, left, right };
    cache.set(s, result);
    return result;
  }
  const banks: BankSample[] = [];
  function chordError(p: RiverPoint, a: RiverPoint, b: RiverPoint, fraction: number) {
    const dx = p[0] - a[0] - fraction * (b[0] - a[0]);
    const dy = p[1] - a[1] - fraction * (b[1] - a[1]);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function refine(a: BankSample, b: BankSample): boolean {
    const delta = b.s - a.s;
    const p1 = sample(a.s + 0.25 * delta);
    const p2 = sample(a.s + 0.5 * delta);
    const p3 = sample(a.s + 0.75 * delta);
    if (!p1 || !p2 || !p3) return false;
    const curved =
      Math.max(chordError(p1.left, a.left, b.left, 0.25), chordError(p1.right, a.right, b.right, 0.25)) >
        settings.maxChordErrorMeters ||
      Math.max(chordError(p2.left, a.left, b.left, 0.5), chordError(p2.right, a.right, b.right, 0.5)) >
        settings.maxChordErrorMeters ||
      Math.max(chordError(p3.left, a.left, b.left, 0.75), chordError(p3.right, a.right, b.right, 0.75)) >
        settings.maxChordErrorMeters;
    if (delta > settings.maxStepMeters || curved) {
      if (p2.s === a.s || p2.s === b.s) {
        failure = { reason: "sampling-budget" };
        return false;
      }
      return refine(a, p2) && refine(p2, b);
    }
    banks.push(b);
    return true;
  }
  // Retain width breakpoints and all source segment boundaries, independent of display sampling.
  const boundaries = [
    ...new Set([0, axis.length, ...survey.map(s => s.arcLengthMeters), ...axis.segments.map(s => s.arcStart)])
  ]
    .filter(s => s >= waterStart)
    .sort((a, b) => a - b);
  const first = sample(waterStart);
  if (!first) return failure!;
  banks.push(first);
  for (let i = 1; i < boundaries.length; i++) {
    const a = sample(boundaries[i - 1]),
      b = sample(boundaries[i]);
    if (!a || !b || !refine(a, b)) return failure ?? { reason: "sampling-budget" };
  }
  const points = [...banks.map(b => b.left), ...banks.toReversed().map(b => b.right)];
  const references: (RiverBankReference | null)[] = [];
  for (let i = 0; i < banks.length - 1; i++)
    references.push({ side: "left", arcStart: banks[i].s, arcEnd: banks[i + 1].s });
  references.push(null);
  for (let i = banks.length - 1; i > 0; i--)
    references.push({ side: "right", arcStart: banks[i].s, arcEnd: banks[i - 1].s });
  references.push(null);
  if (waterStart > 0 || (settings.allowDrySource && survey[0].widthMeters === 0)) {
    // The two source banks coincide. Keep a single tip and its two bank edges;
    // remove only the zero-length cap, preserving original arc provenance.
    points.pop();
    references.pop();
  }
  const water = { id: axis.riverId, rings: [points], bankReferences: [references] };
  if (!validWaterPolygon(water)) return { reason: "folded-banks" };
  return { geometry: { axis, water }, sampleCount: cache.size };
}
