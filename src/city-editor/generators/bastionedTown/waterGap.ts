// Open the main line where a river or the coast already is. Water is not moved.

import { bridgeSkewDegrees, withinBridgeSkewLimit } from "../../../utils/bridgeSkewPolicy";
import type { DefenseRegion, Point } from "../../types/document";
import type { SkeletonInputs, SkeletonRiver } from "../generation/skeleton/contracts";
import { add, dist, distanceToPolyline, polylineCrossings, sub, unit } from "../generation/skeleton/vector";
import { pointInPolygon, segmentSegmentHit } from "../geom";

const CHANNEL_MARGIN = 0.5;

export interface WaterOpening {
  curtainIndex: number;
  closure: "sluice" | "shore";
  /** Ring slots in walk order. Even slot 2i is bastion i. Odd slot 2i+1 is curtain i. */
  slots: number[];
}

export interface WaterClass {
  wetBastions: Set<number>;
  wetCurtains: Set<number>;
  boundaryKind: "inland-closed" | "waterfront";
  openings: WaterOpening[];
}

export function pointInChannel(point: Point, inputs: SkeletonInputs): boolean {
  if (inputs.water.some(area => pointInPolygon(point, area.polygon))) return true;
  return inputs.rivers.some(river => distanceToPolyline(point, river.centerline) < river.halfWidth + CHANNEL_MARGIN);
}

function onSea(point: Point, inputs: SkeletonInputs): boolean {
  return inputs.water.some(area => pointInPolygon(point, area.polygon));
}

function segmentHitsChannel(a: Point, b: Point, inputs: SkeletonInputs): boolean {
  if (!inputs.water.length && !inputs.rivers.length) return false;
  if (pointInChannel(a, inputs) || pointInChannel(b, inputs)) return true;
  const steps = Math.max(2, Math.ceil(dist(a, b) / 2));
  for (let step = 1; step < steps; step++) {
    const t = step / steps;
    const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (pointInChannel(point, inputs)) return true;
  }
  for (const area of inputs.water)
    for (let i = 0; i < area.polygon.length; i++)
      if (segmentSegmentHit(a, b, area.polygon[i], area.polygon[(i + 1) % area.polygon.length])) return true;
  for (const river of inputs.rivers)
    for (let i = 0; i + 1 < river.centerline.length; i++)
      if (segmentSegmentHit(a, b, river.centerline[i], river.centerline[i + 1])) return true;
  return false;
}

/** Dry bastions stay whole. A wet arc becomes one sluice or one shore closure. */
export function classifyMainLine(outer: Point[], sides: number, inputs: SkeletonInputs): WaterClass | null {
  const wetBastions = new Set<number>();
  const wetCurtains = new Set<number>();
  for (let i = 0; i < sides; i++) {
    const bastion = [0, 1, 2, 3, 4].map(k => outer[i * 5 + k]);
    if (bastion.some((point, index) => segmentHitsChannel(point, bastion[(index + 1) % 5], inputs))) wetBastions.add(i);
    const a = outer[i * 5 + 4];
    const b = outer[((i + 1) * 5) % outer.length];
    if (segmentHitsChannel(a, b, inputs)) wetCurtains.add(i);
  }
  if (!wetBastions.size && !wetCurtains.size)
    return { wetBastions, wetCurtains, boundaryKind: "inland-closed", openings: [] };

  const wetSlot = (slot: number) => (slot % 2 === 0 ? wetBastions.has(slot / 2) : wetCurtains.has((slot - 1) / 2));
  const runs: number[][] = [];
  let current: number[] = [];
  for (let slot = 0; slot < sides * 2; slot++) {
    if (wetSlot(slot)) current.push(slot);
    else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) {
    if (runs.length && runs[0][0] === 0) runs[0] = [...current, ...runs[0]];
    else runs.push(current);
  }
  const dry = Array.from({ length: sides }, (_, i) => i).filter(i => !wetBastions.has(i));
  if (dry.length < 3 || !runs.length || runs.length > 2) return null;

  let sea = false;
  for (const index of wetBastions) if ([0, 1, 2, 3, 4].some(k => onSea(outer[index * 5 + k], inputs))) sea = true;
  for (const index of wetCurtains) {
    const a = outer[index * 5 + 4];
    const b = outer[((index + 1) * 5) % outer.length];
    if (onSea(a, inputs) || onSea(b, inputs)) sea = true;
  }
  if (sea && runs.length !== 1) return null;

  const openings: WaterOpening[] = runs.map(run => {
    const curtains = run.filter(slot => slot % 2 === 1).map(slot => (slot - 1) / 2);
    const first = run[0];
    const curtainIndex = curtains[0] ?? (first % 2 === 0 ? first / 2 : (first - 1) / 2);
    return { curtainIndex, closure: sea ? "shore" : "sluice", slots: run };
  });
  return {
    wetBastions,
    wetCurtains,
    boundaryKind: sea ? "waterfront" : runs.length === 1 && wetBastions.size ? "waterfront" : "inland-closed",
    openings
  };
}

