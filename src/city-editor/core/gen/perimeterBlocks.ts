import type { DistrictParameters, Face, Point } from "../types";
import { frontageBuildings } from "./frontageBuildings";
import { pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { dwellingLotArea, intramuralBlockSpan } from "./housing";
import type { CityFabric, InfillLane } from "./localInfill";
import { clipHalfPlane, insetConvexKernel, longestFrame } from "./lotGeometry";
import { makeRng, type Rng } from "./prng";
import { computeDelaunayEdges } from "./voronoi";

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const area = (p: Point[]) => Math.abs(polygonArea(p));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const key = (p: Point) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;

/** Remove only duplicate/collinear vertices, not meaningful bends in an edited boundary. */
function clean(poly: Point[]): Point[] {
  const distinct = poly.filter((p, i) => distance(p, poly[(i + 1) % poly.length]) > 1e-6);
  return distinct.filter((p, i) => {
    const a = distinct[(i + distinct.length - 1) % distinct.length],
      b = distinct[(i + 1) % distinct.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6;
  });
}

/** Intervals of a line inside a simple (possibly concave) polygon. */
export function streetChords(poly: Point[], normal: Point, offset: number, insideOnly = false): [Point, Point][] {
  const hits = new Map<string, Point>();
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const da = signedDistance(a, normal, offset),
      db = signedDistance(b, normal, offset);
    if (Math.abs(da) < 1e-7) hits.set(key(a), a);
    if (da * db < 0) {
      const t = da / (da - db);
      const p: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      hits.set(key(p), p);
    }
  }
  const tangent: Point = [-normal[1], normal[0]];
  const ordered = [...hits.values()].sort((a, b) => dot(a, tangent) - dot(b, tangent));
  return ordered.slice(1).flatMap((b, i) => {
    const a = ordered[i];
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const left: Point = [middle[0] - normal[0] * 1e-6, middle[1] - normal[1] * 1e-6];
    const right: Point = [middle[0] + normal[0] * 1e-6, middle[1] + normal[1] * 1e-6];
    return distance(a, b) > 1e-6 && pointInPolygon(left, poly) && (insideOnly || pointInPolygon(right, poly))
      ? [[a, b] as [Point, Point]]
      : [];
  });
}

function signedDistance(p: Point, normal: Point, offset: number): number {
  const value = dot(p, normal) - offset;
  return Math.abs(value) < 1e-7 ? 0 : value;
}

/** Half-plane clipping that returns disconnected components separately.
 * Ordinary Sutherland-Hodgman clipping joins the arms of a U across its empty
 * centre. Keeping boundary runs separate prevents streets/buildings in parks
 * and avoids a triangulation fan around the original district vertices. */
export function clipStreetBlocks(poly: Point[], normal: Point, offset: number): Point[][] {
  const ring = polygonArea(poly) > 0 ? [...poly].reverse() : poly;
  if (ring.every(p => dot(p, normal) <= offset + 1e-7)) return [ring];
  if (ring.every(p => dot(p, normal) >= offset - 1e-7)) return [];
  const edges: [Point, Point][] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const da = signedDistance(a, normal, offset),
      db = signedDistance(b, normal, offset);
    // A boundary lying on the cut belongs to this half only when its interior
    // faces into the retained half-plane. Otherwise it is a dangling run.
    if (da === 0 && db === 0) {
      if ((b[0] - a[0]) * -normal[1] + (b[1] - a[1]) * normal[0] > 0) edges.push([a, b]);
    } else if (da <= 0 && db <= 0) edges.push([a, b]);
    else if (da * db < 0) {
      const t = da / (da - db);
      const p: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      edges.push(da < 0 ? [a, p] : [p, b]);
    }
  }
  edges.push(...streetChords(ring, normal, offset, true));
  const next = new Map(edges.filter(([a, b]) => key(a) !== key(b)).map(([a, b]) => [key(a), b]));
  const result: Point[][] = [];
  while (next.size) {
    const start = next.keys().next().value!;
    let current = start;
    const points: Point[] = [];
    while (next.has(current)) {
      const p = next.get(current)!;
      next.delete(current);
      points.push(p);
      current = key(p);
      if (current === start) break;
    }
    if (current !== start) continue;
    const cleaned = clean(points);
    if (cleaned.length >= 3 && area(cleaned) > 1e-5) result.push(cleaned);
  }
  return result;
}

