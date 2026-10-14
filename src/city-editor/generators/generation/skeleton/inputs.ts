// K1 — normalise the outer layer (coast, rivers, roads) into fixed vector inputs.

import { bridgeSkewDegrees, resolveBridgeSkewLimit } from "../../../../utils/bridgeSkewPolicy";
import type { GenerationSettings } from "../../../types/generation";
import type { CityGeography, CityParams, CityProgram, Point } from "../../../types/geometry";
import { azimuthToVec, pointInPolygon, polylineLength, segmentSegmentHit } from "../../geom";
import { minGateSpacingMeters } from "../../passages";
import { urbanDiskRadiusMeters } from "../../polygonalCirculadeLayout";
import { resolveWalledAreaShare } from "../../settlementExtent";
import { skeletonRiverCourses } from "../../site/siteInput";
import { requiredExternalRoads } from "../planning/roadGeometry";
import type { SkeletonInputs, SkeletonRiver, SkeletonRoad, SkeletonWater } from "./contracts";
import { add, bandRing, closeCorridor, dist, distanceToPolyline, exitSquare, rayRingHit, sub, unit } from "./vector";

export interface SkeletonInputSource {
  geo: CityGeography;
  program: CityProgram;
  params: CityParams;
  settings: Pick<GenerationSettings, "descriptor" | "historicalPeriod" | "walledAreaShare">;
}

function densifyLine(line: Point[], step: number): Point[] {
  const out: Point[] = [line[0]];
  for (let i = 0; i + 1 < line.length; i++) {
    const pieces = Math.max(1, Math.ceil(dist(line[i], line[i + 1]) / step));
    for (let k = 1; k <= pieces; k++) out.push(add(line[i], sub(line[i + 1], line[i]), k / pieces));
  }
  return out;
}

/**
 * Half width of a river from FMG's surveyed bank rings: the bank-to-bank
 * distance across the course, sampled along it (75th percentile). FMG's
 * `widthsMeters` is the exaggerated drawing width, not the channel. Null when
 * the course never runs inside a surveyed ring.
 */
function surveyedHalfWidth(line: Point[], banks: Point[][], cellSize: number): number | null {
  if (!banks.length) return null;
  const widths: number[] = [];
  const samples = densifyLine(line, cellSize / 2);
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const ring = banks.find(r => pointInPolygon(p, r));
    if (!ring) continue;
    const t = unit(sub(samples[Math.min(i + 1, samples.length - 1)], samples[Math.max(i - 1, 0)]));
    const n: Point = [-t[1], t[0]];
    const across = rayRingHit(p, n, ring) + rayRingHit(p, [-n[0], -n[1]], ring);
    if (Number.isFinite(across)) widths.push(across);
  }
  if (widths.length < 3) return null;
  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length * 0.75)] / 2;
}

function maxAbs(points: Point[]): number {
  return points.reduce((m, p) => Math.max(m, Math.abs(p[0]), Math.abs(p[1])), 0);
}

function hardWater(geo: CityGeography, wide: WideRiver[], half: number): SkeletonWater[] {
  const water: SkeletonWater[] = [];
  const areas = geo.waterAreas?.length ? geo.waterAreas : geo.coast ? [{ ...geo.coast, kind: "ocean" as const }] : [];
  for (const area of areas) {
    const frame = Math.max(half, maxAbs(area.corridor)) + 1;
    const ring = closeCorridor(area.corridor, azimuthToVec(area.waterAzimuthDeg), frame);
    if (ring)
      water.push({ kind: area.kind === "lake" ? "lake" : area.kind === "river" ? "channel" : "sea", polygon: ring });
  }
  for (const channel of geo.channels ?? [])
    water.push({ kind: "channel", polygon: channel.polygon.map(p => [p[0], p[1]]) });
  const usedRings = new Set<Point[]>();
  for (const river of wide) {
    // Prefer FMG's surveyed banks; otherwise the course widened to its (drawn) width.
    const rings = river.rings.filter(ring => !usedRings.has(ring));
    for (const ring of rings) usedRings.add(ring);
    if (river.rings.length) for (const ring of rings) water.push({ kind: "channel", polygon: ring });
    else water.push({ kind: "channel", polygon: bandRing(river.corridor, river.halfWidth) });
  }
  return water;
}

