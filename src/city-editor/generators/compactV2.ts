import type { Point } from "../types/primitives";
import type { VectorBlock, VectorPolygon } from "../types/vector/generation";
import { clipToBox, tidyRing } from "./burgage/frame";
import type { Front } from "./frontageBuildings.types";
import { isSimplePolygon, nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { houseFootprint } from "./houseFootprint";
import { clipHalfPlane, insetConvexKernel } from "./lotGeometry";
import type { Rng } from "./prng";
import { regionArea, regionBoolean } from "./vector/geometry/regions";
import { simpleContour } from "./vector/geometry/surfaces";

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Point, s: number): Point => [a[0] * s, a[1] * s];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const area = (p: Point[]) => Math.abs(polygonArea(p));
const unit = (v: Point): Point => {
  const l = Math.hypot(v[0], v[1]);
  return l > 1e-7 ? [v[0] / l, v[1] / l] : [1, 0];
};
const perimeterOf = (ring: Point[]) => ring.reduce((sum, p, i) => sum + distance(p, ring[(i + 1) % ring.length]), 0);
const meanWidth = (ring: Point[]) => {
  const p = perimeterOf(ring);
  return p > 1e-6 ? (2 * area(ring)) / p : 0;
};

/**
 * Cut a skeleton block with holes into simple parts along the shortest line from each hole to the nearest
 * outer boundary edge, preferring edges that front an existing road (docs/plan/ce-meshless-compact-block-improvements.md
 * Task D). Falls back to a vertical slit only when every geometric cut fails.
 */
export function withoutHolesNatural(block: VectorBlock): VectorBlock[] {
  if (!block.holes.length) return [block];
  const roadSegments = block.frontage.map(f => [f.from, f.to] as const);
  const onRoad = (a: Point, b: Point) => {
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return roadSegments.some(([p, q]) => nearestOnPolyline(mid, [p, q]).dist < 0.5);
  };
  let parts: VectorPolygon[] = [{ outer: block.outer, holes: block.holes }];
  for (let guard = 0; guard < 16 && parts.some(p => p.holes.length); guard++)
    parts = parts.flatMap(part => {
      if (!part.holes.length) return [part];
      const hole = part.holes[0];
      const candidates: { from: Point; to: Point; score: number }[] = [];
      for (let i = 0; i < part.outer.length; i++) {
        const a = part.outer[i],
          b = part.outer[(i + 1) % part.outer.length];
        if (distance(a, b) < 0.5) continue;
        const weight = onRoad(a, b) ? 0.7 : 1;
        for (const v of hole) {
          const hit = nearestOnPolyline(v, [a, b]);
          if (hit.dist < 0.05) continue;
          candidates.push({ from: v, to: hit.point, score: hit.dist * weight });
        }
      }
      const holeCenter = polygonCentroid(hole);
      for (let i = 0; i < part.outer.length; i++) {
        const a = part.outer[i],
          b = part.outer[(i + 1) % part.outer.length];
        if (distance(a, b) < 0.5) continue;
        const hit = nearestOnPolyline(holeCenter, [a, b]);
        candidates.push({ from: holeCenter, to: hit.point, score: hit.dist * 1.2 + 5 });
      }
      candidates.sort((a, b) => a.score - b.score);
      // Try the best few shortest cuts, ensuring the cut actually reduces the hole count without degenerating.
      for (const cand of candidates.slice(0, 12)) {
        const dir = unit(sub(cand.to, cand.from)),
          normal: Point = [-dir[1], dir[0]],
          p0 = sub(cand.from, scale(dir, 1.5)),
          p1 = add(cand.to, scale(dir, 1.5)),
          half = scale(normal, 0.1);
        const slit: VectorPolygon = {
          outer: [add(p0, half), add(p1, half), sub(p1, half), sub(p0, half)],
          holes: []
        };
        try {
          const cut = regionBoolean([part], [slit], "difference");
          const holeCount = cut.reduce((n, r) => n + r.holes.length, 0);
          if (cut.length && holeCount < part.holes.length) return cut;
        } catch {
          // try next candidate
        }
      }
      // Fallback: original vertical slit through the hole centroid.
      const [x] = holeCenter,
        ys = part.outer.map(p => p[1]),
        low = Math.min(...ys) - 1,
        high = Math.max(...ys) + 1;
      return regionBoolean(
        [part],
        [
          {
            outer: [
              [x - 0.1, low],
              [x + 0.1, low],
              [x + 0.1, high],
              [x - 0.1, high]
            ],
            holes: []
          }
        ],
        "difference"
      );
    });
  return parts
    .filter(p => regionArea(p) > 100)
    .map((p, i) => ({
      ...block,
      id: `${block.id}:part:${i}`,
      outer: p.outer,
      holes: p.holes,
      areaMeters2: regionArea(p)
    }));
}