export function openingVertexRange(
  opening: WaterOpening,
  bastionStart: number[],
  bastionEnd: number[],
  sides: number
): [number, number] {
  const first = opening.slots[0];
  const last = opening.slots[opening.slots.length - 1];
  const start = first % 2 === 0 ? bastionStart[first / 2] : bastionEnd[(first - 1) / 2];
  const end = last % 2 === 0 ? bastionEnd[last / 2] : bastionStart[((last - 1) / 2 + 1) % sides];
  return [start, end];
}

function quadHits(innerA: Point, innerB: Point, outerB: Point, outerA: Point, inputs: SkeletonInputs): boolean {
  return (
    segmentHitsChannel(innerA, innerB, inputs) ||
    segmentHitsChannel(outerA, outerB, inputs) ||
    segmentHitsChannel(innerA, outerA, inputs) ||
    pointInChannel([(innerA[0] + outerB[0]) / 2, (innerA[1] + outerB[1]) / 2], inputs)
  );
}

/** Keep the holed band when the ring is dry. Otherwise emit one polygon per dry run. */
export function defenseBand(inner: Point[], outer: Point[], inputs: SkeletonInputs): DefenseRegion | null {
  if (inner.length !== outer.length || inner.length < 3) return null;
  const count = inner.length;
  const wet: boolean[] = [];
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    wet.push(quadHits(inner[i], inner[next], outer[next], outer[i], inputs));
  }
  if (wet.every(hit => !hit)) return [{ outer, holes: [inner] }];
  const pieces: DefenseRegion = [];
  let start = -1;
  const flush = (from: number, to: number) => {
    const innerPts: Point[] = [];
    const outerPts: Point[] = [];
    for (let i = from; i <= to; i++) {
      innerPts.push(inner[i % count]);
      outerPts.push(outer[i % count]);
    }
    if (innerPts.length >= 2) pieces.push({ outer: [...innerPts, ...outerPts.reverse()], holes: [] });
  };
  // Start after a wet edge so a dry run crossing index zero is emitted once.
  const first = wet.findIndex(Boolean) + 1;
  for (let i = first; i < first + count; i++) {
    if (!wet[i % count]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      flush(start, i);
      start = -1;
    }
  }
  return pieces.length ? pieces : null;
}

function inRiver(point: Point, river: SkeletonRiver): boolean {
  return distanceToPolyline(point, river.centerline) < river.halfWidth + CHANNEL_MARGIN;
}

function samePath(a: Point[], b: Point[]): boolean {
  return a.length === b.length && a.every((point, index) => point[0] === b[index][0] && point[1] === b[index][1]);
}

function riverCrossings(path: Point[], river: SkeletonRiver) {
  const hits = polylineCrossings(path, river.centerline);
  const unique: typeof hits = [];
  for (const hit of hits) {
    if (unique.some(item => dist(item.point, hit.point) < 1)) continue;
    unique.push(hit);
  }
  return unique;
}

