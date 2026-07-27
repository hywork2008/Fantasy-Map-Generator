/**
 * Route grade profiling — pure measurement of planar distance, slope, pass class,
 * and (Phase 1+) land travel-time multipliers along a cell path.
 *
 * Speed / pathfinding consumers live in the economy extension; this module stays pure
 * (no worldContext / DOM).
 *
 * @see docs/plan/route-grade-movement.md
 */

import { heightToMeters } from "../utils/height";
import { lerp } from "../utils/numberUtils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PassClass = "flat" | "rolling" | "steep" | "hardPass" | "extreme";

export type PassTag = "horseHard" | "wagonHard" | "winterRisk";

/** One hop between consecutive samples (cells or route points with cell ids). */
export interface EdgeGradeMetrics {
  fromCell: number;
  toCell: number;
  /** Planar distance in km (map units × distanceScale). */
  runKm: number;
  /** Signed rise in meters (to − from). */
  riseM: number;
  /** riseM / (runKm * 1000); 0 if runKm below epsilon. */
  grade: number;
  absGrade: number;
}

export interface ClassifiedPass {
  class: Exclude<PassClass, "flat">;
  /** Inclusive indices into the cells[] sequence (edge i spans cells[i]→cells[i+1]). */
  fromIndex: number;
  toIndex: number;
  fromCell: number;
  toCell: number;
  lengthKm: number;
  maxAbsGrade: number;
  totalAscentM: number;
  tags: PassTag[];
}

export interface RouteGradeProfile {
  planarKm: number;
  totalAscentM: number;
  totalDescentM: number;
  maxAbsGrade: number;
  /** Length-weighted mean of absGrade. */
  meanAbsGrade: number;
  edges: EdgeGradeMetrics[];
  passes: ClassifiedPass[];
  /** Worst class present, or "flat". */
  worstClass: PassClass;
}

export interface RouteGradeThresholds {
  /** Min runKm for a non-zero grade; below → grade 0. */
  minRunKm: number;
  G_rolling: number;
  G_steep: number;
  L_steepKm: number;
  G_hard: number;
  L_hardKm: number;
  W_hardKm: number;
  A_hardM: number;
  G_extreme: number;
  W_extremeKm: number;
  A_extremeM: number;
  /** For winterRisk tag only (align with landRouteGraph). */
  winterElevationH: number;
}

export interface RouteGradeOptions {
  distanceScale: number;
  heightExponent: number;
  /** pack.cells.h */
  heights: ArrayLike<number>;
  /**
   * Optional map-unit lengths between cells[i] and cells[i+1].
   * Prefer passing explicit `segmentLengthsMapUnits` to `buildRouteGradeProfile`.
   */
  segmentLengthsMapUnits?: number[];
  /** Override thresholds (tests / future options). */
  thresholds?: Partial<RouteGradeThresholds>;
}

/** Player-facing (and later NPC) preference when multiple land paths exist. */
export type MerchantRoutePreference =
  /** Minimize travel days (grade slows horses; may still take a steep shortcut). */
  | "preferSpeed"
  /** Extra cost on horseHard / hardPass edges so pathfinding detours when viable. */
  | "avoidHardPass";

/** Conveyance sensitivity to grade (draft animals, later infantry/mounted). */
export interface GradeSensitivity {
  /** Below this effective grade, speed multiplier ≈ 1. */
  freeGrade: number;
  /** At/above this effective grade, speed is minMultiplier. */
  criticalGrade: number;
  /** Extra weight on uphill grade (e.g. 1.2). */
  ascentBias: number;
  /** Coefficient on |grade| for descents (e.g. 0.85). */
  descentFactor: number;
  /** Floor speed multiplier at critical grade. */
  minMultiplier: number;
  /** Extra multiplier when the edge sits in a hard-pass ascent window (e.g. 0.5). */
  passWindowMultiplier: number;
}