export interface CompactV2Options {
  hub: Point;
  reach: number;
  lotArea: number;
  coverage: number;
  occupancy: number;
  rowDepth: number;
  laneWidth: number;
}

export interface CompactV2Building {
  polygon: Point[];
  draw: number;
  front: [Point, Point];
  frontInward: Point;
  rear?: true;
}

export interface CompactV2BlockLayout {
  buildings: CompactV2Building[];
  plots: { ring: Point[]; front: [Point, Point] }[];
  entryLanes: { points: Point[]; widthMeters: number }[];
}

/** Corner inner angle bounds (60°–120°) eligible for an Eckhaus corner building. */
const CORNER_COS_LIMIT = Math.cos((60 * Math.PI) / 180);
const MIN_CORE_AREA_M2 = 25;
const MIN_CORE_WIDTH_M = 2.5;
const LARGE_CORE_AREA_M2 = 220;
const LARGE_CORE_WIDTH_M = 14;
const REAR_MIN_PLOT_DEPTH_M = 22;
const REAR_MIN_FRONTAGE_M = 4.5;

/**
 * Pack a convex compact-v2 block with:
 * - hub/primary lot-size gradient (Task E-1),
 * - corner-first Eckhaus placements and short-side return frontages without blind gable walls (Task B),
 * - continuous street-wall row packing with paired shared spines on shallow blocks,
 * - private backyard Voronoi plots or an entry-lane shared courtyard (Hof) for interior cores (Task A),
 * - optional low-rise rear outbuildings inside deep private yards (Task A).
 */
