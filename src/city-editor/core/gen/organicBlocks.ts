import type { DistrictParameters, Face, Point } from "../types";
import { frontageBuildings } from "./frontageBuildings";
import {
  isSimplePolygon,
  lineLineIntersection,
  nearestOnPolyline,
  pointInPolygon,
  polygonArea,
  polygonCentroid
} from "./geom";
import { civicSizeForExtent, dwellingLotArea } from "./housing";
import type { InfillLane } from "./localInfill";
import { insetConvexKernel } from "./lotGeometry";
import { makeRng, type Rng } from "./prng";
import { type BlockBoundary, cleanStreetRing, type PerimeterFabric, streetChords } from "./streetBlockGeometry";

export interface OrganicBlockContext {
  hub: Point;
  /** Older callers without a frame retain the Tiny-and-larger morphology. */
  extentMeters?: number;
  /** The city wall supplies local directions even to districts away from it. */
  walls: [Point, Point][];
}

type Split = { parts: [Point[], Point[]]; path: Point[] };
type Frame = { axis: Point; lo: number; hi: number; short: number };
type CompactSplit = { laneWidth: number; houseDepth: number; lotArea: number };
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const area = (ring: Point[]) => Math.abs(polygonArea(ring));
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const unit = (v: Point): Point => {
  const length = Math.hypot(...v);
  return length > 1e-7 ? [v[0] / length, v[1] / length] : [1, 0];
};
const rotate = (v: Point, angle: number): Point => [
  v[0] * Math.cos(angle) - v[1] * Math.sin(angle),
  v[0] * Math.sin(angle) + v[1] * Math.cos(angle)
];
const onSegment = (p: Point, a: Point, b: Point) => nearestOnPolyline(p, [a, b]).dist < 1e-5;
const pointKey = (p: Point) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
export const ORGANIC_LANE_FACADE_CLEARANCE = 0.05;

/** Organic streets are a subdivision of connected public space, not rows of
 * rectangles. First join the district perimeter around the hub; then split
 * each remaining parcel on its own longer dimension. Every accepted cut is
 * both a street and the shared boundary of its two children. */