export interface LandTravelDayOptions {
  distanceScale: number;
  heightExponent: number;
  heights: ArrayLike<number>;
  landKmPerDay: number;
  /** Default 1. */
  draftSpeedMultiplier?: number;
  /** 0 = legacy planar-only (m=1 always). 1 = full grade effect. Default 1. */
  gradeEffectStrength?: number;
  sensitivity: GradeSensitivity;
  thresholds?: Partial<RouteGradeThresholds>;
  /**
   * Pathfinding preference. When `avoidHardPass`, returned days are scaled by
   * AVOID_* multipliers so Dijkstra detours around hard/extreme grades.
   * Duration reporting for deals should leave this as preferSpeed (default).
   */
  routePreference?: MerchantRoutePreference;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_ROUTE_GRADE_THRESHOLDS: RouteGradeThresholds = {
  minRunKm: 0.05, // 50 m equivalent — treat shorter hops as noise
  G_rolling: 0.05, // 5%
  G_steep: 0.1, // 10%
  L_steepKm: 0.5,
  G_hard: 0.15, // 15% — 馬打-class grade
  L_hardKm: 0.3,
  W_hardKm: 3,
  A_hardM: 250, // +250 m within a 3 km window
  G_extreme: 0.22,
  W_extremeKm: 2,
  A_extremeM: 400,
  winterElevationH: 60 // landRouteGraph.WINTER_ROAD_CLOSURE_ELEVATION
};

/** Horse / standard wagon — plan §3 defaults. */
export const DEFAULT_HORSE_GRADE_SENSITIVITY: GradeSensitivity = {
  freeGrade: 0.03,
  criticalGrade: 0.18,
  ascentBias: 1.2,
  descentFactor: 0.85,
  minMultiplier: 0.15,
  passWindowMultiplier: 0.5
};

/** Ox — slower baseline (via speedMultiplier 0.5) and slightly less grade-tolerant. */
export const DEFAULT_OX_GRADE_SENSITIVITY: GradeSensitivity = {
  freeGrade: 0.02,
  criticalGrade: 0.12,
  ascentBias: 1.3,
  descentFactor: 0.9,
  minMultiplier: 0.12,
  passWindowMultiplier: 0.45
};

/** Dijkstra extra cost when preferencing away from hard passes. */
export const AVOID_HARD_PASS_COST_MULTIPLIER = 3;
export const AVOID_EXTREME_PASS_COST_MULTIPLIER = 4;

const PASS_CLASS_RANK: Record<PassClass, number> = {
  flat: 0,
  rolling: 1,
  steep: 2,
  hardPass: 3,
  extreme: 4
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Single edge from two cells and a planar map-unit length. */
export function sampleEdgeGrade(
  fromCell: number,
  toCell: number,
  lengthMapUnits: number,
  options: Pick<RouteGradeOptions, "distanceScale" | "heightExponent" | "heights" | "thresholds">
): EdgeGradeMetrics {
  const thresholds = resolveThresholds(options.thresholds);
  const runKm = Math.max(0, lengthMapUnits) * options.distanceScale;
  const fromH = readHeight(options.heights, fromCell);
  const toH = readHeight(options.heights, toCell);
  const riseM = heightToMeters(toH, options.heightExponent) - heightToMeters(fromH, options.heightExponent);
  const grade = runKm >= thresholds.minRunKm ? riseM / (runKm * 1000) : 0;
  return {
    fromCell,
    toCell,
    runKm,
    riseM,
    grade,
    absGrade: Math.abs(grade)
  };
}

/**
 * Build a full profile from an ordered cell path and per-segment map-unit lengths
 * (same length as cells.length − 1).
 */
export function buildRouteGradeProfile(
  cells: readonly number[],
  segmentLengthsMapUnits: readonly number[],
  options: RouteGradeOptions
): RouteGradeProfile {
  if (cells.length < 2 || segmentLengthsMapUnits.length !== cells.length - 1) {
    return emptyProfile();
  }

  const thresholds = resolveThresholds(options.thresholds);
  const edgeOpts = {
    distanceScale: options.distanceScale,
    heightExponent: options.heightExponent,
    heights: options.heights,
    thresholds
  };

  const edges: EdgeGradeMetrics[] = [];
  for (let i = 0; i < cells.length - 1; i++) {
    edges.push(sampleEdgeGrade(cells[i], cells[i + 1], segmentLengthsMapUnits[i], edgeOpts));
  }

  let planarKm = 0;
  let totalAscentM = 0;
  let totalDescentM = 0;
  let maxAbsGrade = 0;
  let absGradeLengthSum = 0;

  for (const e of edges) {
    planarKm += e.runKm;
    if (e.riseM > 0) totalAscentM += e.riseM;
    else if (e.riseM < 0) totalDescentM += -e.riseM;
    if (e.absGrade > maxAbsGrade) maxAbsGrade = e.absGrade;
    absGradeLengthSum += e.absGrade * e.runKm;
  }

  const meanAbsGrade = planarKm > 0 ? absGradeLengthSum / planarKm : 0;

  const ctx: PassBuildContext = {
    edges,
    cells,
    heights: options.heights,
    thresholds
  };

  const candidates: ClassifiedPass[] = [];
  // Continuous grade runs (steep / hard / extreme). Extreme has no L_* — one edge is enough.
  collectContinuousGradePasses(ctx, thresholds.G_extreme, 0, "extreme", candidates);
  collectContinuousGradePasses(ctx, thresholds.G_hard, thresholds.L_hardKm, "hardPass", candidates);
  collectContinuousGradePasses(ctx, thresholds.G_steep, thresholds.L_steepKm, "steep", candidates);
  // Sliding ascent windows
  collectAscentWindowPasses(ctx, thresholds.W_extremeKm, thresholds.A_extremeM, "extreme", candidates);
  collectAscentWindowPasses(ctx, thresholds.W_hardKm, thresholds.A_hardM, "hardPass", candidates);

  const passes = mergePassCandidates(candidates);
  let worstClass: PassClass = "flat";
  for (const p of passes) {
    if (PASS_CLASS_RANK[p.class] > PASS_CLASS_RANK[worstClass]) worstClass = p.class;
  }
  // Phase 0: rolling is summary-only (not emitted into passes[]).
  if (worstClass === "flat" && maxAbsGrade >= thresholds.G_rolling) {
    worstClass = "rolling";
  }

  return {
    planarKm,
    totalAscentM,
    totalDescentM,
    maxAbsGrade,
    meanAbsGrade,
    edges,
    passes,
    worstClass
  };
}

/**
 * Convenience: route.points is [x, y, cell][].
 * Lengths from consecutive XY; cells from point[2].
 */
export function buildRouteGradeProfileFromPoints(
  points: ReadonlyArray<readonly [number, number, number]>,
  options: Omit<RouteGradeOptions, "segmentLengthsMapUnits">
): RouteGradeProfile {
  if (points.length < 2) return emptyProfile();
  const cells: number[] = new Array(points.length);
  const lengths: number[] = new Array(points.length - 1);
  for (let i = 0; i < points.length; i++) {
    cells[i] = points[i][2];
    if (i > 0) {
      const dx = points[i][0] - points[i - 1][0];
      const dy = points[i][1] - points[i - 1][1];
      lengths[i - 1] = Math.hypot(dx, dy);
    }
  }
  return buildRouteGradeProfile(cells, lengths, options);
}

/** Map PassClass → display label (EN for UI parity with rest of app). */
export function passClassLabel(c: PassClass): string {
  switch (c) {
    case "flat":
      return "Flat";
    case "rolling":
      return "Rolling";
    case "steep":
      return "Steep";
    case "hardPass":
      return "Hard pass (horse)";
    case "extreme":
      return "Extreme";
    default: {
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
}

/** Tags derived from a class (+ optional endpoint height for winterRisk). */
export function tagsForPass(passClass: PassClass, maxEndpointH: number, thresholds: RouteGradeThresholds): PassTag[] {
  const tags: PassTag[] = [];
  const rank = PASS_CLASS_RANK[passClass];
  if (rank >= PASS_CLASS_RANK.steep) tags.push("wagonHard");
  if (rank >= PASS_CLASS_RANK.hardPass) tags.push("horseHard");
  if (maxEndpointH >= thresholds.winterElevationH) tags.push("winterRisk");
  return tags;
}

/**
 * Piecewise-linear grade → speed multiplier, blended by `gradeEffectStrength`.
 * strength 0 → always 1 (legacy planar travel time).
 */
export function gradeToSpeedMultiplier(
  grade: number,
  sensitivity: GradeSensitivity,
  gradeEffectStrength: number
): number {
  const strength = clamp01(gradeEffectStrength);
  if (strength === 0) return 1;

  const gEff = grade > 0 ? grade * sensitivity.ascentBias : Math.abs(grade) * sensitivity.descentFactor;
  let m: number;
  if (gEff <= sensitivity.freeGrade) m = 1;
  else if (gEff >= sensitivity.criticalGrade) m = sensitivity.minMultiplier;
  else {
    const t = (gEff - sensitivity.freeGrade) / (sensitivity.criticalGrade - sensitivity.freeGrade);
    m = lerp(1, sensitivity.minMultiplier, t);
  }
  return 1 + (m - 1) * strength;
}

export interface LandTravelLegSpeed {
  /** Planar distance of this hop (km). */
  runKm: number;
  /** Grade-adjusted speed for this hop (km/day). */
  speedKmPerDay: number;
  absGrade: number;
}

export interface LandTravelLegResult {
  legs: LandTravelLegSpeed[];
  maxAbsGrade: number;
  hasHardWindow: boolean;
  hasExtremeWindow: boolean;
}

/**
 * Per-hop planar length and grade-adjusted speed for a land polyline.
 * Points are `[x, y]` or `[x, y, cellId]`. Without cell ids (or strength 0), every hop uses
 * base land speed. Does not apply pathfinding avoid multipliers.
 */
export function landTravelLegSpeeds(
  points: ReadonlyArray<readonly number[]>,
  options: LandTravelDayOptions
): LandTravelLegResult {
  const empty: LandTravelLegResult = {
    legs: [],
    maxAbsGrade: 0,
    hasHardWindow: false,
    hasExtremeWindow: false
  };
  const landKmPerDay = options.landKmPerDay;
  const draft = options.draftSpeedMultiplier ?? 1;
  if (landKmPerDay <= 0 || draft <= 0 || points.length < 2) return empty;

  const baseSpeed = landKmPerDay * draft;
  const strength = clamp01(options.gradeEffectStrength ?? 1);
  const thresholds = resolveThresholds(options.thresholds);
  const hasCells = points.every(p => typeof p[2] === "number" && Number.isFinite(p[2]));

  if (!hasCells || strength === 0) {
    const legs: LandTravelLegSpeed[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const runKm =
        Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]) * options.distanceScale;
      legs.push({ runKm, speedKmPerDay: baseSpeed, absGrade: 0 });
    }
    return { legs, maxAbsGrade: 0, hasHardWindow: false, hasExtremeWindow: false };
  }

  const cells: number[] = points.map(p => p[2] as number);
  const lengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    lengths.push(Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]));
  }

  const edgeOpts = {
    distanceScale: options.distanceScale,
    heightExponent: options.heightExponent,
    heights: options.heights,
    thresholds
  };
  const edges: EdgeGradeMetrics[] = [];
  for (let i = 0; i < cells.length - 1; i++) {
    edges.push(sampleEdgeGrade(cells[i], cells[i + 1], lengths[i], edgeOpts));
  }

  const hardWindow = markAscentWindows(edges, thresholds.W_hardKm, thresholds.A_hardM);
  const extremeWindow = markAscentWindows(edges, thresholds.W_extremeKm, thresholds.A_extremeM);

  const legs: LandTravelLegSpeed[] = [];
  let maxAbsGrade = 0;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (e.absGrade > maxAbsGrade) maxAbsGrade = e.absGrade;
    let m = gradeToSpeedMultiplier(e.grade, options.sensitivity, strength);
    if (hardWindow[i] || extremeWindow[i]) {
      const passM = options.sensitivity.passWindowMultiplier;
      m *= 1 + (passM - 1) * strength;
    }
    legs.push({
      runKm: e.runKm,
      speedKmPerDay: baseSpeed * Math.max(m, 1e-6),
      absGrade: e.absGrade
    });
  }
  return {
    legs,
    maxAbsGrade,
    hasHardWindow: hardWindow.some(Boolean),
    hasExtremeWindow: extremeWindow.some(Boolean)
  };
}

