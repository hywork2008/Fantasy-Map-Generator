import type { DistrictParameters, Face, Point } from "../types";
import { frontageBuildings } from "./frontageBuildings";
import { pointInPolygon, polygonArea } from "./geom";
import { dwellingLotArea, intramuralBlockSpan } from "./housing";
import type { InfillLane } from "./localInfill";
import { insetConvexKernel, longestFrame } from "./lotGeometry";
import { buildOrganicBlocks, type OrganicBlockContext } from "./organicBlocks";
import { makeRng, type Rng } from "./prng";
import {
  type BlockBoundary,
  cleanStreetRing as clean,
  clipStreetBlocks,
  type PerimeterFabric,
  streetChords
} from "./streetBlockGeometry";
import { computeDelaunayEdges } from "./voronoi";

export { type BlockBoundary, clipStreetBlocks, type PerimeterFabric, streetChords } from "./streetBlockGeometry";

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const area = (p: Point[]) => Math.abs(polygonArea(p));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const key = (p: Point) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;

/** Dispatch Organic to its connected street network. Classic retains its
 * independent Voronoi neighbourhoods, separate from the editable mesh. */
export function buildPerimeterBlocks(
  face: Face,
  outline: Point[],
  boundaries: BlockBoundary[],
  parameters: DistrictParameters | undefined,
  seed: string,
  build: boolean,
  classic = false,
  organicContext?: OrganicBlockContext
): PerimeterFabric {
  if (!classic) return buildOrganicBlocks(face, outline, boundaries, parameters, seed, build, organicContext);
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
  for (const edge of boundaries) {
    if (distance(edge.a, edge.b) > 1e-6 && !edge.feature && !edge.barrier) {
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
      block.flatMap((_, i) => (frontageSides[i]?.barrier ? [] : [i])),
      {
        lotArea: target,
        coverage: parameters?.coverage ?? 0.9,
        occupancy: parameters?.occupancy ?? 1,
        outskirts: face.properties.settlement === "outskirts",
        attached: true,
        primaryEdges: frontageSides.flatMap((side, i) => (side?.primary ? [i] : []))
      },
      makeRng(`${seed}:houses:${face.id}:${JSON.stringify(block)}`)
    );
    const validFootprints = footprints.filter(p => p.length >= 4 && area(p) >= 10);
    fabric.buildings.push(...validFootprints.map(polygon => ({ faceId: face.id, polygon, landmark: false })));
  };
  const ring = clean(outline);
  const finalBlocks: Point[][] = [];
  finalBlocks.push(...classicStreetBlocks(ring, boundaries, axis, spanLimit, rng));

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

  fabric.lanes = [...boundaryLanes, ...internalLanes];

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
