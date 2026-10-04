import { facePoints, indexMeshEdges } from "../mesh";
import type { CityDocument, Face, Id, Point } from "../types";
import { polygonHitsWater, waterPolygons } from "../waterGeometry";
import { pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { clipBlockWithRivers, convexInfillParts, insetConvexKernel, type RiverMargin } from "./lotGeometry";
import { subtractConvex } from "./parcelGeometry";
import { makeRng, type Rng } from "./prng";

/**
 * Top-down tree canopy (green foliage bush), without any trunk.
 */
export interface ParkTreeCanopy {
  center: Point;
  radius: number;
  subCircles: { offset: Point; radius: number }[];
}

export interface ParkLawn {
  faceId: Id;
  lawnPolygons: Point[][];
  paths: Point[][];
  grassTufts: Point[];
  trees: ParkTreeCanopy[];
}

/**
 * Distance from block edge to lawn edge. Creates a perimeter promenade/verge
 * around the green space.
 */
const LAWN_SETBACK = 2.8;

/**
 * Minimum distance (meters) between tree canopy centers and fortification barriers
 * (city walls, castle boundaries) to maintain defensive lines of sight and prevent
 * scaling footholds (esplanade / glacis clear zone).
 */
export const FORTIFICATION_TREE_CLEAR_ZONE = 11.0;

/**
 * Minimum park block area (square meters) required to plant trees when adjacent to
 * fortifications. Smaller blocks adjacent to walls become pure grass esplanades /
 * parade grounds (no trees).
 */
export const MIN_FORTIFIED_PARK_TREE_AREA = 650;

interface ClearanceData {
  wallEdgeIds: Set<Id>;
  castleFaceIds: Set<Id>;
  segments: [Point, Point][];
  rivers: RiverMargin[];
  riverEdgeClearance: Map<Id, number>;
  wallEdgeClearance: Map<Id, number>;
  roadEdgeClearance: Map<Id, number>;
  riverSegments: Array<{ a: Point; b: Point; clearDist: number }>;
  water: Point[][];
}

function collectClearanceData(document: CityDocument): ClearanceData {
  const edgeIndex = indexMeshEdges(document.mesh);
  const wallEdgeIds = new Set<Id>();
  const segments: [Point, Point][] = [];
  const rivers: RiverMargin[] = [];
  const riverEdgeClearance = new Map<Id, number>();
  const wallEdgeClearance = new Map<Id, number>();
  const roadEdgeClearance = new Map<Id, number>();
  const riverSegments: Array<{ a: Point; b: Point; clearDist: number }> = [];

  for (const group of document.featureGroups ?? []) {
    const halfWidth = (group.style?.widthMeters ?? 4) / 2;
    if (group.kind === "river") {
      const margin = halfWidth + 3.2;
      const pts = (group.vertices ?? []).map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
      if (pts.length >= 2) {
        rivers.push({
          points: pts,
          margin,
          halfWidth
        });
        for (let i = 0; i < pts.length - 1; i++) {
          riverSegments.push({ a: pts[i], b: pts[i + 1], clearDist: margin });
        }
      }
      const edgeIds = (group.vertices ?? []).slice(1).flatMap((id, i) => {
        const edge = edgeIndex.between(group.vertices[i], id);
        return edge ? [edge.id] : [];
      });
      for (const eid of edgeIds) {
        riverEdgeClearance.set(eid, Math.max(riverEdgeClearance.get(eid) ?? 0, margin));
      }
    } else if (group.kind === "wall") {
      const margin = halfWidth + 2.5;
      for (const seg of group.segments ?? []) {
        wallEdgeIds.add(seg.edgeId);
        wallEdgeClearance.set(seg.edgeId, Math.max(wallEdgeClearance.get(seg.edgeId) ?? 0, margin));
        const edge = document.mesh.edges[seg.edgeId];
        if (!edge) continue;
        const va = document.mesh.vertices[edge.a]?.point;
        const vb = document.mesh.vertices[edge.b]?.point;
        if (va && vb) {
          segments.push([va, vb]);
        }
      }
    } else if (group.kind === "road") {
      const margin = halfWidth + 1.5;
      for (const seg of group.segments ?? []) {
        roadEdgeClearance.set(seg.edgeId, Math.max(roadEdgeClearance.get(seg.edgeId) ?? 0, margin));
      }
    }
  }

  const castleFaceIds = new Set<Id>();
  for (const f of Object.values(document.mesh.faces)) {
    if (f.properties.ward === "castle") {
      castleFaceIds.add(f.id);
    }
  }
  if (document.elements) {
    for (const el of document.elements) {
      if (el.kind === "citadel") {
        for (const fid of el.faceIds) {
          castleFaceIds.add(fid);
        }
      }
    }
  }

  for (const cid of castleFaceIds) {
    const cf = document.mesh.faces[cid];
    if (!cf) continue;
    const pts = facePoints(document.mesh, cf);
    for (let i = 0; i < pts.length; i++) {
      segments.push([pts[i], pts[(i + 1) % pts.length]]);
    }
  }

  return {
    wallEdgeIds,
    castleFaceIds,
    segments,
    rivers,
    riverEdgeClearance,
    wallEdgeClearance,
    roadEdgeClearance,
    riverSegments,
    water: waterPolygons(document).flatMap(convexInfillParts)
  };
}

function isFaceAdjacentToDefense(
  document: CityDocument,
  face: Face,
  outline: Point[],
  clearance: ClearanceData
): boolean {
  if (!clearance.segments.length) return false;

  for (const ref of face.boundary) {
    if (clearance.wallEdgeIds.has(ref.edgeId)) return true;
    const edge = document.mesh.edges[ref.edgeId];
    if (edge) {
      const neighborId = edge.leftFace === face.id ? edge.rightFace : edge.leftFace;
      if (neighborId && clearance.castleFaceIds.has(neighborId)) return true;
    }
  }

  for (const pt of outline) {
    for (const [a, b] of clearance.segments) {
      if (distToSegment(pt, a, b) < 5.0) return true;
    }
  }

  return false;
}

/**
 * Generate lawn polygons, walkways, and top-down tree canopies for each face with ward="park".
 * Everything is rendered within the town presentation layer and does not pollute `document.elements`.
 */
export function buildParkLawns(document: CityDocument, seed = "park-fabric"): ParkLawn[] {
  const clearance = collectClearanceData(document);
  const lawns: ParkLawn[] = [];
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "land" || face.properties.ward !== "park") continue;
    const lawn = shapeParkFace(document, face, seed, clearance);
    if (lawn) lawns.push(lawn);
  }
  return lawns;
}