export interface BlockBoundary {
  a: Point;
  b: Point;
  setback: number;
  /** Existing roads, walls and water already provide the perimeter corridor. */
  feature: boolean;
  /** Keep lane endpoints clear of walls and water, which cannot be used as access. */
  barrier?: boolean;
}

export interface PerimeterFabric extends CityFabric {
  /** Buildable block outlines after street, wall and bank setbacks. */
  blocks: Point[][];
}

/** Independent, irregular Voronoi neighbourhoods, not the editable mesh cells.
 * Bisectors stop at three-way junctions instead of cutting across the district. */
export function buildPerimeterBlocks(
  face: Face,
  outline: Point[],
  boundaries: BlockBoundary[],
  parameters: DistrictParameters | undefined,
  seed: string,
  build: boolean,
  classic = false
): PerimeterFabric {
  const fabric: PerimeterFabric = { buildings: [], lanes: [], entrances: new Map(), blocks: [] };
  const rng = makeRng(`${seed}:perimeter:${face.id}`);
  const target = parameters?.lotArea ?? dwellingLotArea(face.properties.ward);
  const width = parameters?.laneWidth ?? 3;
  const axis: Point = resolveDistrictAxis(outline, boundaries, parameters);
  // Tiny-scale blocks: two dwelling rows, a lane, and a small court. Larger
  // cities pack more of the same block, they do not enlarge it.
  const spanLimit = intramuralBlockSpan(target, width);
  const internalLanes: InfillLane[] = [];
  const lane = (points: Point[]) => {
    if (distance(points[0], points[1]) > 1e-6) internalLanes.push({ faceId: face.id, points, widthMeters: width });
  };
  const boundaryLanes: InfillLane[] = [];
  const outlineWinding = -Math.sign(polygonArea(clean(outline)));
  for (const edge of boundaries) {
    if (distance(edge.a, edge.b) <= 1e-6) continue;
    if (!edge.feature && !(classic && edge.barrier)) {
      boundaryLanes.push({ faceId: face.id, points: [edge.a, edge.b], widthMeters: width });
    } else if (!classic && edge.barrier) {
      // 城壁沿い・川沿いの通行帯（小道）:
      // 壁・川から安全マージン（setbackの約半分〜通路幅分）内側に沿って小道を引く
      const len = distance(edge.a, edge.b);
      const tangent: Point = [(edge.b[0] - edge.a[0]) / len, (edge.b[1] - edge.a[1]) / len];
      const inward: Point = [-outlineWinding * tangent[1], outlineWinding * tangent[0]];
      const laneOffset = Math.max(1.5, Math.min(width, edge.setback * 0.5));
      const pA: Point = [edge.a[0] + inward[0] * laneOffset, edge.a[1] + inward[1] * laneOffset];
      const pB: Point = [edge.b[0] + inward[0] * laneOffset, edge.b[1] + inward[1] * laneOffset];
      boundaryLanes.push({ faceId: face.id, points: [pA, pB], widthMeters: width });
    }
  }
  fabric.lanes.push(...boundaryLanes);
  if (!build) return fabric;

  const fill = (poly: Point[]): void => {
    // A park/bank can cut a notch into an otherwise convex Voronoi block.
    // Extend just that notch edge as a short alley; taking the convex kernel
    // of the entire notched block would silently discard a large buildable arm.
    const winding = -Math.sign(polygonArea(poly));
    for (let i = 0; i < poly.length; i++) {
      const a = poly[(i + poly.length - 1) % poly.length],
        b = poly[i],
        c = poly[(i + 1) % poly.length];
      if (winding * ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) >= -1e-5) continue;
      const length = distance(a, b);
      const normal: Point = [(a[1] - b[1]) / length, (b[0] - a[0]) / length];
      const offset = dot(b, normal);
      const parts = [
        ...clipStreetBlocks(poly, normal, offset),
        ...clipStreetBlocks(poly, [-normal[0], -normal[1]], -offset)
      ];
      if (parts.length < 2 || parts.some(p => area(p) >= area(poly) - 1e-5)) continue;
      if (Math.abs(parts.reduce((sum, p) => sum + area(p), 0) - area(poly)) > 1e-4) continue;
      for (const chord of streetChords(poly, normal, offset)) lane(chord);
      for (const part of parts) fill(part);
      return;
    }
    const sides = poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const length = distance(a, b);
      const normal: Point = [(-winding * (b[1] - a[1])) / length, (winding * (b[0] - a[0])) / length];
      const offset = dot(a, normal);
      // A cleaned side may cover several collinear editing edges.
      const matches = boundaries.filter(
        e => Math.abs(dot(e.a, normal) - offset) <= 1e-5 && Math.abs(dot(e.b, normal) - offset) <= 1e-5
      );
      const setback = Math.max(width / 2 + 0.35, ...matches.map(e => e.setback));
      return {
        normal,
        offset: offset + setback,
        setback,
        barrier: matches.some(e => e.barrier),
        primary: matches.some(e => e.feature && !e.barrier)
      };
    });
    const safe = insetConvexKernel(
      poly,
      sides.map(side => side.setback)
    );
    if (safe.length < 3 || area(safe) < 40) return;
    const block = clean(safe);
    fabric.blocks.push(block);
    const frontageSides = block.map((a, i) => {
      const b = block[(i + 1) % block.length];
      const edgeLen = distance(a, b);
      if (edgeLen < 1e-6) return undefined;
      const edgeNormal: Point = [(-winding * (b[1] - a[1])) / edgeLen, (winding * (b[0] - a[0])) / edgeLen];

      // 1. sides とのマッチング
      const matched = sides.find(
        side =>
          dot(edgeNormal, side.normal) > 0.95 &&
          Math.abs(dot(a, side.normal) - side.offset) < 0.25 &&
          Math.abs(dot(b, side.normal) - side.offset) < 0.25
      );

      // 2. 幾何学的に boundaries の road（feature && !barrier）に面しているかを直接判定
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const eDir: Point = [(b[0] - a[0]) / edgeLen, (b[1] - a[1]) / edgeLen];

      let isRoadFront = false;
      let isBarrierFront = false;

      for (const bnd of boundaries) {
        const bLen = distance(bnd.a, bnd.b);
        if (bLen < 2.0) continue;
        const bDir: Point = [(bnd.b[0] - bnd.a[0]) / bLen, (bnd.b[1] - bnd.a[1]) / bLen];
        // 道路または境界線とほぼ平行
        const par = Math.abs(eDir[0] * bDir[0] + eDir[1] * bDir[1]);
        const bNorm: Point = [-bDir[1], bDir[0]];
        const dist = Math.abs((mid[0] - bnd.a[0]) * bNorm[0] + (mid[1] - bnd.a[1]) * bNorm[1]);
        const t = ((mid[0] - bnd.a[0]) * bDir[0] + (mid[1] - bnd.a[1]) * bDir[1]) / bLen;

        if (par < 0.82) continue;
        if (dist > bnd.setback + 3.5 || dist < Math.max(0.5, bnd.setback - 3.5)) continue;
        if (t >= -0.2 && t <= 1.2) {
          if (bnd.feature && !bnd.barrier) isRoadFront = true;
          if (bnd.barrier) isBarrierFront = true;
        }
      }

      const isPrimary = Boolean(matched?.primary || isRoadFront);
      const isBarrier = Boolean(matched?.barrier || isBarrierFront);
      return {
        barrier: isBarrier,
        primary: isPrimary
      };
    });
    const footprints = frontageBuildings(
      block,
      block.flatMap((_, i) => (classic && frontageSides[i]?.barrier ? [] : [i])),
      {
        lotArea: target,
        coverage: parameters?.coverage ?? 0.9,
        occupancy: parameters?.occupancy ?? 1,
        outskirts: classic && face.properties.settlement === "outskirts",
        perimeter: !classic,
        attached: classic,
        primaryEdges: frontageSides.flatMap((side, i) => (side?.primary ? [i] : []))
      },
      makeRng(`${seed}:houses:${face.id}:${JSON.stringify(block)}`)
    );
    const adaptedFootprints = classic ? footprints : enforceFrontageTaxationAlongRoads(footprints, boundaries);
    const validFootprints = adaptedFootprints
      .map(p => (p.length === 3 ? ensureQuadSlice(p, [1, 0]) : p))
      .filter(p => p.length >= 4 && area(p) >= 10);
    fabric.buildings.push(...validFootprints.map(polygon => ({ faceId: face.id, polygon, landmark: false })));
  };
  const ring = clean(outline);
  const finalBlocks: Point[][] = [];
  if (classic) finalBlocks.push(...classicStreetBlocks(ring, boundaries, axis, spanLimit, rng));
  else {
    const primaryEdge = boundaries
      .filter(e => e.feature && !e.barrier && distance(e.a, e.b) > 4)
      .sort((a, b) => distance(b.a, b.b) - distance(a.a, a.b))[0];
    let cross: Point = [-axis[1], axis[0]];
    const center = polygonCentroid(ring);
    if (primaryEdge && !parameters) {
      // 幹線道路（太い道）がある場合、太い道から区画内側を向く法線を cross とする
      const inward: Point = [-outlineWinding * axis[1], outlineWinding * axis[0]];
      if (dot([center[0] - primaryEdge.a[0], center[1] - primaryEdge.a[1]], inward) < 0) {
        inward[0] = -inward[0];
        inward[1] = -inward[1];
      }
      cross = inward;
    }
    const ys = ring.map(p => dot(p, cross));
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);

    // 街区の厚み B ≈ 2d + c:
    // サンプルの実測値分析（greyfield: 幅16.2m, 長さ23.5m / blackwell: 幅15.0m, 長さ22.8m）
    // 背中合わせ型（幅14.5〜17.5m）と中庭型（幅26〜32m）を混在させる
    const splitOffsets: { y: number; normal: Point }[] = [];
    let startY = minY;
    if (primaryEdge && !parameters) {
      const yEdge = dot(primaryEdge.a, cross);
      if (Math.abs(yEdge - minY) < Math.abs(yEdge - maxY)) {
        startY = Math.max(minY, yEdge);
      }
    }
    const minStep = parameters ? 22 : 14.5;
    let curY = startY;
    while (curY + minStep < maxY) {
      const isCourtyardBlock = parameters ? rng() < 0.35 : rng() < 0.25 && maxY - curY > 34;
      const step = parameters
        ? isCourtyardBlock
          ? rng.range(33, 44)
          : rng.range(22, 28)
        : isCourtyardBlock
          ? rng.range(26, 32)
          : rng.range(14.5, 17.5);
      curY += step;
      if (curY < maxY - (parameters ? 14 : 10)) {
        const jitterAngle = rng.range(-0.03, 0.03);
        const cosJ = Math.cos(jitterAngle),
          sinJ = Math.sin(jitterAngle);
        const normal: Point = [cross[0] * cosJ - cross[1] * sinJ, cross[0] * sinJ + cross[1] * cosJ];
        splitOffsets.push({ y: curY, normal });
      }
    }

    let blocksToFill: Point[][] = [ring];
    for (const { y, normal } of splitOffsets) {
      const next: Point[][] = [];
      for (const piece of blocksToFill) {
        const upper = clipStreetBlocks(piece, normal, y);
        const lower = clipStreetBlocks(piece, [-normal[0], -normal[1]], -y);
        if (upper.length && lower.length) {
          next.push(...upper, ...lower);
        } else {
          next.push(piece);
        }
      }
      blocksToFill = next;
    }
    blocksToFill = blocksToFill.filter(p => area(p) > 25);

    // 2. 長辺を分割して横道（T字路）を配置
    // サンプル実測値（中央値22.8〜23.5m、アスペクト比約1.5）に基づきブロック長さを設定
    const maxBlockLength = parameters
      ? Math.max(40, Math.min(68, spanLimit * 1.8))
      : Math.max(20, Math.min(27, spanLimit * 0.95));
    let prevStripCuts: number[] = [];

    for (let sIdx = 0; sIdx < blocksToFill.length; sIdx++) {
      const strip = blocksToFill[sIdx];
      const sXs = strip.map(p => dot(p, axis));
      const sMinX = Math.min(...sXs),
        sMaxX = Math.max(...sXs);
      const sLen = sMaxX - sMinX;

      if (sLen <= maxBlockLength * 1.1) {
        finalBlocks.push(strip);
        prevStripCuts = [];
        continue;
      }

      // 等分割の計算
      const n = Math.max(2, Math.round(sLen / maxBlockLength));
      const currentStripCuts: number[] = [];
      for (let i = 1; i < n; i++) {
        const baseCut = sMinX + (sLen * i) / n;
        let candidateX = baseCut + rng.range(-1.5, 1.5);

        for (const prevX of prevStripCuts) {
          const minDist = parameters ? 12 : 8;
          if (Math.abs(candidateX - prevX) < minDist) {
            candidateX = candidateX < prevX ? prevX - minDist : prevX + minDist;
          }
        }
        const margin = parameters ? 20 : 12;
        if (candidateX >= sMaxX - margin || candidateX <= sMinX + margin) continue;
        currentStripCuts.push(candidateX);
      }

      if (currentStripCuts.length === 0) {
        finalBlocks.push(strip);
        prevStripCuts = [];
        continue;
      }

      let pieces = [strip];
      for (const cutX of currentStripCuts) {
        const jitterAngle = rng.range(-0.04, 0.04);
        const cosJ = Math.cos(jitterAngle),
          sinJ = Math.sin(jitterAngle);
        const normal: Point = [axis[0] * cosJ - axis[1] * sinJ, axis[0] * sinJ + axis[1] * cosJ];
        const nextPieces: Point[][] = [];
        for (const piece of pieces) {
          const right = clipStreetBlocks(piece, normal, cutX);
          const left = clipStreetBlocks(piece, [-normal[0], -normal[1]], -cutX);
          if (right.length && left.length) {
            nextPieces.push(...right, ...left);
          } else {
            nextPieces.push(piece);
          }
        }
        pieces = nextPieces;
      }
      finalBlocks.push(...pieces.filter(p => area(p) > 30));
      prevStripCuts = currentStripCuts;
    }
  }

  const streets = new Set<string>();
  for (const poly of finalBlocks) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      const onBoundary = ring.some((p, j) => {
        const q = ring[(j + 1) % ring.length];
        const len = distance(p, q);
        const normal: Point = [(p[1] - q[1]) / len, (q[0] - p[0]) / len];
        return Math.abs(dot(a, normal) - dot(p, normal)) < 1e-5 && Math.abs(dot(b, normal) - dot(p, normal)) < 1e-5;
      });
      if (onBoundary) continue;
      const id = [key(a), key(b)].sort().join(":");
      if (!streets.has(id) && distance(a, b) > 1e-5) {
        streets.add(id);
        lane([a, b]);
      }
    }
    fill(poly);
  }

  // Collapse degree-2 intermediate vertices in internal lanes so every internal street junction
  // is a clean 3-way T-junction.
  const mergedLanes = [...internalLanes];
  for (let changed = !classic; changed; ) {
    changed = false;
    const degreeMap = new Map<string, { index: number; other: Point }[]>();
    for (let i = 0; i < mergedLanes.length; i++) {
      const [p0, p1] = mergedLanes[i].points;
      const k0 = key(p0),
        k1 = key(p1);
      const d0 = degreeMap.get(k0) ?? [];
      d0.push({ index: i, other: p1 });
      degreeMap.set(k0, d0);
      const d1 = degreeMap.get(k1) ?? [];
      d1.push({ index: i, other: p0 });
      degreeMap.set(k1, d1);
    }
    for (const [, connections] of degreeMap) {
      if (connections.length === 2 && connections[0].index !== connections[1].index) {
        const c0 = connections[0],
          c1 = connections[1];
        const pA = c0.other,
          pB = c1.other;
        if (distance(pA, pB) < 1e-5) continue;
        const keep = Math.min(c0.index, c1.index);
        const remove = Math.max(c0.index, c1.index);
        mergedLanes[keep] = { ...mergedLanes[keep], points: [pA, pB] };
        mergedLanes.splice(remove, 1);
        changed = true;
        break;
      }
    }
  }
  fabric.lanes = [...boundaryLanes, ...mergedLanes.filter(l => distance(l.points[0], l.points[1]) > 1e-4)];

  if (classic) {
    // Trim the ends against real barriers, never join unrelated lanes across them.
    fabric.lanes = fabric.lanes.flatMap(lane => {
      const [a, b] = lane.points;
      let lo = 0,
        hi = 1;
      for (const edge of boundaries.filter(e => e.barrier)) {
        const length = distance(edge.a, edge.b);
        if (length < 1e-6) continue;
        const normal: Point = [(edge.a[1] - edge.b[1]) / length, (edge.b[0] - edge.a[0]) / length];
        const da = Math.abs(dot(a, normal) - dot(edge.a, normal));
        const db = Math.abs(dot(b, normal) - dot(edge.a, normal));
        if (onBoundarySegment(a, edge) && db > da) lo = Math.max(lo, edge.setback / (db - da));
        if (onBoundarySegment(b, edge) && da > db) hi = Math.min(hi, 1 - edge.setback / (da - db));
      }
      return hi > lo
        ? [
            {
              ...lane,
              points: [
                [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo] as Point,
                [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi] as Point
              ]
            }
          ]
        : [];
    });
  }
  return fabric;
}

