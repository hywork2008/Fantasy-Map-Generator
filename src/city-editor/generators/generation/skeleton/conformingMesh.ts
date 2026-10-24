// K6: mirrored Voronoi sites, then exact local subdivision at corners/junctions.
// Subdivision preserves the partition and never moves a skeleton or mesh vertex.
import type { Mesh } from "../../../types/document";
import type { Point } from "../../../types/geometry";
import { polygonArea, segmentsIntersect } from "../../geom";
import { guardRing, scatterSites } from "../../grid";
import { makeRng } from "../../prng";
import { computeVoronoiCells } from "../../voronoi";
import type { Skeleton, SkeletonInputs, SkeletonMeshChain, SkeletonMeshLine } from "./contracts";
import {
  clipMeshSegment,
  type MeshSegment,
  meshSegments,
  SegmentGrid,
  segmentDistance,
  segmentParameter
} from "./meshSegments";
import { assembleConformingMesh } from "./meshTopology";
import { bandRing, dist, signedArea } from "./vector";

export interface ConformingMeshResult {
  mesh: Mesh;
  lines: SkeletonMeshChain[];
  diagnostics: {
    sites: number;
    mirrorPairs: number;
    localSplits: number;
    minFaceArea: number;
    minEdgeLength: number;
    subSquareMetreFaces: number;
  };
}

/** All input boundaries remain separate, including overlapping roads and water rings. */
export function skeletonMeshLines(inputs: SkeletonInputs, skeleton: Skeleton): SkeletonMeshLine[] {
  return [
    ...(skeleton.wall ? [{ id: "wall", kind: "wall" as const, points: skeleton.wall.polygon, closed: true }] : []),
    ...(skeleton.closedLines ?? []).map(line => ({
      id: line.id,
      kind: "wall" as const,
      points: line.points,
      closed: true
    })),
    ...inputs.water.map((w, i) => ({ id: `water:${i}`, kind: "water" as const, points: w.polygon, closed: true })),
    ...inputs.rivers.map(r => ({
      id: `river:${r.index}`,
      kind: "river" as const,
      points: r.centerline,
      closed: false
    })),
    ...inputs.rivers.map(r => ({
      id: `bank:${r.index}`,
      kind: "bank" as const,
      points: bandRing(r.centerline, r.halfWidth),
      closed: true
    })),
    ...skeleton.routes
      .filter(r => !r.dropped)
      .map(r => ({
        id: `road:${r.id}`,
        kind: "road" as const,
        points: r.path,
        closed: false
      }))
  ];
}

/** Split a convex cell only if the finite constraint passes through its interior.
 * The cut extends to that cell's boundary, so no dangling face edge is created. */
function splitAtSegment(poly: Point[], s: MeshSegment, eps: number): Point[][] {
  const { a, b } = s;
  const length = dist(a, b);
  const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  const side = (p: Point) => (p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1];
  const sides = poly.map(side);
  if (Math.min(...sides) >= -1e-10 || Math.max(...sides) <= 1e-10) return [poly];
  const hits: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    if (Math.abs(sides[i]) <= 1e-10) hits.push(poly[i]);
    if (sides[i] * sides[j] < 0) {
      const t = sides[i] / (sides[i] - sides[j]);
      hits.push([poly[i][0] + (poly[j][0] - poly[i][0]) * t, poly[i][1] + (poly[j][1] - poly[i][1]) * t]);
    }
  }
  const ts = hits.map(p => segmentParameter(p, s));
  if (!ts.length || Math.min(...ts) >= 1 - eps / length || Math.max(...ts) <= eps / length) return [poly];
  // Use the SAME intersections on both sides; no independent snapping/cleanRing tolerance.
  const halves: Point[][] = [[], []];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    if (sides[i] >= 0) halves[0].push(poly[i]);
    if (sides[i] <= 0) halves[1].push(poly[i]);
    if (sides[i] * sides[j] < 0) {
      const t = sides[i] / (sides[i] - sides[j]);
      const p: Point = [poly[i][0] + (poly[j][0] - poly[i][0]) * t, poly[i][1] + (poly[j][1] - poly[i][1]) * t];
      halves[0].push(p);
      halves[1].push(p);
    }
  }
  return halves;
}