function shapeParkFace(document: CityDocument, face: Face, seed: string, clearance: ClearanceData): ParkLawn | null {
  const outline = facePoints(document.mesh, face);
  if (outline.length < 3) return null;
  const area = Math.abs(polygonArea(outline));
  if (area < 25) return null;

  const setbacks = face.boundary.map(ref => {
    const edge = document.mesh.edges[ref.edgeId];
    const otherId = edge ? (edge.leftFace === face.id ? edge.rightFace : edge.leftFace) : null;
    const otherFace = otherId ? document.mesh.faces[otherId] : null;

    const riverM = clearance.riverEdgeClearance.get(ref.edgeId);
    if (riverM !== undefined) return riverM;

    if (otherFace && otherFace.properties.water !== "land") {
      return 6.0;
    }

    const wallM = clearance.wallEdgeClearance.get(ref.edgeId);
    if (wallM !== undefined) return wallM;

    const roadM = clearance.roadEdgeClearance.get(ref.edgeId);
    if (roadM !== undefined) return roadM;

    return LAWN_SETBACK;
  });

  const parts = convexInfillParts(outline);
  const lawnPolygons: Point[][] = [];
  for (const part of parts) {
    const partArea = Math.abs(polygonArea(part));
    if (partArea < 20) continue;

    const partSetbacks = part.map((pt, i) => {
      const nextPt = part[(i + 1) % part.length];
      const mid: Point = [(pt[0] + nextPt[0]) / 2, (pt[1] + nextPt[1]) / 2];

      let maxEdgeSetback = partArea < 80 ? 1.8 : LAWN_SETBACK;
      for (let j = 0; j < face.boundary.length; j++) {
        const ref = face.boundary[j];
        const edge = document.mesh.edges[ref.edgeId];
        if (!edge) continue;
        const va = document.mesh.vertices[edge.a]?.point;
        const vb = document.mesh.vertices[edge.b]?.point;
        if (va && vb && distToSegment(mid, va, vb) < 1.0) {
          maxEdgeSetback = Math.max(maxEdgeSetback, setbacks[j]);
        }
      }
      return maxEdgeSetback;
    });

    let inset = insetConvexKernel(part, partSetbacks);
    if (inset.length >= 3 && clearance.rivers.length > 0) {
      const clipped = clipBlockWithRivers(inset, part, polygonCentroid(part), clearance.rivers);
      if (clipped.length >= 3) inset = clipped;
    }

    if (inset.length >= 3 && Math.abs(polygonArea(inset)) >= 15) {
      lawnPolygons.push(inset);
    } else if (part.length >= 3 && partArea >= 25) {
      const fallbackSetbacks = partSetbacks.map(s => Math.min(s, 1.8));
      let fallback = insetConvexKernel(part, fallbackSetbacks);
      if (fallback.length >= 3 && clearance.rivers.length > 0) {
        const clipped = clipBlockWithRivers(fallback, part, polygonCentroid(part), clearance.rivers);
        if (clipped.length >= 3) fallback = clipped;
      }
      if (fallback.length >= 3) lawnPolygons.push(fallback);
    }
  }

  if (!lawnPolygons.length) {
    const c = polygonCentroid(outline);
    let scaled = outline.map(p => [c[0] + (p[0] - c[0]) * 0.82, c[1] + (p[1] - c[1]) * 0.82] as Point);
    if (clearance.rivers.length > 0) {
      const clipped = clipBlockWithRivers(scaled, outline, c, clearance.rivers);
      if (clipped.length >= 3) scaled = clipped;
    }
    if (scaled.length >= 3) lawnPolygons.push(scaled);
  }

  let dryLawns = lawnPolygons;
  for (const wet of clearance.water) dryLawns = dryLawns.flatMap(part => subtractConvex(part, wet, 1));
  if (!dryLawns.length) return null;
  const isFortified = isFaceAdjacentToDefense(document, face, outline, clearance);
  const rng = makeRng(`${seed}:park-lawn:${face.id}`);
  const paths = generateParkPaths(outline, dryLawns, area, rng);
  const grassTufts = generateGrassTufts(dryLawns, paths, rng);
  const trees = generateTopDownBushes(outline, dryLawns, paths, area, rng, clearance, isFortified).filter(tree => {
    const r = Math.max(tree.radius, ...tree.subCircles.map(c => Math.hypot(...c.offset) + c.radius));
    const [x, y] = tree.center;
    return !polygonHitsWater(
      [
        [x - r, y - r],
        [x + r, y - r],
        [x + r, y + r],
        [x - r, y + r]
      ],
      clearance.water
    );
  });

  return {
    faceId: face.id,
    lawnPolygons: dryLawns,
    paths,
    grassTufts,
    trees
  };
}