function onBoundarySegment(p: Point, edge: BlockBoundary): boolean {
  return Math.abs(distance(edge.a, p) + distance(p, edge.b) - distance(edge.a, edge.b)) < 1e-5;
}

/** Boundary-following site rows give parallel lanes and perpendicular side streets.
 * Staggered interior sites join these into irregular closed blocks with three-way
 * junctions. Only shared cell edges become streets; no independent random stubs. */
function classicStreetBlocks(
  ring: Point[],
  boundaries: BlockBoundary[],
  axis: Point,
  span: number,
  rng: Rng
): Point[][] {
  const sites: Point[] = [];
  const sign = -Math.sign(polygonArea(ring));
  // Two short house rows, rather than deep burgage plots: about 28–36m
  // between lane centrelines, including their width and facade clearances.
  const spacing = Math.max(28, Math.min(36, span * 0.78));
  const addSite = (p: Point) => {
    if (pointInPolygon(p, ring) && sites.every(q => distance(p, q) >= spacing * 0.68)) sites.push(p);
  };
  // Cleaned sides, rather than mesh edges, make extra collinear editing vertices
  // irrelevant. Give actual roads, riverbanks and walls priority over dry seams.
  const sides = ring
    .map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return {
        a,
        b,
        length: distance(a, b),
        feature: boundaries.some(
          e =>
            e.feature &&
            onBoundarySegment(e.a, { a, b, setback: 0, feature: false }) &&
            onBoundarySegment(e.b, { a, b, setback: 0, feature: false })
        )
      };
    })
    .sort((a, b) => Number(b.feature) - Number(a.feature) || b.length - a.length);
  for (const { a, b, length } of sides) {
    const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const inward: Point = [-sign * tangent[1], sign * tangent[0]];
    const count = Math.max(1, Math.round(length / spacing));
    const depth = spacing * rng.range(0.42, 0.52);
    for (let i = 0; i < count; i++) {
      const along = (length * (i + 0.5 + rng.range(-0.1, 0.1))) / count;
      addSite([a[0] + tangent[0] * along + inward[0] * depth, a[1] + tangent[1] * along + inward[1] * depth]);
    }
  }
  const across: Point = [-axis[1], axis[0]];
  const xs = ring.map(p => dot(p, axis)),
    ys = ring.map(p => dot(p, across));
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const rows = Math.max(1, Math.round((maxY - minY) / spacing));
  const cols = Math.max(1, Math.round((maxX - minX) / spacing));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = minX + ((col + 0.5 + (row % 2) * 0.35 + rng.range(-0.12, 0.12)) * (maxX - minX)) / cols;
      const y = minY + ((row + 0.5 + rng.range(-0.12, 0.12)) * (maxY - minY)) / rows;
      addSite([axis[0] * x + across[0] * y, axis[1] * x + across[1] * y]);
    }
  }
  if (sites.length < 2) return [ring];
  const neighbors = sites.map(() => new Set<number>());
  for (const [a, b] of computeDelaunayEdges(sites)) {
    neighbors[a].add(b);
    neighbors[b].add(a);
  }
  // Two sites or collinear sites have no triangles, but still need bisectors.
  if (neighbors.every(n => !n.size)) {
    sites.forEach((_, i) => {
      sites.forEach((_, j) => {
        if (i !== j) neighbors[i].add(j);
      });
    });
  }
  return sites.flatMap((site, i) => {
    let pieces = [ring];
    for (const j of neighbors[i]) {
      const other = sites[j],
        length = distance(site, other);
      const normal: Point = [(other[0] - site[0]) / length, (other[1] - site[1]) / length];
      const offset = dot([(site[0] + other[0]) / 2, (site[1] + other[1]) / 2], normal);
      pieces = pieces.flatMap(poly => clipStreetBlocks(poly, normal, offset));
    }
    return pieces;
  });
}