/**
 * Days to traverse a land polyline with grade-adjusted speed.
 * Points are `[x, y]` or `[x, y, cellId]`. Without cell ids, falls back to planar distance only.
 *
 * When `routePreference` is `avoidHardPass`, multiplies the result by pathfinding avoid costs
 * (for Dijkstra). Callers computing real ETA / deal duration should leave preference as
 * `preferSpeed` (default).
 */
export function calculateLandTravelDays(
  points: ReadonlyArray<readonly number[]>,
  options: LandTravelDayOptions
): number {
  const landKmPerDay = options.landKmPerDay;
  const draft = options.draftSpeedMultiplier ?? 1;
  if (landKmPerDay <= 0 || draft <= 0) return Infinity;

  const { legs, maxAbsGrade, hasHardWindow, hasExtremeWindow } = landTravelLegSpeeds(points, options);
  if (legs.length === 0) return 0;

  let days = 0;
  for (const leg of legs) {
    days += leg.runKm / leg.speedKmPerDay;
  }

  const preference = options.routePreference ?? "preferSpeed";
  if (preference === "avoidHardPass") {
    days *= avoidPassCostMultiplier(
      maxAbsGrade,
      hasHardWindow,
      hasExtremeWindow,
      resolveThresholds(options.thresholds)
    );
  }

  return days;
}