/** Throws on an invalid partition or incomplete correspondence; never returns a partial mesh. */
export function buildConformingMesh(inputs: SkeletonInputs, skeleton: Skeleton, seed: string): ConformingMeshResult {
  const { half, cellSize } = inputs;
  if (!(half > 0 && cellSize > 0 && Number.isFinite(half + cellSize))) throw new Error("Invalid K6 dimensions");
  const eps = Math.max(1e-4, half * 1e-9);
  const win = { minX: -half, minY: -half, maxX: half, maxY: half };
  const lines = skeletonMeshLines(inputs, skeleton);
  const segments = lines
    .flatMap(meshSegments)
    .map(s => clipMeshSegment(s, half))
    .filter((s): s is MeshSegment => !!s && dist(s.a, s.b) > eps);
  const sites: Point[] = [];
  let mirrorPairs = 0;
  // Grid of accepted mirror centres: a centre within 0.65 cells can only sit in a neighbouring bin.
  const mirrorRadius = cellSize * 0.65;
  const mirrorBins = new Map<string, Point[]>();
  const mirrorBin = (p: Point, dx = 0, dy = 0) =>
    `${Math.floor(p[0] / mirrorRadius) + dx},${Math.floor(p[1] / mirrorRadius) + dy}`;
  const nearMirror = (p: Point) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        if (mirrorBins.get(mirrorBin(p, dx, dy))?.some(q => dist(p, q) < mirrorRadius)) return true;
    return false;
  };
  for (const s of segments) {
    const length = dist(s.a, s.b);
    const n = Math.max(1, Math.ceil(length / cellSize));
    const d = cellSize * 0.28;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p: Point = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
      // A finely digitised coast is still one macro boundary: do not seed
      // a new pair at every short facet. Exact corners are handled locally below.
      if (nearMirror(p)) continue;
      const bin = mirrorBin(p);
      mirrorBins.set(bin, [...(mirrorBins.get(bin) ?? []), p]);
      for (const sign of [-1, 1])
        sites.push([p[0] - (sign * d * (s.b[1] - s.a[1])) / length, p[1] + (sign * d * (s.b[0] - s.a[0])) / length]);
      mirrorPairs++;
    }
  }
  const rng = makeRng(`${seed}:skeleton:${skeleton.attempt}:mesh`);
  const scattered = scatterSites(
    {
      seed,
      extentMeters: 2 * half,
      cityRadiusMeters: inputs.cityRadius,
      cellSizeMeters: cellSize * 0.896,
      lloydPasses: 0
    },
    { coast: null, rivers: [], roadBearings: [] },
    rng
  );
  const clearance = cellSize * 0.56;
  const segmentGrid = new SegmentGrid(segments, cellSize, clearance);
  for (const p of scattered) if (segmentGrid.near(p).every(s => segmentDistance(p, s) >= clearance)) sites.push(p);
  sites.push(...guardRing(win, cellSize * 2.5));
  // Coincident constraints can produce identical sites; Delaunator omits duplicates.
  const unique = [...new Map(sites.map(p => [`${Math.round(p[0] / eps)},${Math.round(p[1] / eps)}`, p])).values()];
  const raw = computeVoronoiCells(unique);
  let polygons: Point[][] = [];
  raw.forEach((cell, i) => {
    if (cell.onHull) return;
    let polygon: Point[] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half]
    ];
    // Bisectors avoid unstable circumcentres at nearly co-circular mirror sites.
    for (const j of cell.neighbors) {
      const a = unique[i],
        b = unique[j];
      const origin: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const length = dist(a, b),
        normal: Point = [(a[0] - b[0]) / length, (a[1] - b[1]) / length];
      const side = (p: Point) => (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1];
      const clipped: Point[] = [];
      for (let k = 0; k < polygon.length; k++) {
        const p = polygon[k],
          q = polygon[(k + 1) % polygon.length],
          dp = side(p),
          dq = side(q);
        if (dp >= 0) clipped.push(p);
        if (dp * dq < 0) {
          const t = dp / (dp - dq);
          clipped.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
      polygon = clipped;
      if (!polygon.length) break;
    }
    if (polygon.length >= 3 && Math.abs(polygonArea(polygon)) > eps * eps) polygons.push(polygon);
  });
  let localSplits = 0;
  const boxOf = (poly: Point[]) => {
    let x1 = Infinity,
      y1 = Infinity,
      x2 = -Infinity,
      y2 = -Infinity;
    for (const q of poly) {
      if (q[0] < x1) x1 = q[0];
      if (q[0] > x2) x2 = q[0];
      if (q[1] < y1) y1 = q[1];
      if (q[1] > y2) y2 = q[1];
    }
    return [x1, y1, x2, y2] as const;
  };
  let boxes = polygons.map(boxOf);
  for (const s of segments) {
    // A polygon clear of the segment's bounding box (by more than eps) cannot be cut by it.
    const sx1 = Math.min(s.a[0], s.b[0]) - eps * 2,
      sx2 = Math.max(s.a[0], s.b[0]) + eps * 2,
      sy1 = Math.min(s.a[1], s.b[1]) - eps * 2,
      sy2 = Math.max(s.a[1], s.b[1]) + eps * 2;
    const next: Point[][] = [];
    const nextBoxes: (readonly [number, number, number, number])[] = [];
    polygons.forEach((p, i) => {
      const box = boxes[i];
      if (box[2] < sx1 || box[0] > sx2 || box[3] < sy1 || box[1] > sy2) {
        next.push(p);
        nextBoxes.push(box);
        return;
      }
      const parts = splitAtSegment(p, s, eps);
      localSplits += parts.length - 1;
      for (const part of parts) {
        next.push(part);
        nextBoxes.push(parts.length === 1 ? box : boxOf(part));
      }
    });
    polygons = next;
    boxes = nextBoxes;
  }
  polygons = polygons.map(p => (signedArea(p) < 0 ? p.toReversed() : p));
  const result = assembleConformingMesh(polygons, lines, half, cellSize, eps);
  const areas = Object.values(result.mesh.faces).map(f => {
    const p = f.boundary.map(r => {
      const e = result.mesh.edges[r.edgeId];
      return result.mesh.vertices[r.forward ? e.a : e.b].point;
    });
    if (
      Math.abs(polygonArea(p)) <= eps * eps ||
      p.some((a, i) =>
        p.some(
          (b, j) =>
            j >= i + 2 &&
            !(i === 0 && j === p.length - 1) &&
            segmentsIntersect(a, p[(i + 1) % p.length], b, p[(j + 1) % p.length])
        )
      )
    )
      throw new Error(`K6 non-simple face ${f.id}`);
    return Math.abs(polygonArea(p));
  });
  if (Math.abs(areas.reduce((a, b) => a + b, 0) - 4 * half * half) > 4 * half * half * 1e-7)
    throw new Error("K6 frame coverage mismatch");
  const lengths = Object.values(result.mesh.edges).map(e =>
    dist(result.mesh.vertices[e.a].point, result.mesh.vertices[e.b].point)
  );
  return {
    ...result,
    diagnostics: {
      sites: unique.length,
      mirrorPairs,
      localSplits,
      minFaceArea: Math.min(...areas),
      minEdgeLength: Math.min(...lengths),
      subSquareMetreFaces: areas.filter(a => a < 1).length
    }
  };
}