/**
 * 街区の帯（ribbon）を走らせる基準軸を決定:
 * 1. parameters.orientation があればそれを優先
 * 2. 幹線道路（primary feature road）があればその向きを最優先（太い道に沿って連続frontageを形成）
 * 3. 城壁・河川（barrier）があればその向き
 * 4. なければ外形全体の最長軸
 */
function resolveDistrictAxis(
  outline: Point[],
  boundaries: BlockBoundary[],
  parameters: DistrictParameters | undefined
): Point {
  if (parameters) {
    return [Math.cos(parameters.orientation), Math.sin(parameters.orientation)];
  }
  const primaryEdge = boundaries
    .filter(e => e.feature && !e.barrier && distance(e.a, e.b) > 5)
    .sort((a, b) => distance(b.a, b.b) - distance(a.a, a.b))[0];
  if (primaryEdge) {
    const len = distance(primaryEdge.a, primaryEdge.b);
    return [(primaryEdge.b[0] - primaryEdge.a[0]) / len, (primaryEdge.b[1] - primaryEdge.a[1]) / len];
  }
  const barrierEdge = boundaries
    .filter(e => e.barrier && distance(e.a, e.b) > 8)
    .sort((a, b) => distance(b.a, b.b) - distance(a.a, a.b))[0];
  if (barrierEdge) {
    const len = distance(barrierEdge.a, barrierEdge.b);
    return [(barrierEdge.b[0] - barrierEdge.a[0]) / len, (barrierEdge.b[1] - barrierEdge.a[1]) / len];
  }
  return longestFrame(outline).axis;
}