export function buildOrganicBlocks(
  face: Face,
  outline: Point[],
  boundaries: BlockBoundary[],
  parameters: DistrictParameters | undefined,
  seed: string,
  build: boolean,
  context?: OrganicBlockContext
): PerimeterFabric {
  const fabric: PerimeterFabric = { buildings: [], lanes: [], entrances: new Map(), blocks: [] };
  const rng = makeRng(`${seed}:organic-network-v1:${face.id}`);
  const width = parameters?.laneWidth ?? 3;
  const lotArea = parameters?.lotArea ?? dwellingLotArea(face.properties.ward);
  const houseDepth = Math.sqrt(Math.max(40, lotArea)) * 1.1;
  const pairedSpan = 2 * houseDepth + width + 0.7;
  const micro = context?.extentMeters !== undefined && civicSizeForExtent(context.extentMeters) === "micro";
  const compact: CompactSplit | undefined = micro ? { laneWidth: width, houseDepth, lotArea } : undefined;
  const hub = context?.hub ?? polygonCentroid(outline);
  const preferredAxis: Point | undefined = parameters
    ? [Math.cos(parameters.orientation), Math.sin(parameters.orientation)]
    : undefined;
  const roads: InfillLane[] = [];
  const entries: Point[] = [];

  // Boundary edges are offset as one joined ring, including the intersections
  // with road centrelines at gates/bridges. The water/wall itself is never a
  // street endpoint. Different banks are handled on their respective land side.
  const domains = corridorDomains(outline, boundaries, width, pairedSpan);
  for (const domain of domains) {
    for (const edge of domain.boundaries) {
      if (!edge.feature || edge.barrier) addStreet([edge.a, edge.b]);
      else entries.push(edge.a, edge.b);
    }
    if (!build) continue;
    const parcels: Point[][] = [];
    connectDistrict(domain.ring, 0);
    for (const parcel of parcels) fill(parcel, domain.boundaries);

    function connectDistrict(poly: Point[], level: number): void {
      const frame = localFrame(poly, preferredAxis);
      // Only coarse districts get circumferential links. Never march an offset
      // through the entire face: the independently chosen attachment points on
      // either side of an arterial need not line up into a complete ring.
      // A Micro sector can hold a connector and two blocks without holding
      // the seven block areas required by the large-district hierarchy. Give
      // it one circumferential connection before local parcel subdivision.
      if (
        level < (micro ? 1 : 3) &&
        frame.short > pairedSpan * (micro ? 1.1 : 2.1) &&
        area(poly) > pairedSpan ** 2 * (micro ? 2.2 : 7)
      ) {
        const center = polygonCentroid(poly);
        const radial = unit(sub(center, hub));
        const wall = nearestWall(center, context?.walls ?? []);
        let normal: Point = wall ? rotate(unit(sub(wall[1], wall[0])), Math.PI / 2) : radial;
        if (dot(normal, radial) < 0) normal = [-normal[0], -normal[1]];
        // Blend a local wall normal with the direction away from the plaza.
        // This follows polygonal walls without imposing a city-wide grid.
        normal = unit([normal[0] * 0.65 + radial[0] * 0.35, normal[1] * 0.65 + radial[1] * 0.35]);
        const split = chooseSplit(poly, normal, rng, pairedSpan, domain.boundaries, { hub, outward: normal }, compact);
        if (split) {
          addStreet(split.path);
          for (const child of split.parts) connectDistrict(child, level + 1);
          return;
        }
      }
      subdivide(poly, 0);
    }

    function subdivide(poly: Point[], depth: number): void {
      const frame = localFrame(poly, preferredAxis);
      const long = frame.hi - frame.lo;
      // Back-to-back rows and courts share the same house depth. Their size
      // distribution belongs to each parcel, never to a district-wide strip.
      const courtyard = rng() < 0.32;
      // Keep real house depths and lane widths. A smaller town has shorter
      // frontages and smaller courts, not houses scaled down with the map.
      const shortLimit =
        pairedSpan + (courtyard ? houseDepth * rng.range(micro ? 0.3 : 0.65, micro ? 0.8 : 1.4) : rng.range(0, 3));
      const longLimit = pairedSpan * rng.range(micro ? 1.4 : 1.65, micro ? 2 : 2.6);
      const kernel = insetConvexKernel(
        poly,
        poly.map(() => 0)
      );
      const deepNotch = area(kernel) < area(poly) * 0.82;
      if (
        depth >= 16 ||
        (!deepNotch && frame.short <= shortLimit && long <= longLimit && area(poly) <= shortLimit * longLimit * 0.88)
      ) {
        parcels.push(poly);
        return;
      }
      // Recompute the frame from each child's actual edges. Alternating axes
      // and independent half/third positions produce branching T junctions,
      // trapezoids and tapered blocks, without a stack of parallel ribbons.
      let split = chooseSplit(poly, frame.axis, rng, pairedSpan, domain.boundaries, undefined, compact);
      if (!split && deepNotch) split = splitReflex(poly, pairedSpan * pairedSpan * 0.18);
      if (!split) {
        parcels.push(poly);
        return;
      }
      addStreet(split.path);
      for (const child of split.parts) subdivide(child, depth + 1);
    }
  }

  // Insert actual shared junction vertices. Do not replace a two-edge bend by
  // a straight chord after houses have already been placed against it.
  fabric.lanes = joinStreetVertices(roads);
  fabric.entrances.set(face.id, entries);
  return fabric;

  function addStreet(points: Point[]): void {
    if (points.length >= 2 && distance(points[0], points.at(-1)!) > 1e-5)
      roads.push({ faceId: face.id, points, widthMeters: width });
  }

  function fill(poly: Point[], perimeter: BlockBoundary[]): void {
    const sides = parcelSides(poly, perimeter, width);
    // Mild bends leave a court/yard on their concave side. Deep notches have
    // already been divided by a real lane, so a convex kernel cannot erase an
    // entire arm of the district as it did in the previous strip generator.
    const block = cleanStreetRing(
      insetConvexKernel(
        poly,
        sides.map(s => s.setback)
      )
    );
    if (block.length < 3 || area(block) < lotArea * 0.45) return;
    fabric.blocks.push(block);
    const sign = -Math.sign(polygonArea(poly));
    const primaryEdges = block.flatMap((a, i) => {
      const b = block[(i + 1) % block.length];
      const primary = poly.some((p, j) => {
        if (!sides[j].primary) return false;
        const q = poly[(j + 1) % poly.length];
        const tangent = unit(sub(q, p));
        const inward: Point = [-sign * tangent[1], sign * tangent[0]];
        const offset = dot(p, inward) + sides[j].setback;
        return Math.abs(dot(a, inward) - offset) < 1e-4 && Math.abs(dot(b, inward) - offset) < 1e-4;
      });
      return primary ? [i] : [];
    });
    const footprints = frontageBuildings(
      block,
      block.map((_, i) => i),
      {
        lotArea,
        coverage: parameters?.coverage ?? 0.9,
        occupancy: parameters?.occupancy ?? 1,
        outskirts: false,
        perimeter: true,
        rowDepth: houseDepth,
        primaryEdges
      },
      makeRng(`${seed}:organic-houses:${face.id}:${JSON.stringify(block)}`)
    );
    fabric.buildings.push(
      ...footprints
        .filter(
          p =>
            p.length >= 4 &&
            area(p) >= 12 &&
            // Corner mitres can leave less room than the nominal inset on
            // one side. Keep the facade clear of every generated lane.
            p.every(point =>
              roads.every(
                lane =>
                  nearestOnPolyline(point, lane.points).dist >= lane.widthMeters / 2 + ORGANIC_LANE_FACADE_CLEARANCE / 7
              )
            )
        )
        .map(polygon => ({
          faceId: face.id,
          polygon,
          landmark: false
        }))
    );
  }
}

