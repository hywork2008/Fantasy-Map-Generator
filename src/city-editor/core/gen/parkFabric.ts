import { facePoints } from "../mesh";
import type { CityDocument, Face, Id, Point } from "../types";
import { pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { convexInfillParts, insetConvexKernel } from "./lotGeometry";
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

interface DefenseData {
  wallEdgeIds: Set<Id>;
  castleFaceIds: Set<Id>;
  segments: [Point, Point][];
}

function collectDefenseData(document: CityDocument): DefenseData {
  const wallEdgeIds = new Set<Id>();
  const segments: [Point, Point][] = [];

  for (const group of document.featureGroups) {
    if (group.kind === "wall") {
      for (const seg of group.segments) {
        wallEdgeIds.add(seg.edgeId);
        const edge = document.mesh.edges[seg.edgeId];
        if (!edge) continue;
        const va = document.mesh.vertices[edge.a]?.point;
        const vb = document.mesh.vertices[edge.b]?.point;
        if (va && vb) {
          segments.push([va, vb]);
        }
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

  return { wallEdgeIds, castleFaceIds, segments };
}

function isFaceAdjacentToDefense(document: CityDocument, face: Face, outline: Point[], defense: DefenseData): boolean {
  if (!defense.segments.length) return false;

  for (const ref of face.boundary) {
    if (defense.wallEdgeIds.has(ref.edgeId)) return true;
    const edge = document.mesh.edges[ref.edgeId];
    if (edge) {
      const neighborId = edge.leftFace === face.id ? edge.rightFace : edge.leftFace;
      if (neighborId && defense.castleFaceIds.has(neighborId)) return true;
    }
  }

  for (const pt of outline) {
    for (const [a, b] of defense.segments) {
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
  const defense = collectDefenseData(document);
  const lawns: ParkLawn[] = [];
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "land" || face.properties.ward !== "park") continue;
    const lawn = shapeParkFace(document, face, seed, defense);
    if (lawn) lawns.push(lawn);
  }
  return lawns;
}

function shapeParkFace(document: CityDocument, face: Face, seed: string, defense: DefenseData): ParkLawn | null {
  const outline = facePoints(document.mesh, face);
  if (outline.length < 3) return null;
  const area = Math.abs(polygonArea(outline));
  if (area < 25) return null;

  const parts = convexInfillParts(outline);
  const lawnPolygons: Point[][] = [];
  for (const part of parts) {
    const partArea = Math.abs(polygonArea(part));
    if (partArea < 20) continue;
    const setback = partArea < 80 ? 1.8 : LAWN_SETBACK;
    const inset = insetConvexKernel(
      part,
      part.map(() => setback)
    );
    if (inset.length >= 3 && Math.abs(polygonArea(inset)) >= 15) {
      lawnPolygons.push(inset);
    } else if (part.length >= 3 && partArea >= 25) {
      const fallback = insetConvexKernel(
        part,
        part.map(() => 1.2)
      );
      if (fallback.length >= 3) lawnPolygons.push(fallback);
    }
  }

  if (!lawnPolygons.length) {
    const c = polygonCentroid(outline);
    const scaled = outline.map(p => [c[0] + (p[0] - c[0]) * 0.82, c[1] + (p[1] - c[1]) * 0.82] as Point);
    if (scaled.length >= 3) lawnPolygons.push(scaled);
  }

  const isFortified = isFaceAdjacentToDefense(document, face, outline, defense);
  const rng = makeRng(`${seed}:park-lawn:${face.id}`);
  const paths = generateParkPaths(outline, lawnPolygons, area, rng);
  const grassTufts = generateGrassTufts(lawnPolygons, paths, rng);
  const trees = generateTopDownBushes(outline, lawnPolygons, paths, area, rng, defense, isFortified);

  return {
    faceId: face.id,
    lawnPolygons,
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
  defense?: DefenseData,
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
    if (defense?.segments.length) {
      let tooCloseToDefense = false;
      for (const [a, b] of defense.segments) {
        if (distToSegment(cand, a, b) < FORTIFICATION_TREE_CLEAR_ZONE) {
          tooCloseToDefense = true;
          break;
        }
      }
      if (tooCloseToDefense) continue;
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

  // Fallback: at least one canopy if area is large enough, but NEVER violate fortification clear zone
  if (!trees.length && !isFortified) {
    const c = polygonCentroid(outline);
    if (pointInPolygon(c, outline)) {
      const nearDefense = defense?.segments.some(([a, b]) => distToSegment(c, a, b) < FORTIFICATION_TREE_CLEAR_ZONE);
      if (!nearDefense) {
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