function crossingSkew(path: Point[], river: SkeletonRiver, hit: { aIndex: number; bIndex: number }): number {
  const travel = sub(path[hit.aIndex + 1], path[hit.aIndex]);
  const tangent = sub(river.centerline[hit.bIndex + 1], river.centerline[hit.bIndex]);
  return bridgeSkewDegrees(travel, tangent);
}

/**
 * A generated path crosses on the river normal, once per intersection. A long
 * segment can meet a meander more than once; each span is squared. A fixed path
 * is kept only when every span is already inside the shared skew limit.
 */
export function squareRiverPath(
  path: Point[],
  inputs: SkeletonInputs,
  fixed: boolean,
  skewLimit: number
): Point[] | null {
  let current = path;
  for (let pass = 0; pass < inputs.rivers.length + 1; pass++) {
    let stable = true;
    for (const river of inputs.rivers) {
      const next = squareOne(current, river, fixed, skewLimit);
      if (!next) return null;
      if (!samePath(next, current)) stable = false;
      current = next;
    }
    if (stable) break;
  }
  for (const river of inputs.rivers) {
    if (
      riverCrossings(current, river).some(hit => !withinBridgeSkewLimit(crossingSkew(current, river, hit), skewLimit))
    )
      return null;
  }
  if (current.some(point => inputs.water.some(area => pointInPolygon(point, area.polygon)))) return null;
  return current.length >= 2 ? current : null;
}

function squareOne(path: Point[], river: SkeletonRiver, fixed: boolean, skewLimit: number): Point[] | null {
  let current = path;
  for (let pass = 0; pass < 16; pass++) {
    const hits = riverCrossings(current, river);
    // A generated span lies on the normal, so its skew is about 0. Anything
    // else is still the old diagonal and has to be replaced. Fixed paths are
    // judged only against the shared limit.
    const bad = hits.find(hit =>
      fixed
        ? !withinBridgeSkewLimit(crossingSkew(current, river, hit), skewLimit)
        : crossingSkew(current, river, hit) > 0.5
    );
    if (!bad) return current.length >= 2 ? current : null;
    if (fixed) return null;
    const next = insertNormalSpan(current, river, bad, skewLimit);
    if (!next || samePath(next, current)) return null;
    current = next;
  }
  return null;
}

function insertNormalSpan(
  path: Point[],
  river: SkeletonRiver,
  hit: { point: Point; aIndex: number; bIndex: number },
  skewLimit: number
): Point[] | null {
  const tangent = unit(sub(river.centerline[hit.bIndex + 1], river.centerline[hit.bIndex]));
  const travel = sub(path[hit.aIndex + 1], path[hit.aIndex]);
  let normal: Point = [-tangent[1], tangent[0]];
  if (travel[0] * normal[0] + travel[1] * normal[1] < 0) normal = [-normal[0], -normal[1]];
  let reach = river.halfWidth + CHANNEL_MARGIN;
  let span0 = add(hit.point, normal, -reach);
  let span1 = add(hit.point, normal, reach);
  for (let grow = 0; grow < 6 && (inRiver(span0, river) || inRiver(span1, river)); grow++) {
    reach += 2;
    span0 = add(hit.point, normal, -reach);
    span1 = add(hit.point, normal, reach);
  }
  if (inRiver(span0, river) || inRiver(span1, river)) return null;
  if (!withinBridgeSkewLimit(bridgeSkewDegrees(sub(span1, span0), tangent), skewLimit)) return null;
  const head = path.slice(0, hit.aIndex + 1);
  const tail = path.slice(hit.aIndex + 1);
  while (head.length > 1 && inRiver(head[head.length - 1], river)) head.pop();
  while (tail.length > 1 && inRiver(tail[0], river)) tail.shift();
  const out = [...head];
  const push = (point: Point) => {
    const last = out[out.length - 1];
    if (!last || dist(last, point) > 0.05) out.push(point);
  };
  push(span0);
  push(span1);
  for (const point of tail) push(point);
  return out.length >= 2 ? out : null;
}