export function packCompactV2Block(
  poly: Point[],
  block: Point[],
  fronts: Front[],
  options: CompactV2Options,
  rng: Rng
): CompactV2BlockLayout {
  const empty: CompactV2BlockLayout = { buildings: [], plots: [], entryLanes: [] };
  if (block.length < 3 || !fronts.length || options.coverage <= 0 || options.occupancy <= 0) return empty;
  const center = polygonCentroid(block),
    distRatio = Math.min(1, distance(center, options.hub) / Math.max(80, options.reach));

  // Compute maximum usable row depth from block geometry.
  let low = 0,
    high = Math.sqrt(area(block));
  const yardArea = area(block) * (1 - Math.min(1, options.coverage));
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (
      area(
        insetConvexKernel(
          block,
          block.map(() => mid)
        )
      ) > yardArea
    )
      low = mid;
    else high = mid;
  }
  const baseDepth = Math.min(high, options.rowDepth);

  // Task E-1: gradual frontage and depth gradient from core/primary arterials to outer lanes while preserving density.
  const baseWidth = Math.max(3.8, Math.min(5.2, Math.sqrt(options.lotArea) * 0.52));
  const depthFor = (front: Front) => {
    const factor = front.primary ? 1.12 : 1.06 - 0.14 * distRatio;
    return Math.max(6.8, Math.min(high, baseDepth * factor));
  };
  const widthFor = (front: Front) => {
    if (front.primary) return Math.max(3.8, baseWidth * (0.94 + 0.14 * distRatio));
    return Math.max(3.8, baseWidth * (0.98 + 0.24 * distRatio));
  };

  const maxEdgeLen = Math.max(...fronts.map(f => f.length));
  const isShortSide = (f: Front) => f.length >= 8 && f.length <= 35 && f.length < maxEdgeLen * 0.78;

  // Estimate interior core size to decide whether to open a shared courtyard (Hof) passage.
  const blockEdgeDepths = block.map((a, i) => {
    const b = block[(i + 1) % block.length],
      mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      matched = fronts.find(f => Math.abs(dot(mid, f.inward) - f.offset) < 1e-3);
    return matched ? depthFor(matched) : 0;
  });
  const estCore = insetConvexKernel(block, blockEdgeDepths),
    estCoreArea = estCore.length >= 3 ? area(estCore) : 0,
    estCoreWidth = estCore.length >= 3 ? meanWidth(estCore) : 0,
    largeCore = estCoreArea >= LARGE_CORE_AREA_M2 && estCoreWidth >= LARGE_CORE_WIDTH_M,
    sharedCourt = largeCore && rng() < (distRatio < 0.45 ? 0.35 : 0.6);

  const reserved: [number, number][][] = fronts.map(() => []);
  const cornerDepthOnFront: number[] = fronts.map(() => 0);
  const frontHasDoor: boolean[] = fronts.map(() => false);
  const placed: CompactV2Building[] = [];
  const entryLanes: { points: Point[]; widthMeters: number }[] = [];

  // Measure block span across each front so corner houses and opposing rows never collide across shallow blocks.
  const frontSpan = fronts.map(f => Math.max(...block.map(p => dot(p, f.inward) - f.offset)));

  // Task B: corner-first Eckhaus buildings at well-shaped street corners (60°–120°).
  interface CornerCandidate {
    i: number;
    j: number;
    vertex: Point;
    alongI: Point;
    alongJ: Point;
    iAtStart: boolean;
    jAtStart: boolean;
    priority: number;
  }
  const endOf = (f: Front, atStart: boolean): Point => (atStart ? f.a : add(f.a, scale(f.axis, f.length)));
  const corners: CornerCandidate[] = [];
  for (let i = 0; i < fronts.length; i++) {
    for (let j = i + 1; j < fronts.length; j++) {
      const fi = fronts[i],
        fj = fronts[j];
      for (const iAtStart of [true, false]) {
        for (const jAtStart of [true, false]) {
          const pi = endOf(fi, iAtStart),
            pj = endOf(fj, jAtStart);
          if (distance(pi, pj) > 1e-4) continue;
          const alongI: Point = iAtStart ? fi.axis : [-fi.axis[0], -fi.axis[1]],
            alongJ: Point = jAtStart ? fj.axis : [-fj.axis[0], -fj.axis[1]];
          if (Math.abs(dot(alongI, alongJ)) > CORNER_COS_LIMIT) continue;
          if (dot(alongI, fj.inward) < 0.5 || dot(alongJ, fi.inward) < 0.5) continue;
          const priority = (fi.primary ? 2 : 0) + (fj.primary ? 2 : 0) + (fi.length + fj.length) * 0.001;
          corners.push({ i, j, vertex: pi, alongI, alongJ, iAtStart, jAtStart, priority });
        }
      }
    }
  }
  corners.sort((a, b) => b.priority - a.priority);

  // Corner leg limit along an edge: leave a clean return span (>= 4.2 m) on medium short sides (14–22 m),
  // or meet cleanly at L/2 on compact short sides (10–14 m) without leaving an unbuildable 2 m gap.
  const cornerLegCap = (edgeLen: number, crossDepth: number, crossSpan: number) => {
    const geomCap = Math.min(crossDepth, crossSpan * 0.49);
    if (edgeLen < 14) return Math.min(geomCap, edgeLen * 0.495);
    if (edgeLen < 22) return Math.min(geomCap, Math.max(4.5, (edgeLen - 4.4) * 0.5));
    return Math.min(geomCap, edgeLen * 0.36);
  };

  for (const c of corners) {
    const fi = fronts[c.i],
      fj = fronts[c.j],
      maxA = cornerLegCap(fi.length, depthFor(fj), frontSpan[c.j]),
      maxB = cornerLegCap(fj.length, depthFor(fi), frontSpan[c.i]);
    if (maxA < 4.2 || maxB < 4.2) continue;
    // Match shallow-short-side half-width cleanly so paired corners meet wall-to-wall with zero gap.
    const sA = fi.length < 14 && maxA <= 7.8 ? maxA : Math.min(maxA, rng.range(5.6, 8.0)),
      sB = fj.length < 14 && maxB <= 7.8 ? maxB : Math.min(maxB, rng.range(5.6, 8.0));
    if (sA < 4.2 || sB < 4.2) continue;
    const draw = rng();
    if (draw >= options.occupancy) continue;
    const pA = add(c.vertex, scale(c.alongI, sA)),
      pB = add(c.vertex, scale(c.alongJ, sB)),
      pAB = add(pA, scale(c.alongJ, sB));
    const rawQuad = [c.vertex, pA, pAB, pB];
    const quad = polygonArea(rawQuad) < 0 ? rawQuad.reverse() : rawQuad;
    if (area(quad) < 20 || !isSimplePolygon(quad)) continue;
    if (!quad.every(p => insideConvex(p, block))) continue;
    if (placed.some(b => overlapArea(quad, b.polygon) > 1e-3)) continue;

    // Orient Eckhaus entrance: if a short side has no entrance yet and is too narrow for its own middle house
    // (or needs a live return facade), turn this corner house's front onto the short side.
    const iShort = isShortSide(fi),
      jShort = isShortSide(fj);
    let useI: boolean;
    if (iShort && !frontHasDoor[c.i] && !fj.primary) useI = true;
    else if (jShort && !frontHasDoor[c.j] && !fi.primary) useI = false;
    else if (iShort && fi.length < 14 && !frontHasDoor[c.i]) useI = true;
    else if (jShort && fj.length < 14 && !frontHasDoor[c.j]) useI = false;
    else useI = fi.primary !== fj.primary ? fi.primary : fi.length >= fj.length;

    const houseFront: [Point, Point] = useI ? [c.vertex, pA] : [c.vertex, pB];
    const frontInward = useI ? fi.inward : fj.inward;
    placed.push({
      polygon: shrinkHair(quad),
      draw,
      front: houseFront,
      frontInward
    });
    frontHasDoor[useI ? c.i : c.j] = true;
    reserved[c.i].push(c.iAtStart ? [0, sA] : [fi.length - sA, fi.length]);
    reserved[c.j].push(c.jAtStart ? [0, sB] : [fj.length - sB, fj.length]);
    cornerDepthOnFront[c.i] = Math.max(cornerDepthOnFront[c.i], sB);
    cornerDepthOnFront[c.j] = Math.max(cornerDepthOnFront[c.j], sA);
  }

  // Task A (large shared court): reserve an entry passage on one accessible edge into the interior Hof.
  if (sharedCourt && estCore.length >= 3) {
    const coreCenter = polygonCentroid(estCore),
      passageWidth = Math.max(2.2, Math.min(2.6, options.laneWidth)),
      reserveWidth = passageWidth + 0.4;
    const entryCandidates = fronts
      .map((f, idx) => ({
        f,
        idx,
        spans: openSpans(f.length, reserved[idx]).filter(([a, b]) => b - a >= reserveWidth + 7)
      }))
      .filter(item => item.spans.length > 0)
      .sort(
        (a, b) =>
          Number(a.f.primary) - Number(b.f.primary) ||
          Math.max(...b.spans.map(([x, y]) => y - x)) - Math.max(...a.spans.map(([x, y]) => y - x))
      );
    const chosen = entryCandidates[0];
    if (chosen) {
      const span = chosen.spans.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0],
        midS = (span[0] + span[1]) / 2,
        entryFront = add(chosen.f.a, scale(chosen.f.axis, midS)),
        outerHit = nearestOnPolyline(entryFront, [...poly, poly[0]]),
        inwardReach = Math.min(
          depthFor(chosen.f) + 1.8,
          Math.max(4, dot(sub(coreCenter, entryFront), chosen.f.inward))
        ),
        innerEnd = add(entryFront, scale(chosen.f.inward, inwardReach));
      if (distance(outerHit.point, innerEnd) >= 3 && pointInPolygon(innerEnd, block)) {
        reserved[chosen.idx].push([midS - reserveWidth / 2, midS + reserveWidth / 2]);
        entryLanes.push({ points: [outerHit.point, innerEnd], widthMeters: passageWidth });
      }
    }
  }

  // Task B + dense street wall: pack open spans along every edge using sequential unassigned carving
  // (no 45° Voronoi bevel notches). Pack short return sides BEFORE long sides so cross streets always keep doors,
  // while keeping short-side depth flush with adjacent corner buildings so long-side rows run cleanly wall-to-wall.
  const orderedIndices = fronts
    .map((_, i) => i)
    .sort((a, b) => {
      const aShort = isShortSide(fronts[a]),
        bShort = isShortSide(fronts[b]);
      if (aShort !== bShort) return Number(bShort) - Number(aShort);
      return Number(fronts[b].primary) - Number(fronts[a].primary) || fronts[b].length - fronts[a].length;
    });

  // Identify paired opposite long fronts so shallow blocks share a clean back-to-back spine like packPerimeter.
  const longFronts = fronts
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !isShortSide(f))
    .sort((a, b) => Number(b.f.primary) - Number(a.f.primary) || b.f.length - a.f.length);
  const pairLimit = new Map<number, number>();
  if (longFronts.length >= 2) {
    const first = longFronts[0];
    const opp = longFronts
      .slice(1)
      .sort((a, b) => dot(a.f.inward, first.f.inward) - dot(b.f.inward, first.f.inward))[0];
    if (opp && dot(opp.f.inward, first.f.inward) < -0.35) {
      const span = frontSpan[first.i];
      if (span <= depthFor(first.f) + depthFor(opp.f) + 2) {
        pairLimit.set(first.i, span * 0.5);
        pairLimit.set(opp.i, span * 0.5);
      }
    }
  }

  let unassigned = block;
  for (const fi of orderedIndices) {
    const front = fronts[fi],
      shortSide = isShortSide(front),
      targetWidth = widthFor(front),
      baseFrontDepth = pairLimit.get(fi) ?? depthFor(front),
      // Keep short-side return rows flush with adjacent Eckhaus corner depth so they never collide with long rows.
      rowDepth = shortSide
        ? Math.min(
            baseFrontDepth,
            frontSpan[fi] * 0.45,
            cornerDepthOnFront[fi] > 4.2 ? cornerDepthOnFront[fi] : Math.min(baseFrontDepth, 8.8)
          )
        : Math.min(baseFrontDepth, frontSpan[fi] * 0.5);

    const spans = openSpans(front.length, reserved[fi]);
    if (!spans.length) continue;

    // Carve this front's strip from the remaining unassigned convex core (when no corners are present on this side)
    // or directly from `block` constrained to the open spans (when corners already bracket the span).
    const hasReserved = reserved[fi].length > 0;
    const sourcePoly = hasReserved ? block : unassigned;
    if (sourcePoly.length < 3) continue;
    const rawBand = cleanPoly(clipHalfPlane(sourcePoly, front.inward, front.offset + rowDepth));
    if (rawBand.length < 3 || area(rawBand) < 12) continue;

    let anyPlacedOnFront = false;
    for (const [spanLo, spanHi] of spans) {
      const spanLen = spanHi - spanLo;
      if (spanLen < 3.2) continue;
      let spanBand = cleanPoly(
        clipHalfPlane(
          clipHalfPlane(rawBand, [-front.axis[0], -front.axis[1]], -(dot(front.a, front.axis) + spanLo)),
          front.axis,
          dot(front.a, front.axis) + spanHi
        )
      );
      // Trim away any perpendicular strip already claimed by previously placed non-corner rows on other fronts.
      if (hasReserved && unassigned.length >= 3) {
        const clipped = intersectConvexPolys(spanBand, unassigned);
        if (clipped.length >= 3 && area(clipped) >= 12) spanBand = clipped;
      }
      if (spanBand.length < 3 || area(spanBand) < 12) continue;
      const lots = partitionSpan(spanBand, front, spanLo, spanHi, targetWidth, fronts, rng);
      for (const lot of lots) {
        const draw = rng();
        if (draw >= options.occupancy) continue;
        const house = houseFootprint(lot, fronts, front.axis);
        if (house.length < 4 || area(house) < 12) continue;
        if (placed.some(b => overlapArea(house, b.polygon) > 1e-3)) continue;
        const frontEdge = streetEdgeOf(house, front);
        if (!frontEdge) continue;
        placed.push({
          polygon: shrinkHair(house),
          draw,
          front: frontEdge,
          frontInward: front.inward
        });
        anyPlacedOnFront = true;
        frontHasDoor[fi] = true;
      }
    }
    if (anyPlacedOnFront) {
      const next = cleanPoly(
        clipHalfPlane(unassigned, [-front.inward[0], -front.inward[1]], -(front.offset + rowDepth))
      );
      if (next.length >= 3) unassigned = next;
      else unassigned = [];
    }
  }

  // Task A: convert non-shared interior cores into private Voronoi backyard plots (+ low-rise rear ranges in deep plots).
  const plots: { ring: Point[]; front: [Point, Point] }[] = [];
  if (!sharedCourt && placed.length >= 2) {
    let remainder: VectorPolygon[] = [];
    try {
      remainder = regionBoolean(
        [{ outer: block, holes: [] }],
        placed.map(b => ({ outer: b.polygon, holes: [] })),
        "difference"
      ).filter(r => regionArea(r) > 1);
    } catch {
      remainder = [];
    }
    const coreArea = remainder.reduce((sum, r) => sum + regionArea(r), 0),
      maxCoreWidth = Math.max(0, ...remainder.map(r => meanWidth(r.outer)));
    if (coreArea >= MIN_CORE_AREA_M2 && maxCoreWidth >= MIN_CORE_WIDTH_M) {
      // Anchor each house's Voronoi cell at its rear midpoint so the backyard behind it belongs cleanly to it.
      const sites = placed.map(b => {
        const c = polygonCentroid(b.polygon),
          [fa, fb] = b.front,
          fm: Point = [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2];
        return add(c, scale(sub(c, fm), 0.7));
      });
      const rearAdded: CompactV2Building[] = [];
      for (let i = 0; i < placed.length; i++) {
        let cell = block;
        for (let j = 0; j < placed.length && cell.length >= 3; j++) {
          if (i === j) continue;
          const mid: Point = [(sites[i][0] + sites[j][0]) / 2, (sites[i][1] + sites[j][1]) / 2],
            normal = sub(sites[j], sites[i]);
          if (Math.hypot(normal[0], normal[1]) < 1e-6) continue;
          cell = clipHalfPlane(cell, normal, dot(mid, normal));
        }
        const housePoly: VectorPolygon = { outer: placed[i].polygon, holes: [] };
        let plotRing: Point[] | undefined;
        if (cell.length >= 3 && area(cell) > 1) {
          try {
            const yardPieces = regionBoolean(remainder, [{ outer: cell, holes: [] }], "intersection").filter(
              p =>
                !p.holes.length &&
                regionArea(p) > 0.5 &&
                p.outer.some(q => nearestOnPolyline(q, [...placed[i].polygon, placed[i].polygon[0]]).dist < 0.35)
            );
            if (yardPieces.length) {
              const joined = regionBoolean([housePoly, ...yardPieces], [], "union");
              if (joined.length === 1 && !joined[0].holes.length && simpleContour(joined[0].outer, true))
                plotRing = tidyRing(joined[0].outer);
            }
          } catch {
            // fall back to house polygon alone
          }
        }
        const finalRing = plotRing && plotRing.length >= 3 ? plotRing : placed[i].polygon;
        plots.push({ ring: finalRing, front: placed[i].front });

        // Deep private yard inside a large core: offer a low-rise rear outbuilding behind a 4–5.5 m court.
        if (largeCore && plotRing && plotRing.length >= 3) {
          const rear = makeRearBuilding(plotRing, placed[i], rng);
          if (rear && !placed.some(b => overlapArea(rear, b.polygon) > 1e-3))
            rearAdded.push({
              polygon: shrinkHair(rear),
              draw: 0.5 + 0.5 * rng(),
              front: placed[i].front,
              frontInward: placed[i].frontInward,
              rear: true
            });
        }
      }
      placed.push(...rearAdded);
    }
  }

  return { buildings: placed, plots, entryLanes };
}

