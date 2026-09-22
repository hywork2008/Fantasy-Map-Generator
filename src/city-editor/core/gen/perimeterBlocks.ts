import type { DistrictParameters, Face, Point } from "../types";
import { frontageBuildings } from "./frontageBuildings";
import { pointInPolygon, polygonArea } from "./geom";
import { dwellingLotArea, intramuralBlockSpan } from "./housing";
import type { CityFabric, InfillLane } from "./localInfill";
import { insetConvexKernel, longestFrame } from "./lotGeometry";
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
  const axis: Point = parameters
    ? [Math.cos(parameters.orientation), Math.sin(parameters.orientation)]
    : longestFrame(outline).axis;
  // Tiny-scale blocks: two dwelling rows, a lane, and a small court. Larger
  // cities pack more of the same block, they do not enlarge it.
  const spanLimit = intramuralBlockSpan(target, width);
  const internalLanes: InfillLane[] = [];
  const lane = (points: Point[]) => {
    if (distance(points[0], points[1]) > 1e-6) internalLanes.push({ faceId: face.id, points, widthMeters: width });
  };
  const boundaryLanes: InfillLane[] = [];
  for (const edge of boundaries) {
    if (!edge.feature && !(classic && edge.barrier) && distance(edge.a, edge.b) > 1e-6) {
      boundaryLanes.push({ faceId: face.id, points: [edge.a, edge.b], widthMeters: width });
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
      return sides.find(
        side => Math.abs(dot(a, side.normal) - side.offset) < 1e-4 && Math.abs(dot(b, side.normal) - side.offset) < 1e-4
      );
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
    fabric.buildings.push(...footprints.map(polygon => ({ faceId: face.id, polygon, landmark: false })));
  };
  const ring = clean(outline);
  const finalBlocks: Point[][] = [];
  if (classic) finalBlocks.push(...classicStreetBlocks(ring, boundaries, axis, spanLimit, rng));
  else {
    const cross: Point = [-axis[1], axis[0]];
    const ys = ring.map(p => dot(p, cross));
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);

    const targetRibbonWidth = Math.max(24, Math.min(32, spanLimit * 0.78));

    // 1. Organic longitudinal ribbons use slight directional drift. Cross-cuts
    // below are staggered, so these form T-junctioned streets instead of a
    // repeated rectangular lattice.
    const splitOffsets: { y: number; normal: Point }[] = [];
    let curY = minY;
    while (curY + targetRibbonWidth * 1.25 < maxY) {
      const step = rng.range(20, 38);
      curY += step;
      if (curY < maxY - 15) {
        const jitterAngle = rng.range(-0.04, 0.04);
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
    blocksToFill = blocksToFill.filter(p => area(p) > 30);

    // 2. Cross-cuts are chosen independently for each ribbon. Their stagger
    // prevents four-way grid intersections while preserving compact blocks.
    const maxBlockLength = Math.max(36, Math.min(72, spanLimit * 1.9));
    let prevStripCuts: number[] = [];

    for (let sIdx = 0; sIdx < blocksToFill.length; sIdx++) {
      const strip = blocksToFill[sIdx];
      const sXs = strip.map(p => dot(p, axis));
      const sMinX = Math.min(...sXs),
        sMaxX = Math.max(...sXs);
      const sLen = sMaxX - sMinX;

      if (sLen <= maxBlockLength) {
        finalBlocks.push(strip);
        prevStripCuts = [];
        continue;
      }

      const currentStripCuts: number[] = [];
      let curX = sMinX;
      while (curX + maxBlockLength * 0.8 < sMaxX) {
        const step = rng.range(32, Math.min(68, maxBlockLength * 1.1));
        let candidateX = curX + step;
        if (candidateX >= sMaxX - 25) break;

        for (const prevX of prevStripCuts) {
          if (Math.abs(candidateX - prevX) < 12) {
            candidateX = candidateX < prevX ? prevX - 12 : prevX + 12;
          }
        }
        if (candidateX >= sMaxX - 22 || candidateX <= curX + 22) continue;

        currentStripCuts.push(candidateX);
        curX = candidateX;
      }

      if (currentStripCuts.length === 0) {
        finalBlocks.push(strip);
        prevStripCuts = [];
        continue;
      }

      let pieces = [strip];
      for (const cutX of currentStripCuts) {
        const jitterAngle = rng.range(-0.05, 0.05);
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