/** Pathfinding avoid cost from max grade / window flags on a single graph edge. */
export function avoidPassCostMultiplier(
  maxAbsGrade: number,
  hasHardWindow: boolean,
  hasExtremeWindow: boolean,
  thresholds: RouteGradeThresholds = DEFAULT_ROUTE_GRADE_THRESHOLDS
): number {
  if (maxAbsGrade >= thresholds.G_extreme || hasExtremeWindow) return AVOID_EXTREME_PASS_COST_MULTIPLIER;
  if (maxAbsGrade >= thresholds.G_hard || hasHardWindow) return AVOID_HARD_PASS_COST_MULTIPLIER;
  return 1;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Mark edges that participate in any sliding ascent window meeting A_* within W_*. */
function markAscentWindows(edges: readonly EdgeGradeMetrics[], windowKm: number, ascentThresholdM: number): boolean[] {
  const marked = new Array(edges.length).fill(false) as boolean[];
  if (windowKm <= 0 || edges.length === 0) return marked;

  for (let start = 0; start < edges.length; start++) {
    let lengthKm = 0;
    let ascentM = 0;
    let end = start;
    for (; end < edges.length; end++) {
      lengthKm += edges[end].runKm;
      if (edges[end].riseM > 0) ascentM += edges[end].riseM;
      if (lengthKm + 1e-12 >= windowKm) break;
    }
    if (lengthKm + 1e-12 < windowKm) continue;
    if (ascentM + 1e-9 >= ascentThresholdM) {
      for (let i = start; i <= end; i++) marked[i] = true;
    }
  }
  return marked;
}

interface PassBuildContext {
  edges: readonly EdgeGradeMetrics[];
  cells: readonly number[];
  heights: ArrayLike<number>;
  thresholds: RouteGradeThresholds;
}

function resolveThresholds(partial?: Partial<RouteGradeThresholds>): RouteGradeThresholds {
  return partial ? { ...DEFAULT_ROUTE_GRADE_THRESHOLDS, ...partial } : DEFAULT_ROUTE_GRADE_THRESHOLDS;
}

function readHeight(heights: ArrayLike<number>, cell: number): number {
  const h = heights[cell];
  return typeof h === "number" && Number.isFinite(h) ? h : 0;
}

function emptyProfile(): RouteGradeProfile {
  return {
    planarKm: 0,
    totalAscentM: 0,
    totalDescentM: 0,
    maxAbsGrade: 0,
    meanAbsGrade: 0,
    edges: [],
    passes: [],
    worstClass: "flat"
  };
}

function edgeSpanMetrics(
  edges: readonly EdgeGradeMetrics[],
  startEdge: number,
  endEdge: number
): { lengthKm: number; maxAbsGrade: number; totalAscentM: number } {
  let lengthKm = 0;
  let maxAbsGrade = 0;
  let totalAscentM = 0;
  for (let i = startEdge; i <= endEdge; i++) {
    const e = edges[i];
    lengthKm += e.runKm;
    if (e.absGrade > maxAbsGrade) maxAbsGrade = e.absGrade;
    if (e.riseM > 0) totalAscentM += e.riseM;
  }
  return { lengthKm, maxAbsGrade, totalAscentM };
}

function buildClassifiedPass(
  ctx: PassBuildContext,
  passClass: Exclude<PassClass, "flat" | "rolling">,
  startEdge: number,
  endEdge: number
): ClassifiedPass {
  const { edges, cells, heights, thresholds } = ctx;
  const { lengthKm, maxAbsGrade, totalAscentM } = edgeSpanMetrics(edges, startEdge, endEdge);
  const fromIndex = startEdge;
  const toIndex = endEdge + 1;
  const fromCell = cells[fromIndex];
  const toCell = cells[toIndex];
  let maxH = 0;
  for (let i = fromIndex; i <= toIndex; i++) {
    const h = readHeight(heights, cells[i]);
    if (h > maxH) maxH = h;
  }
  return {
    class: passClass,
    fromIndex,
    toIndex,
    fromCell,
    toCell,
    lengthKm,
    maxAbsGrade,
    totalAscentM,
    tags: tagsForPass(passClass, maxH, thresholds)
  };
}

/**
 * Collect consecutive runs where absGrade ≥ gMin for at least minLengthKm.
 * When minLengthKm is 0, any positive-length edge that meets the grade qualifies.
 */
function collectContinuousGradePasses(
  ctx: PassBuildContext,
  gMin: number,
  minLengthKm: number,
  passClass: Exclude<PassClass, "flat" | "rolling">,
  out: ClassifiedPass[]
): void {
  const { edges } = ctx;
  let runStart = -1;
  let runLen = 0;

  const flush = (endEdge: number) => {
    if (runStart < 0) return;
    const qualifies = minLengthKm <= 0 ? runLen > 0 : runLen + 1e-12 >= minLengthKm;
    if (qualifies) out.push(buildClassifiedPass(ctx, passClass, runStart, endEdge));
    runStart = -1;
    runLen = 0;
  };

  for (let i = 0; i < edges.length; i++) {
    if (edges[i].absGrade >= gMin) {
      if (runStart < 0) runStart = i;
      runLen += edges[i].runKm;
    } else {
      flush(i - 1);
    }
  }
  flush(edges.length - 1);
}

/**
 * Sliding windows: from each start edge, accumulate until runKm ≥ windowKm,
 * then check positive ascent against A_*.
 */
function collectAscentWindowPasses(
  ctx: PassBuildContext,
  windowKm: number,
  ascentThresholdM: number,
  passClass: Exclude<PassClass, "flat" | "rolling">,
  out: ClassifiedPass[]
): void {
  const { edges } = ctx;
  if (windowKm <= 0 || edges.length === 0) return;

  for (let start = 0; start < edges.length; start++) {
    let lengthKm = 0;
    let ascentM = 0;
    let end = start;
    for (; end < edges.length; end++) {
      lengthKm += edges[end].runKm;
      if (edges[end].riseM > 0) ascentM += edges[end].riseM;
      if (lengthKm + 1e-12 >= windowKm) break;
    }
    // Only windows that reach the configured length count (partial tail of a short route is ignored).
    if (lengthKm + 1e-12 < windowKm) continue;
    if (ascentM + 1e-9 >= ascentThresholdM) {
      out.push(buildClassifiedPass(ctx, passClass, start, end));
    }
  }
}

/**
 * Merge candidates: absorb weaker spans fully contained in stronger ones;
 * on overlap keep the worse class. Same-class overlapping spans are merged.
 */
function mergePassCandidates(candidates: ClassifiedPass[]): ClassifiedPass[] {
  if (candidates.length === 0) return [];

  // Sort worse-first, then longer-first for stable absorption.
  const sorted = [...candidates].sort((a, b) => {
    const rankDiff = PASS_CLASS_RANK[b.class] - PASS_CLASS_RANK[a.class];
    if (rankDiff !== 0) return rankDiff;
    return b.lengthKm - a.lengthKm;
  });

  const kept: ClassifiedPass[] = [];

  for (const cand of sorted) {
    let absorbed = false;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      // Fully contained in equal-or-worse kept pass → drop.
      if (
        PASS_CLASS_RANK[k.class] >= PASS_CLASS_RANK[cand.class] &&
        k.fromIndex <= cand.fromIndex &&
        k.toIndex >= cand.toIndex
      ) {
        absorbed = true;
        break;
      }
      // cand fully contains a weaker/equal kept pass → replace with union under worse class.
      if (
        PASS_CLASS_RANK[cand.class] >= PASS_CLASS_RANK[k.class] &&
        cand.fromIndex <= k.fromIndex &&
        cand.toIndex >= k.toIndex
      ) {
        kept[i] = mergeSpan(k, cand);
        absorbed = true;
        break;
      }
      // Overlap: prefer worse class; if same class, union the span.
      if (spansOverlap(k, cand)) {
        if (PASS_CLASS_RANK[cand.class] >= PASS_CLASS_RANK[k.class]) {
          kept[i] = mergeSpan(k, cand);
        }
        absorbed = true;
        break;
      }
    }
    if (!absorbed) kept.push(cand);
  }

  // Collapse remaining same-class overlaps after expansions.
  kept.sort((a, b) => a.fromIndex - b.fromIndex || PASS_CLASS_RANK[b.class] - PASS_CLASS_RANK[a.class]);
  const result: ClassifiedPass[] = [];
  for (const p of kept) {
    const last = result[result.length - 1];
    if (!last) {
      result.push(p);
      continue;
    }
    if (last.class === p.class && spansOverlap(last, p)) {
      result[result.length - 1] = mergeSpan(last, p);
      continue;
    }
    if (
      PASS_CLASS_RANK[last.class] >= PASS_CLASS_RANK[p.class] &&
      last.fromIndex <= p.fromIndex &&
      last.toIndex >= p.toIndex
    ) {
      continue;
    }
    result.push(p);
  }

  // Phase 0: only steep and above in passes[]
  return result.filter(p => PASS_CLASS_RANK[p.class] >= PASS_CLASS_RANK.steep);
}

