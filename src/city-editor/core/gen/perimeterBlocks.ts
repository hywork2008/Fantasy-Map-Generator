import type { DistrictParameters, Face, Point } from "../types";
import { frontageBuildings } from "./frontageBuildings";
import { pointInPolygon, polygonArea } from "./geom";
import { dwellingLotArea, intramuralBlockSpan } from "./housing";
import type { CityFabric } from "./localInfill";
import { insetConvexKernel, longestFrame } from "./lotGeometry";
import { makeRng } from "./prng";

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
  build: boolean
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
    if (!edge.feature && distance(edge.a, edge.b) > 1e-6) {
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
    const safe = insetConvexKernel(
      poly,
      poly.map((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const length = distance(a, b);
        const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        const normal: Point = [-tangent[1], tangent[0]];
        const offset = dot(a, normal);
        // Cleaning a collinear junction can join several mesh edges into one
        // side. Retain the widest road/bank setback on that supporting line.
        const matches = boundaries.filter(
          e => Math.abs(dot(e.a, normal) - offset) <= 1e-5 && Math.abs(dot(e.b, normal) - offset) <= 1e-5
        );
        return Math.max(width / 2 + 0.35, ...matches.map(e => e.setback));
      })
    );
    if (safe.length < 3 || area(safe) < 40) return;
    const block = clean(safe);
    fabric.blocks.push(block);
    const footprints = frontageBuildings(
      block,
      block.map((_, i) => i),
      {
        lotArea: target,
        coverage: parameters?.coverage ?? 0.9,
        occupancy: parameters?.occupancy ?? 1,
        outskirts: false,
        perimeter: true
      },
      makeRng(`${seed}:houses:${face.id}:${JSON.stringify(block)}`)
    );
    fabric.buildings.push(...footprints.map(polygon => ({ faceId: face.id, polygon, landmark: false })));
  };
  const ring = clean(outline);
  const cross: Point = [-axis[1], axis[0]];
  const xs = ring.map(p => dot(p, axis)),
    ys = ring.map(p => dot(p, cross));
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const totalSpan = maxY - minY;
  const _totalLength = maxX - minX;

  // Ribbon-based block subdivision:
  // Medieval European towns (e.g. Rothenburg ob der Tauber) subdivide larger
  // super-blocks along their primary street axis into ribbon strips of width 25-38m
  // (two dwelling depths back-to-back), rather than isotropic Voronoi honeycomb cells.
  const targetRibbonWidth = Math.max(24, Math.min(32, spanLimit * 0.78));
  const stripCount = Math.max(1, Math.min(16, Math.round(totalSpan / targetRibbonWidth)));

  let blocksToFill: Point[][] = [ring];

  // 1. Primary longitudinal cuts along the street axis (Ribbon strips)
  if (stripCount > 1) {
    const nextBlocks: Point[][] = [];
    for (const poly of blocksToFill) {
      let currentPieces = [poly];
      for (let k = 1; k < stripCount; k++) {
        const nominalY = minY + (totalSpan * k) / stripCount;
        const jitterAngle = rng.range(-0.06, 0.06);
        const cosJ = Math.cos(jitterAngle),
          sinJ = Math.sin(jitterAngle);
        const normal: Point = [cross[0] * cosJ - cross[1] * sinJ, cross[0] * sinJ + cross[1] * cosJ];
        const offset = nominalY + rng.range(-1.2, 1.2);
        const split: Point[][] = [];
        for (const piece of currentPieces) {
          const upper = clipStreetBlocks(piece, normal, offset);
          const lower = clipStreetBlocks(piece, [-normal[0], -normal[1]], -offset);
          if (upper.length && lower.length) {
            split.push(...upper, ...lower);
          } else {
            split.push(piece);
          }
        }
        currentPieces = split;
      }
      nextBlocks.push(...currentPieces);
    }
    blocksToFill = nextBlocks.filter(p => area(p) > 30);
  }

  // 2. Transverse cross-cuts (Cross-alleys / T-junctions) for elongated strips
  const finalBlocks: Point[][] = [];
  const maxBlockLength = Math.max(40, Math.min(65, spanLimit * 1.6));
  for (let bIndex = 0; bIndex < blocksToFill.length; bIndex++) {
    const poly = blocksToFill[bIndex];
    const polyXs = poly.map(p => dot(p, axis));
    const polyMinX = Math.min(...polyXs),
      polyMaxX = Math.max(...polyXs);
    const polyLength = polyMaxX - polyMinX;
    const cuts = Math.max(1, Math.min(16, Math.round(polyLength / maxBlockLength)));
    if (cuts <= 1) {
      finalBlocks.push(poly);
      continue;
    }
    let currentPieces = [poly];
    // Stagger transverse cuts across adjacent strips to prevent 4-way crossroads,
    // producing authentic medieval 3-way T-junctions.
    const stripStagger = (bIndex % 2 === 0 ? 0.08 : -0.08) * polyLength;
    for (let c = 1; c < cuts; c++) {
      const nominalX = polyMinX + (polyLength * c) / cuts + stripStagger;
      const jitterAngle = rng.range(-0.06, 0.06);
      const cosJ = Math.cos(jitterAngle),
        sinJ = Math.sin(jitterAngle);
      const normal: Point = [axis[0] * cosJ - axis[1] * sinJ, axis[0] * sinJ + axis[1] * cosJ];
      const offset = nominalX + rng.range(-1.5, 1.5);
      const split: Point[][] = [];
      for (const piece of currentPieces) {
        const right = clipStreetBlocks(piece, normal, offset);
        const left = clipStreetBlocks(piece, [-normal[0], -normal[1]], -offset);
        if (right.length && left.length) {
          split.push(...right, ...left);
        } else {
          split.push(piece);
        }
      }
      currentPieces = split;
    }
    finalBlocks.push(...currentPieces.filter(p => area(p) > 30));
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
  for (let changed = true; changed; ) {
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
        const keep = Math.min(c0.index, c1.index);
        const remove = Math.max(c0.index, c1.index);
        mergedLanes[keep] = { ...mergedLanes[keep], points: [pA, pB] };
        mergedLanes.splice(remove, 1);
        changed = true;
        break;
      }
    }
  }
  fabric.lanes = [...boundaryLanes, ...mergedLanes];

  return fabric;
}