/** Minimum-area local bounding frame. Unlike the longest single mesh edge,
 * this is unchanged by inserting collinear editing vertices. */
function localFrame(poly: Point[], preferred?: Point): Frame {
  let best: Frame = { axis: [1, 0], lo: 0, hi: 0, short: 0 };
  let bestArea = Infinity;
  for (let i = 0; i < poly.length; i++) {
    if (distance(poly[i], poly[(i + 1) % poly.length]) < 1e-5) continue;
    let axis = unit(sub(poly[(i + 1) % poly.length], poly[i]));
    const cross: Point = [-axis[1], axis[0]];
    const xs = poly.map(p => dot(p, axis)),
      ys = poly.map(p => dot(p, cross));
    let lo = Math.min(...xs),
      hi = Math.max(...xs);
    const bottom = Math.min(...ys),
      top = Math.max(...ys);
    let short = top - bottom;
    const boxArea = (hi - lo) * short;
    if (boxArea > bestArea + 1e-5) continue;
    if (short > hi - lo) {
      short = hi - lo;
      lo = bottom;
      hi = top;
      axis = cross;
    }
    if (
      Math.abs(boxArea - bestArea) < 1e-5 &&
      (!preferred || Math.abs(dot(axis, preferred)) <= Math.abs(dot(best.axis, preferred)))
    )
      continue;
    bestArea = boxArea;
    best = { axis, lo, hi, short };
  }
  return best;
}

function nearestWall(p: Point, walls: [Point, Point][]): [Point, Point] | undefined {
  let best: [Point, Point] | undefined;
  let bestDistance = Infinity;
  for (const wall of walls) {
    if (distance(...wall) < 1e-5) continue;
    const d = nearestOnPolyline(p, wall).dist;
    if (d < bestDistance) {
      best = wall;
      bestDistance = d;
    }
  }
  return best;
}