function spansOverlap(a: ClassifiedPass, b: ClassifiedPass): boolean {
  return a.fromIndex <= b.toIndex && b.fromIndex <= a.toIndex;
}

function mergeSpan(a: ClassifiedPass, b: ClassifiedPass): ClassifiedPass {
  const worse = PASS_CLASS_RANK[a.class] >= PASS_CLASS_RANK[b.class] ? a : b;
  const fromIndex = Math.min(a.fromIndex, b.fromIndex);
  const toIndex = Math.max(a.toIndex, b.toIndex);
  return {
    class: worse.class,
    fromIndex,
    toIndex,
    fromCell: a.fromIndex <= b.fromIndex ? a.fromCell : b.fromCell,
    toCell: a.toIndex >= b.toIndex ? a.toCell : b.toCell,
    lengthKm: Math.max(a.lengthKm, b.lengthKm),
    maxAbsGrade: Math.max(a.maxAbsGrade, b.maxAbsGrade),
    totalAscentM: Math.max(a.totalAscentM, b.totalAscentM),
    tags: uniqueTags([...a.tags, ...b.tags, ...worse.tags])
  };
}

function uniqueTags(tags: PassTag[]): PassTag[] {
  const seen = new Set<PassTag>();
  const out: PassTag[] = [];
  for (const t of tags) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