/**
 * 中世ヨーロッパのフロンテージ課税（間口税）に基づく住宅の短辺接道化:
 * 外壁の内側にある道路（road）に面する住宅のうち、
 * 道路に面する辺（間口幅 W）が道路に直角な奥行き（D）より長い住宅（長辺接道住宅）を、
 * 道路に対して直角に細分化（短冊型分割）し、すべての住宅が短辺で道路に接するようにする。
 */
function enforceFrontageTaxationAlongRoads(buildings: Point[][], boundaries: BlockBoundary[]): Point[][] {
  const roadBoundaries = boundaries.filter(b => b.feature && !b.barrier && distance(b.a, b.b) > 2.0);
  if (roadBoundaries.length === 0) return buildings;

  const result: Point[][] = [];

  for (const poly of buildings) {
    if (poly.length < 3) continue;

    // この住宅が道路に面しているか、および道路に面する辺を探索
    let bestHit: {
      edgeIndex: number;
      edgeLen: number;
      depth: number;
      edgeDir: Point;
      bnd: BlockBoundary;
    } | null = null;
    let closestDist = Infinity;

    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const edgeLen = distance(p1, p2);
      if (edgeLen < 1.5) continue;
      const mid: Point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const eDir: Point = [(p2[0] - p1[0]) / edgeLen, (p2[1] - p1[1]) / edgeLen];

      for (const bnd of roadBoundaries) {
        const bLen = distance(bnd.a, bnd.b);
        const bDir: Point = [(bnd.b[0] - bnd.a[0]) / bLen, (bnd.b[1] - bnd.a[1]) / bLen];
        // 道路とほぼ平行（内積の絶対値が 0.80 以上）
        if (Math.abs(eDir[0] * bDir[0] + eDir[1] * bDir[1]) < 0.8) continue;

        // 道路への垂直距離がセットバック付近（道路沿い）
        const bNorm: Point = [-bDir[1], bDir[0]];
        const dist = Math.abs((mid[0] - bnd.a[0]) * bNorm[0] + (mid[1] - bnd.a[1]) * bNorm[1]);
        if (dist > bnd.setback + 5.0) continue;

        // 奥行き（道路に直角な方向の寸法）を計算
        const depths = poly.map(p => Math.abs((p[0] - p1[0]) * bNorm[0] + (p[1] - p1[1]) * bNorm[1]));
        const depth = Math.max(...depths);

        if (dist < closestDist) {
          closestDist = dist;
          bestHit = { edgeIndex: i, edgeLen, depth, edgeDir: eDir, bnd };
        }
      }
    }

    // 道路に面していて、かつ間口幅が奥行きより広い（長辺接道: edgeLen > depth * 0.95）場合
    if (bestHit && bestHit.edgeLen > bestHit.depth * 0.95 && bestHit.depth >= 2.5) {
      // 道路に対して短辺で接する（1戸あたり間口幅 3.6m〜5.5m）ように分割
      const targetUnitWidth = Math.max(3.6, Math.min(5.5, bestHit.depth * 0.85));
      let numUnits = Math.max(1, Math.round(bestHit.edgeLen / targetUnitWidth));
      while (numUnits > 1 && bestHit.edgeLen / numUnits < 3.55) {
        numUnits--;
      }
      if (numUnits <= 1) {
        result.push(poly);
        continue;
      }

      // 住宅多角形を道路に沿って numUnits 個にスライス
      const p1 = poly[bestHit.edgeIndex];
      const eDir = bestHit.edgeDir;
      const step = bestHit.edgeLen / numUnits;

      let remaining = poly;
      for (let u = 0; u < numUnits - 1; u++) {
        const cutDist = (u + 1) * step;
        const cutOrigin: Point = [p1[0] + eDir[0] * cutDist, p1[1] + eDir[1] * cutDist];
        const cutNormal: Point = eDir; // 切断線の法線ベクトルを道路に平行にすることで、切断線を道路に直角にする
        const cutOffset = dot(cutOrigin, cutNormal);

        // 切断線で remaining を 2 つに分割
        const rawPieceA = clipHalfPlane(remaining, cutNormal, cutOffset);
        const rawPieceB = clipHalfPlane(remaining, [-cutNormal[0], -cutNormal[1]], -cutOffset);
        const pieceA = ensureQuadSlice(clean(rawPieceA), eDir);
        const pieceB = clean(rawPieceB);

        if (pieceA.length >= 4 && pieceB.length >= 3 && area(pieceA) >= 8) {
          result.push(pieceA);
          remaining = pieceB;
        }
      }
      const cleanRemaining = ensureQuadSlice(clean(remaining), eDir);
      if (cleanRemaining.length >= 4 && area(cleanRemaining) >= 8) {
        result.push(cleanRemaining);
      }
    } else {
      if (poly.length === 3) {
        const fixed = ensureQuadSlice(poly, bestHit?.edgeDir ?? [1, 0]);
        if (fixed.length >= 4) result.push(fixed);
      } else {
        result.push(poly);
      }
    }
  }

  return result;
}