function chooseSplit(
  poly: Point[],
  axis: Point,
  rng: Rng,
  span: number,
  boundaries: BlockBoundary[],
  bend?: { hub: Point; outward: Point },
  compact?: CompactSplit
): Split | null {
  let best: Split | null = null;
  let bestScore = Infinity;
  const third = rng() < 0.3;
  const fraction = (third ? (rng() < 0.5 ? 1 / 3 : 2 / 3) : 0.5) + rng.range(-0.07, 0.07);
  for (let attempt = 0; attempt < 9; attempt++) {
    const normal = rotate(axis, attempt === 0 ? 0 : rng.range(-0.16, 0.16));
    const values = poly.map(p => dot(p, normal));
    const lo = Math.min(...values),
      hi = Math.max(...values);
    const t = attempt < 5 ? fraction : rng.range(0.38, 0.62);
    for (const chord of streetChords(poly, normal, lo + (hi - lo) * t)) {
      const length = distance(...chord);
      if (length < span * 0.65) continue;
      let path: Point[] = chord;
      if (bend && length > span * (compact ? 1.25 : 2)) {
        const radius = Math.max(span, distance(polygonCentroid(poly), bend.hub));
        const sag = Math.min(length * 0.13, (length * length) / (8 * radius));
        // A pair of gentle bends follows the wall around the square. Endpoints
        // remain precisely on the two parent streets, not near them.
        path = [
          chord[0],
          ...[1 / 3, 2 / 3].map(f => {
            const p = lerp(...chord, f);
            return [p[0] + (bend.outward[0] * sag * 8) / 9, p[1] + (bend.outward[1] * sag * 8) / 9] as Point;
          }),
          chord[1]
        ];
      }
      let candidate = splitAlongPath(poly, path);
      if (!candidate && path.length > 2) candidate = splitAlongPath(poly, chord);
      if (!candidate) continue;
      const sizes = candidate.parts.map(area);
      if (Math.min(...sizes) < span * span * 0.32) continue;
      const frames = candidate.parts.map(p => localFrame(p));
      if (frames.some(f => f.short < span * 0.52)) continue;
      // At Micro scale, a wide arterial can consume much of a small parcel.
      // Judge the same inset that will be passed to housing, not just the
      // untrimmed bounding box. Never add an alley that leaves an empty sliver.
      if (
        compact &&
        candidate.parts.some(part => {
          const block = insetConvexKernel(
            part,
            parcelSides(part, boundaries, compact.laneWidth).map(s => s.setback)
          );
          return (
            block.length < 3 || area(block) < compact.lotArea * 1.1 || localFrame(block).short < compact.houseDepth
          );
        })
      )
        continue;
      // Reject slivers/acute intersections, preserve multiple house frontages
      // between junctions, and prefer arterial-to-arterial coarse connections.
      const roadEnds = chord.filter(p =>
        boundaries.some(e => e.feature && !e.barrier && onSegment(p, e.a, e.b))
      ).length;
      // Smooth walls and arterials contain many short editing edges. Those
      // degree-two vertices are not junctions and must not forbid new streets.
      const corners = poly.filter((p, i) => {
        const incoming = unit(sub(p, poly[(i + poly.length - 1) % poly.length]));
        const outgoing = unit(sub(poly[(i + 1) % poly.length], p));
        return dot(incoming, outgoing) < 0.9;
      });
      const cornerDistance = Math.min(...chord.flatMap(p => corners.map(v => distance(p, v))));
      if (cornerDistance < span * 0.24) continue;
      const slenderness = frames.reduce((sum, f) => sum + Math.max(0, (f.hi - f.lo) / f.short - 2.8), 0);
      const score =
        slenderness * 2 + Math.abs(sizes[0] / area(poly) - t) + (length / span) * 0.035 - (bend ? roadEnds * 2 : 0);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  return best;
}

/** Split only along a path fully inside the parent, with both ends on its
 * boundary. Walking the two boundary arcs also handles non-convex parcels. */
function splitAlongPath(poly: Point[], path: Point[]): Split | null {
  const start = path[0],
    end = path.at(-1)!;
  if (distance(start, end) < 1e-5) return null;
  for (let i = 1; i < path.length; i++) {
    if (!segmentInside(path[i - 1], path[i], poly)) return null;
  }
  const ring: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const extra = [start, end]
      .filter(p => onSegment(p, a, b) && distance(p, a) > 1e-5 && distance(p, b) > 1e-5)
      .sort((p, q) => distance(a, p) - distance(a, q));
    ring.push(a, ...extra);
  }
  const from = ring.findIndex(p => distance(p, start) < 1e-5);
  const to = ring.findIndex(p => distance(p, end) < 1e-5);
  if (from < 0 || to < 0 || from === to) return null;
  const arc = (a: number, b: number): Point[] => {
    const points = [ring[a]];
    for (let i = (a + 1) % ring.length; i !== b; i = (i + 1) % ring.length) points.push(ring[i]);
    points.push(ring[b]);
    return points;
  };
  const middle = path.slice(1, -1);
  // Keep collinear vertices: they may mark a gate or a change from road to
  // plaza frontage even when the geometric boundary is straight.
  const parts: [Point[], Point[]] = [
    [...arc(from, to), ...middle.slice().reverse()],
    [...arc(to, from), ...middle]
  ];
  if (parts.some(p => !isSimplePolygon(p))) return null;
  if (Math.abs(area(parts[0]) + area(parts[1]) - area(poly)) > Math.max(1e-4, area(poly) * 1e-7)) return null;
  return { parts, path };
}

/** Check every interval between boundary crossings, not just a few samples. */
function segmentInside(a: Point, b: Point, poly: Point[]): boolean {
  const length = distance(a, b);
  if (length < 1e-7) return true;
  const cuts = [0, 1];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    const hit = lineLineIntersection(a, b, p, q);
    if (hit && onSegment(hit, a, b) && onSegment(hit, p, q)) cuts.push(distance(a, hit) / length);
  }
  cuts.sort((x, y) => x - y);
  return cuts.slice(1).every((t, i) => {
    if (t - cuts[i] < 1e-7) return true;
    const p = lerp(a, b, (t + cuts[i]) / 2);
    return pointInPolygon(p, poly) || poly.some((v, j) => onSegment(p, v, poly[(j + 1) % poly.length]));
  });
}