function generateParkPaths(_outline: Point[], lawns: Point[][], area: number, rng: Rng): Point[][] {
  if (area < 280 || !lawns.length) return [];
  const paths: Point[][] = [];
  const mainLawn = lawns.slice().sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0];
  if (!mainLawn || mainLawn.length < 4) return [];

  const n = mainLawn.length;
  const i1 = rng.int(0, Math.floor(n / 2));
  const i2 = (i1 + Math.floor(n / 2) + rng.int(-1, 1) + n) % n;

  const a: Point = [
    (mainLawn[i1][0] + mainLawn[(i1 + 1) % n][0]) / 2,
    (mainLawn[i1][1] + mainLawn[(i1 + 1) % n][1]) / 2
  ];
  const b: Point = [
    (mainLawn[i2][0] + mainLawn[(i2 + 1) % n][0]) / 2,
    (mainLawn[i2][1] + mainLawn[(i2 + 1) % n][1]) / 2
  ];

  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 10) return [];

  const normal: Point = [-dy / len, dx / len];
  const curveOffset = (rng() - 0.5) * Math.min(len * 0.25, 8);
  const ctrl: Point = [mid[0] + normal[0] * curveOffset, mid[1] + normal[1] * curveOffset];

  const quarter1: Point = [(a[0] + ctrl[0]) / 2, (a[1] + ctrl[1]) / 2];
  const quarter2: Point = [(ctrl[0] + b[0]) / 2, (ctrl[1] + b[1]) / 2];
  paths.push([a, quarter1, ctrl, quarter2, b]);

  return paths;
}

function generateGrassTufts(lawns: Point[][], paths: Point[][], rng: Rng): Point[] {
  const tufts: Point[] = [];
  for (const lawn of lawns) {
    const area = Math.abs(polygonArea(lawn));
    const targetCount = Math.max(2, Math.min(10, Math.round(area / 90)));
    const xs = lawn.map(p => p[0]);
    const ys = lawn.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    let attempts = 0;
    while (tufts.length < targetCount && attempts < 40) {
      attempts++;
      const p: Point = [minX + rng() * (maxX - minX), minY + rng() * (maxY - minY)];
      if (!pointInPolygon(p, lawn)) continue;
      let nearPath = false;
      for (const path of paths) {
        for (let i = 0; i < path.length - 1; i++) {
          if (distToSegment(p, path[i], path[i + 1]) < 2.0) {
            nearPath = true;
            break;
          }
        }
        if (nearPath) break;
      }
      if (nearPath) continue;
      tufts.push(p);
    }
  }
  return tufts;
}