interface WideRiver {
  corridor: Point[];
  halfWidth: number;
  rings: Point[][];
}

/**
 * Split `line` into its dry runs, cut exactly where it meets hard water.
 * Runs keep their original direction.
 */
export function dryRuns(line: Point[], water: SkeletonWater[]): Point[][] {
  const wetAt = (p: Point) => water.some(area => pointInPolygon(p, area.polygon));
  const runs: Point[][] = [];
  let current: Point[] = wetAt(line[0]) ? [] : [line[0]];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const cuts: { t: number; point: Point }[] = [];
    for (const area of water)
      for (let k = 0, j = area.polygon.length - 1; k < area.polygon.length; j = k++) {
        const hit = segmentSegmentHit(a, b, area.polygon[j], area.polygon[k]);
        if (hit) cuts.push(hit);
      }
    cuts.sort((x, y) => x.t - y.t);
    for (const cut of cuts) {
      const mid: Point = add(cut.point, sub(b, a), 1e-6);
      if (current.length) {
        current.push(cut.point);
        if (wetAt(mid)) {
          runs.push(current);
          current = [];
        }
      } else if (!wetAt(mid)) current = [cut.point];
    }
    if (current.length) current.push(b);
  }
  if (current.length >= 2) runs.push(current);
  return runs.filter(run => run.length >= 2);
}

function roadPaths(geo: CityGeography, half: number): { path: Point[]; fixed: boolean; sourceRoadIndex?: number }[] {
  if (geo.importedRoads !== undefined)
    return geo.importedRoads.map((road, sourceRoadIndex) => ({ path: road.path, fixed: true, sourceRoadIndex }));
  if (geo.roadPaths?.length) return geo.roadPaths.map(path => ({ path, fixed: false }));
  return geo.roadBearings.map(bearing => ({
    path: [[0, 0] as Point, add([0, 0], azimuthToVec(bearing), half * 1.5)],
    fixed: false
  }));
}