function splitReflex(poly: Point[], minimumArea: number): Split | null {
  const sign = -Math.sign(polygonArea(poly));
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i + poly.length - 1) % poly.length],
      p = poly[i],
      next = poly[(i + 1) % poly.length];
    const a = sub(p, prev),
      b = sub(next, p);
    if (sign * (a[0] * b[1] - a[1] * b[0]) >= -1e-5) continue;
    for (const direction of [a, b]) {
      const normal = rotate(unit(direction), Math.PI / 2);
      for (const chord of streetChords(poly, normal, dot(p, normal))) {
        const split = splitAlongPath(poly, chord);
        if (split?.parts.every(part => area(part) > minimumArea)) return split;
      }
    }
  }
  return null;
}

/** A cleaned block side may span multiple collinear editing edges. */
function overlappingBoundaries(a: Point, b: Point, boundaries: BlockBoundary[]): BlockBoundary[] {
  const tangent = unit(sub(b, a));
  const normal: Point = [-tangent[1], tangent[0]];
  const length = distance(a, b);
  return boundaries.filter(edge => {
    if (Math.abs(dot(sub(edge.a, a), normal)) > 1e-5 || Math.abs(dot(sub(edge.b, a), normal)) > 1e-5) return false;
    const u = dot(sub(edge.a, a), tangent),
      v = dot(sub(edge.b, a), tangent);
    return Math.min(length, Math.max(u, v)) - Math.max(0, Math.min(u, v)) > 1e-5;
  });
}

function parcelSides(poly: Point[], perimeter: BlockBoundary[], laneWidth: number) {
  return poly.map((a, i) => {
    const matches = overlappingBoundaries(a, poly[(i + 1) % poly.length], perimeter);
    return {
      setback: Math.max(laneWidth / 2 + ORGANIC_LANE_FACADE_CLEARANCE, ...matches.map(edge => edge.setback)),
      primary: matches.some(edge => edge.feature && !edge.barrier)
    };
  });
}