function makeRearBuilding(plotRing: Point[], frontHouse: CompactV2Building, rng: Rng): Point[] | undefined {
  const [a, b] = frontHouse.front,
    frontage = distance(a, b);
  if (frontage < REAR_MIN_FRONTAGE_M) return undefined;
  const u = unit(sub(b, a)),
    v = frontHouse.frontInward,
    frame = { origin: a, u, v };
  const houseDepth = Math.max(...frontHouse.polygon.map(p => dot(sub(p, a), v))),
    plotDepth = Math.max(...plotRing.map(p => dot(sub(p, a), v)));
  if (plotDepth < REAR_MIN_PLOT_DEPTH_M) return undefined;
  const court = rng.range(4.0, 5.5),
    from = houseDepth + court,
    depth = rng.range(5.5, 7.5),
    to = Math.min(from + depth, plotDepth - 1.5);
  if (to - from < 4.5) return undefined;
  // Leave a 1.2 m side passage when frontage permits.
  const passage = frontage >= 5.2 ? 1.2 : 0,
    left = rng() < 0.5;
  const raw = clipToBox(plotRing, frame, left ? passage : 0, left ? frontage : frontage - passage, from, to);
  if (raw.length < 3 || area(raw) < 16 || !isSimplePolygon(raw)) return undefined;
  // Keep only near-rectangular rear buildings (avoid triangular tail scraps).
  const rearFront = Math.max(...raw.map(p => dot(sub(p, a), u))) - Math.min(...raw.map(p => dot(sub(p, a), u))),
    rearDepth = Math.max(...raw.map(p => dot(sub(p, a), v))) - Math.min(...raw.map(p => dot(sub(p, a), v)));
  if (rearFront < 3.0 || rearDepth < 3.5 || area(raw) < 0.72 * rearFront * rearDepth) return undefined;
  return raw;
}