export function buildSkeletonInputs(source: SkeletonInputSource): SkeletonInputs {
  const { geo, program, params, settings } = source;
  const half = params.extentMeters / 2;
  const cellSize = params.cellSizeMeters;
  // FMG rivers drawn from surveyed banks are not in `geo.rivers` (mesh-first uses
  // the banks directly); the skeleton needs their courses.
  const courses = settings.descriptor ? skeletonRiverCourses(settings.descriptor) : geo.rivers;
  const banks = (settings.descriptor?.fixedCrossings?.rivers ?? []).flatMap(river =>
    river.rings.map(ring => ring.map(p => [p[0], p[1]] as Point))
  );
  const cityRadius = urbanDiskRadiusMeters(params.cityRadiusMeters, program.walls);
  const measured = courses
    .filter(river => river.corridor.length >= 2)
    .map((river, index) => {
      const corridor = river.corridor.map(p => [p[0], p[1]] as Point);
      const drawn = Math.max(...river.widths, 1) / 2;
      const surveyed = surveyedHalfWidth(corridor, banks, cellSize);
      const halfWidth = surveyed !== null && surveyed <= drawn * 1.2 ? surveyed : drawn;
      // A channel the era cannot bridge, or one as wide as the town, is hard water:
      // no wall can be set across it, and the town keeps to one bank.
      const wide = !river.bridgeAllowed || halfWidth * 2 >= cityRadius;
      const rings = banks.filter(ring => corridor.some(p => pointInPolygon(p, ring)));
      return { index, corridor, halfWidth, wide, rings };
    });
  const water = hardWater(
    geo,
    measured.filter(r => r.wide),
    half
  );

  const rivers: SkeletonRiver[] = [];
  for (const river of measured) {
    if (river.wide) continue;
    for (const run of dryRuns(river.corridor, water))
      if (polylineLength(run) >= cellSize)
        rivers.push({ index: river.index, centerline: run, halfWidth: river.halfWidth });
  }

  // Two channels that braid along each other are one river for walls and bridges:
  // keep the longer, widened to cover the other.
  for (let changed = true; changed; ) {
    changed = false;
    for (const a of rivers)
      for (const b of rivers) {
        if (a === b || polylineLength(a.centerline) < polylineLength(b.centerline)) continue;
        const samples = densifyLine(b.centerline, cellSize / 4);
        const near = samples.filter(p => distanceToPolyline(p, a.centerline) < a.halfWidth + b.halfWidth).length;
        if (near / samples.length < 0.3) continue;
        a.halfWidth += b.halfWidth;
        rivers.splice(rivers.indexOf(b), 1);
        changed = true;
        break;
      }
  }

  const fixedBridges = (settings.descriptor?.fixedCrossings?.crossings ?? []).map(c => ({
    point: [c.q[0], c.q[1]] as Point,
    skewDegrees: bridgeSkewDegrees(c.normal, c.tangent)
  }));
  const seen = new Set<string>();
  const roads: SkeletonRoad[] = [];
  for (const { path, fixed, sourceRoadIndex } of roadPaths(geo, half)) {
    if (path.length < 2) continue;
    const key = path.map(p => `${Math.round(p[0])},${Math.round(p[1])}`).join(";");
    if (seen.has(key) && !fixed) continue;
    seen.add(key);
    // A town centre a few metres into the water (synthetic capes) only loses
    // the road's wet head; the road then runs from the first dry point outward.
    const points = path.map(p => [p[0], p[1]] as Point);
    let runs = dryRuns(points, water);
    if (fixed) {
      // An FMG road keeps its certified bridges over hard water: rejoin the runs across them.
      const joined: Point[][] = [];
      for (const run of runs) {
        const last = joined[joined.length - 1];
        const gapEnd = last?.[last.length - 1];
        const bridged =
          gapEnd &&
          fixedBridges.some(b => dist(b.point, gapEnd) + dist(b.point, run[0]) <= dist(gapEnd, run[0]) + cellSize);
        if (bridged) last.push(...run);
        else joined.push([...run]);
      }
      runs = joined;
    }
    const trimmed = runs.find(run => polylineLength(run) >= cellSize);
    if (!trimmed) continue;
    const end = trimmed[trimmed.length - 1];
    const cut = dist(end, points[points.length - 1]) > 1e-6;
    let reachesFrame = !cut && Math.max(Math.abs(end[0]), Math.abs(end[1])) >= half;
    if (!cut && !reachesFrame) {
      // Synthetic courses stop short of the window; carry the last leg on to its edge when dry.
      const dir = unit(sub(end, trimmed[trimmed.length - 2]));
      const edge = exitSquare(end, dir, half);
      const extension = dryRuns([end, edge], water);
      if (extension.length === 1 && dist(extension[0][1], edge) < 1e-6) {
        trimmed.push(edge);
        reachesFrame = true;
      }
    }
    roads.push({
      id: roads.length,
      path: trimmed,
      fixed,
      reachesFrame,
      ...(sourceRoadIndex === undefined ? {} : { sourceRoadIndex })
    });
  }

  const wallWidth = Math.max(4, cellSize * 0.14);
  const historicalPeriod = settings.historicalPeriod ?? settings.descriptor?.historicalPeriod;
  return {
    half,
    cellSize,
    core: [0, 0],
    cityRadius,
    walls: program.walls,
    walledAreaShare: resolveWalledAreaShare(settings.walledAreaShare, params.extentMeters),
    water,
    rivers,
    roads,
    fixedBridges,
    bridgeSkewLimit: resolveBridgeSkewLimit(historicalPeriod, settings.descriptor?.transport),
    requiredExternalRoads: requiredExternalRoads(settings as GenerationSettings, params.extentMeters),
    wallWidth,
    minGateSpacing: minGateSpacingMeters(wallWidth)
  };
}