function corridorDomains(
  outline: Point[],
  boundaries: BlockBoundary[],
  width: number,
  span: number,
  depth = 0
): { ring: Point[]; boundaries: BlockBoundary[] }[] {
  const sign = -Math.sign(polygonArea(outline));
  const edges = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const original = boundaries.find(e => onSegment(a, e.a, e.b) && onSegment(b, e.a, e.b));
    const tangent = unit(sub(b, a));
    const inward: Point = [-sign * tangent[1], sign * tangent[0]];
    // Existing barrier setback is half its width plus 3m. Reserve the full
    // walking width outside that solid obstacle, then a facade clearance.
    const offset = original?.barrier ? Math.max(0, original.setback - 3) + 0.6 + width / 2 : 0;
    return {
      original,
      offset,
      a: [a[0] + inward[0] * offset, a[1] + inward[1] * offset] as Point,
      b: [b[0] + inward[0] * offset, b[1] + inward[1] * offset] as Point
    };
  });
  const ring = edges.map((edge, i) => {
    const prev = edges[(i + edges.length - 1) % edges.length];
    const hit = lineLineIntersection(prev.a, prev.b, edge.a, edge.b);
    return hit ?? lerp(prev.b, edge.a, 0.5);
  });
  const valid =
    isSimplePolygon(ring) &&
    Math.sign(polygonArea(ring)) === Math.sign(polygonArea(outline)) &&
    ring.every((p, i) => segmentInside(p, ring[(i + 1) % ring.length], outline)) &&
    ring.every(
      (p, i) =>
        distance(p, outline[i]) <=
        Math.max(width, edges[i].offset, edges[(i + edges.length - 1) % edges.length].offset) * 5
    );
  if (!valid) {
    // An ear-clipping decomposition is not a street plan: its diagonals can
    // all converge on one wall vertex, producing a fan of unbuildable wedges.
    // Resolve a failed offset with transverse streets between parent edges.
    // Each child is offset independently, keeping its original wall/bank
    // clearances. The cuts use the same house-scale limits as normal streets.
    if (depth < 10) {
      const frame = localFrame(outline);
      const rng = makeRng(`organic-corridor:${JSON.stringify(outline)}`);
      // A river/arterial strip may be narrower than two house rows and still
      // need a continuous bank path. Repair its offset at corridor scale;
      // housing is still admitted later using the full facade setbacks.
      const repairSpan = Math.min(span, Math.max(width * 2, frame.short * 0.8));
      const axes: Point[] = [frame.axis, [-frame.axis[1], frame.axis[0]]];
      for (const axis of axes) {
        const split = chooseSplit(outline, axis, rng, repairSpan, boundaries);
        if (!split) continue;
        const domains = split.parts.flatMap(part => corridorDomains(part, boundaries, width, span, depth + 1));
        if (domains.length) return domains;
      }
    }
    return [];
  }
  return [
    {
      ring,
      boundaries: edges.map((edge, i) => ({
        a: ring[i],
        b: ring[(i + 1) % ring.length],
        feature: edge.original?.feature ?? false,
        barrier: edge.original?.barrier ?? false,
        setback: edge.original?.barrier
          ? width / 2 + ORGANIC_LANE_FACADE_CLEARANCE
          : (edge.original?.setback ?? width / 2 + ORGANIC_LANE_FACADE_CLEARANCE)
      }))
    }
  ];
}

function joinStreetVertices(lanes: InfillLane[]): InfillLane[] {
  const endpoints = new Map<string, Point>();
  for (const lane of lanes) for (const p of lane.points) endpoints.set(pointKey(p), p);
  const seen = new Set<string>();
  const joined: InfillLane[] = [];
  for (const lane of lanes) {
    for (let i = 1; i < lane.points.length; i++) {
      const a = lane.points[i - 1],
        b = lane.points[i];
      const points = [...endpoints.values()]
        .filter(p => onSegment(p, a, b))
        .sort((p, q) => distance(a, p) - distance(a, q));
      for (let j = 1; j < points.length; j++) {
        const p = points[j - 1],
          q = points[j];
        if (distance(p, q) < 1e-5) continue;
        const key = [pointKey(p), pointKey(q)].sort().join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        joined.push({ ...lane, points: [p, q] });
      }
    }
  }
  return joined;
}
