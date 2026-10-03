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
        s.widthMeters <= 0 ||
        (i > 0 && s.arcLengthMeters <= survey[i - 1].arcLengthMeters)
    ) ||
    !Number.isFinite(settings.maxStepMeters) ||
    settings.maxStepMeters <= 0 ||
    !Number.isFinite(settings.maxChordErrorMeters) ||
    settings.maxChordErrorMeters <= 0 ||
    !Number.isSafeInteger(settings.maxSamples) ||
    settings.maxSamples < 2
  )
    return { reason: "invalid-survey" };
  function widthAt(s: number): number {
    const index = Math.max(
      1,
      survey.findIndex(p => p.arcLengthMeters >= s)
    );
    const a = survey[index - 1],
      b = survey[index];
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
    return Math.hypot(p[0] - a[0] - fraction * (b[0] - a[0]), p[1] - a[1] - fraction * (b[1] - a[1]));
  }
  function refine(a: BankSample, b: BankSample): boolean {
    const fractions = [0.25, 0.5, 0.75];
    const inside = fractions.map(f => sample(a.s + f * (b.s - a.s)));
    if (inside.some(p => !p)) return false;
    const curved = inside.some(
      (p, i) =>
        Math.max(
          chordError(p!.left, a.left, b.left, fractions[i]),
          chordError(p!.right, a.right, b.right, fractions[i])
        ) > settings.maxChordErrorMeters
    );
    if (b.s - a.s > settings.maxStepMeters || curved) {
      const mid = inside[1]!;
      if (mid.s === a.s || mid.s === b.s) {
        failure = { reason: "sampling-budget" };
        return false;
      }
      return refine(a, mid) && refine(mid, b);
    }
    banks.push(b);
    return true;
  }
  // Retain width breakpoints and all source segment boundaries, independent of display sampling.
  const boundaries = [
    ...new Set([0, axis.length, ...survey.map(s => s.arcLengthMeters), ...axis.segments.map(s => s.arcStart)])
  ].sort((a, b) => a - b);
  const first = sample(0);
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
  const water = { id: axis.riverId, rings: [points], bankReferences: [references] };
  if (!validWaterPolygon(water)) return { reason: "folded-banks" };
  return { geometry: { axis, water }, sampleCount: cache.size };
}