/**
 * Generate top-down green foliage / bushes inside the park.
 * These are represented as rounded green clusters (no trunks), fitting a top-down aerial map.
 */
function generateTopDownBushes(
  outline: Point[],
  _lawns: Point[][],
  paths: Point[][],
  area: number,
  rng: Rng,
  clearance?: ClearanceData,
  isFortified = false
): ParkTreeCanopy[] {
  // If adjacent to fortifications and block is small/medium, treat as an open esplanade /
  // military parade ground (pure lawn, no climbable trees).
  if (isFortified && area < MIN_FORTIFIED_PARK_TREE_AREA) {
    return [];
  }

  const targetCount = Math.max(2, Math.min(18, Math.round(area / 110)));
  const trees: ParkTreeCanopy[] = [];
  const xs = outline.map(p => p[0]);
  const ys = outline.map(p => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const borderMargin = Math.min(4.0, Math.sqrt(area) * 0.12);
  const minTreeDist = 6.5;

  let attempts = 0;
  while (trees.length < targetCount && attempts < 90) {
    attempts++;
    const cand: Point = [minX + rng() * (maxX - minX), minY + rng() * (maxY - minY)];

    if (!pointInPolygon(cand, outline)) continue;

    let tooCloseToEdge = false;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      if (distToSegment(cand, a, b) < borderMargin) {
        tooCloseToEdge = true;
        break;
      }
    }
    if (tooCloseToEdge) continue;

    // Check distance to fortifications (city walls and castles)
    if (clearance?.segments.length) {
      let tooCloseToDefense = false;
      for (const [a, b] of clearance.segments) {
        if (distToSegment(cand, a, b) < FORTIFICATION_TREE_CLEAR_ZONE) {
          tooCloseToDefense = true;
          break;
        }
      }
      if (tooCloseToDefense) continue;
    }

    // Check distance to rivers
    if (clearance?.riverSegments.length) {
      let tooCloseToRiver = false;
      for (const rSeg of clearance.riverSegments) {
        if (distToSegment(cand, rSeg.a, rSeg.b) < rSeg.clearDist) {
          tooCloseToRiver = true;
          break;
        }
      }
      if (tooCloseToRiver) continue;
    }

    // Check distance to walkways
    let hitsPath = false;
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        if (distToSegment(cand, path[i], path[i + 1]) < 1.8) {
          hitsPath = true;
          break;
        }
      }
      if (hitsPath) break;
    }
    if (hitsPath) continue;

    // Check distance to existing trees
    if (trees.some(t => Math.hypot(t.center[0] - cand[0], t.center[1] - cand[1]) < minTreeDist)) continue;

    const radius = 3.5 + rng() * 2.8; // radius 3.5m - 6.3m (diameter 7m - 12.6m)
    const numSubCircles = 2 + rng.int(0, 2);
    const subCircles: { offset: Point; radius: number }[] = [];
    for (let k = 0; k < numSubCircles; k++) {
      const angle = (k / numSubCircles) * Math.PI * 2 + (rng() - 0.5) * 0.8;
      const dist = radius * (0.35 + rng() * 0.25);
      const subR = radius * (0.55 + rng() * 0.25);
      subCircles.push({
        offset: [Math.cos(angle) * dist, Math.sin(angle) * dist],
        radius: subR
      });
    }

    trees.push({ center: cand, radius, subCircles });
  }

  // Fallback: at least one canopy if area is large enough, but NEVER violate fortification or river clear zones
  if (!trees.length && !isFortified) {
    const c = polygonCentroid(outline);
    if (pointInPolygon(c, outline)) {
      const nearDefense = clearance?.segments.some(([a, b]) => distToSegment(c, a, b) < FORTIFICATION_TREE_CLEAR_ZONE);
      const nearRiver = clearance?.riverSegments.some(rSeg => distToSegment(c, rSeg.a, rSeg.b) < rSeg.clearDist);
      if (!nearDefense && !nearRiver) {
        trees.push({
          center: c,
          radius: 4.5,
          subCircles: [
            { offset: [1.5, 1.2], radius: 3.2 },
            { offset: [-1.4, -1.0], radius: 2.8 }
          ]
        });
      }
    }
  }

  return trees;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY);
}