function partitionSpan(
  band: Point[],
  front: Front,
  spanLo: number,
  spanHi: number,
  targetWidth: number,
  fronts: Front[],
  rng: Rng
): Point[][] {
  const spanLen = spanHi - spanLo,
    count = Math.max(1, Math.min(128, Math.round(spanLen / targetWidth))),
    weights = Array.from({ length: count }, () => rng.range(0.88, 1.12)),
    total = weights.reduce((s, w) => s + w, 0),
    base = dot(front.a, front.axis),
    cuts = [base + spanLo];
  for (const w of weights) cuts.push(cuts[cuts.length - 1] + (spanLen * w) / total);
  cuts[cuts.length - 1] = base + spanHi;
  const slice = (lo: number, hi: number) =>
    cleanPoly(clipHalfPlane(clipHalfPlane(band, [-front.axis[0], -front.axis[1]], -lo), front.axis, hi));
  const scoreLot = (lot: Point[]) => {
    if (lot.length < 3 || area(lot) < 12) return 0;
    const h = houseFootprint(lot, fronts, front.axis);
    if (h.length < 4 || area(h) < 12 || area(h) < area(lot) * 0.45 || !streetEdgeOf(h, front)) return 0;
    const normal: Point = [-front.axis[1], front.axis[0]],
      xs = h.map(p => dot(p, front.axis)),
      ys = h.map(p => dot(p, normal)),
      w = Math.max(...xs) - Math.min(...xs),
      d = Math.max(...ys) - Math.min(...ys);
    if (Math.min(w, d) < 2.5) return 0;
    return area(h) / (w * d);
  };
  for (let i = 0; i < cuts.length - 1; ) {
    if (scoreLot(slice(cuts[i], cuts[i + 1])) >= 0.55) {
      i++;
      continue;
    }
    if (cuts.length === 2) return [];
    let adjusted: { boundary: number; pos: number; score: number } | undefined;
    for (const boundary of [i, i + 1]) {
      if (boundary <= 0 || boundary >= cuts.length - 1) continue;
      const lo = cuts[boundary - 1],
        hi = cuts[boundary + 1];
      for (let step = 1; step < 16; step++) {
        const pos = lo + ((hi - lo) * step) / 16,
          qa = scoreLot(slice(lo, pos)),
          qb = scoreLot(slice(pos, hi));
        if (qa < 0.55 || qb < 0.55) continue;
        const sc = qa + qb - Math.abs(pos - (lo + hi) / 2) / (hi - lo);
        if (!adjusted || sc > adjusted.score) adjusted = { boundary, pos, score: sc };
      }
    }
    if (adjusted) {
      cuts[adjusted.boundary] = adjusted.pos;
      i = Math.max(0, i - 1);
      continue;
    }
    const left = i > 0 ? scoreLot(slice(cuts[i - 1], cuts[i + 1])) : -1,
      right = i < cuts.length - 2 ? scoreLot(slice(cuts[i], cuts[i + 2])) : -1;
    cuts.splice(left > right ? i : i + 1, 1);
    i = Math.max(0, i - 1);
  }
  return cuts.slice(1).map((hi, i) => slice(cuts[i], hi));
}