function ensureQuadSlice(piece: Point[], eDir: Point): Point[] {
  // 近接頂点をマージ
  const deduped: Point[] = [];
  for (const p of piece) {
    if (!deduped.some(u => distance(u, p) < 0.35)) {
      deduped.push(p);
    }
  }
  if (deduped.length === 4) return deduped;
  if (deduped.length !== 3) return piece;

  // 3頂点（三角形）の場合: 道路に平行な最長辺を底辺とし、
  // 奥の尖った頂点の手前（74%）でカットして4頂点の台形にする
  let bestEdgeIdx = 0;
  let maxDot = -1;
  for (let i = 0; i < 3; i++) {
    const a = deduped[i],
      b = deduped[(i + 1) % 3];
    const len = distance(a, b);
    if (len < 0.5) continue;
    const dir: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const d = Math.abs(dir[0] * eDir[0] + dir[1] * eDir[1]);
    if (d > maxDot) {
      maxDot = d;
      bestEdgeIdx = i;
    }
  }

  const pFL = deduped[bestEdgeIdx];
  const pFR = deduped[(bestEdgeIdx + 1) % 3];
  const apex = deduped[(bestEdgeIdx + 2) % 3];
  const cutRatio = 0.74;
  const bL: Point = [pFL[0] + (apex[0] - pFL[0]) * cutRatio, pFL[1] + (apex[1] - pFL[1]) * cutRatio];
  const bR: Point = [pFR[0] + (apex[0] - pFR[0]) * cutRatio, pFR[1] + (apex[1] - pFR[1]) * cutRatio];
  return [pFL, pFR, bR, bL];
}