function streetEdgeOf(house: Point[], front: Front): [Point, Point] | undefined {
  const on = house.filter(p => Math.abs(dot(p, front.inward) - front.offset) < 0.05);
  if (on.length < 2) return undefined;
  on.sort((a, b) => dot(a, front.axis) - dot(b, front.axis));
  const a = on[0],
    b = on[on.length - 1];
  return distance(a, b) >= 2.2 ? [a, b] : undefined;
}

function openSpans(length: number, reserved: [number, number][]): [number, number][] {
  const cuts = reserved
    .map(([a, b]) => [Math.max(0, a), Math.min(length, b)] as [number, number])
    .filter(([a, b]) => b - a > 1e-6)
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let x = 0;
  for (const [a, b] of cuts) {
    if (a - x >= 3.2) out.push([x, a]);
    x = Math.max(x, b);
  }
  if (length - x >= 3.2) out.push([x, length]);
  return out;
}

function cleanPoly(poly: Point[]): Point[] {
  const distinct = poly.filter((p, i) => distance(p, poly[(i + 1) % poly.length]) > 1e-7);
  return distinct.filter((p, i) => {
    const a = distinct[(i + distinct.length - 1) % distinct.length],
      b = distinct[(i + 1) % distinct.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-7;
  });
}

function shrinkHair(poly: Point[]): Point[] {
  const c = polygonCentroid(poly);
  return poly.map((p): Point => [p[0] + (c[0] - p[0]) * 1e-7, p[1] + (c[1] - p[1]) * 1e-7]);
}

function insideConvex(p: Point, poly: Point[]): boolean {
  const sign = -Math.sign(polygonArea(poly));
  if (!sign) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    if (sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < -1e-6) return false;
  }
  return true;
}

function intersectConvexPolys(a: Point[], b: Point[]): Point[] {
  let result = a;
  const sign = -Math.sign(polygonArea(b));
  if (!sign) return [];
  for (let i = 0; i < b.length && result.length >= 3; i++) {
    const p = b[i],
      q = b[(i + 1) % b.length],
      n: Point = [sign * (q[1] - p[1]), sign * (p[0] - q[0])];
    result = clipHalfPlane(result, n, p[0] * n[0] + p[1] * n[1]);
  }
  return cleanPoly(result);
}

function overlapArea(a: Point[], b: Point[]): number {
  const result = intersectConvexPolys(a, b);
  return result.length >= 3 ? area(result) : 0;
}
