/**
 * Approach corridors and gate sectors (castle-road-siting-order.md §3.2–3.4).
 *
 * Roads exist before the castle: each road reserves a band from its outer end
 * to the point where it first meets the town outline, and that point owns an
 * arc of the outline where its gate will stand. The castle is placed beside
 * these, never on them.
 */
import { castleRoadEdgeAllowed } from "../castles";
import { insideRing } from "../fortifications";
import { facePoints } from "../mesh";
import type { CityDocument, Id, Mesh, Point } from "../types";
import {
  azimuthToVec,
  nearestOnPolyline,
  polygonCentroid,
  polylineLength,
  segmentSegmentHit,
  vecToAzimuth
} from "./geom";
import type { BorderLoop, CityGeography } from "./types";

export interface ApproachCorridor {
  /** Index of the gate this road feeds (importedRoads / roadPaths order). */
  index: number;
  sourceIndex: number;
  routeId: number;
  bearingDeg: number;
  /** Outer entry point → arrival on the outline. */
  centerline: Point[];
  halfWidthMeters: number;
  arrival: Point;
}

export interface GateSector {
  index: number;
  borderIndex: number;
  arrival: Point;
  radiusMeters: number;
  /** Outline samples within the arc, used for overlap and reach tests. */
  samples: Point[];
}

export type CastleCondition = "C1" | "C2" | "C3" | "C4";

export interface CastleSitingConstraints {
  corridors: ApproachCorridor[];
  sectors: GateSector[];
  /** Same form as castleRoadEdgeAllowed: (road + wall)/2 + 0.5 m. */
  clearanceMeters: number;
  /** Rejection tally, filled by placeCastleRegion for diagnostics. */
  report?: CastleSitingReport;
  /** Also require C4 on mesh edges with the street router's bans. Stricter
   * than the outcome: later passages and curtain repair can open streets the
   * planning mesh lacks (Menykutadi), so it is a retry after unconnected gates. */
  streetLinks?: boolean;
  /** Site a detached castle on the cells just outside the town, not on its
   * own cells. A retry after an FMG road found no way into the town. */
  outward?: boolean;
}

export interface CastleSitingReport {
  rejected: Record<CastleCondition, number>;
  corridors: Set<number>;
}

export function emptySitingReport(): CastleSitingReport {
  return { rejected: { C1: 0, C2: 0, C3: 0, C4: 0 }, corridors: new Set() };
}

/** Lines in the same order placeGates assigns its gates (gate i ↔ road i). */
function roadLines(
  geo: CityGeography,
  half: number
): { index: number; line: Point[]; sourceIndex: number; routeId: number }[] {
  if (geo.importedRoads !== undefined)
    return geo.importedRoads.flatMap((r, index) =>
      r.path.length >= 2 ? [{ index, line: r.path, sourceIndex: r.sourceIndex, routeId: r.routeId }] : []
    );
  const paths = geo.roadPaths?.filter(p => p.length >= 2) ?? [];
  if (paths.length) return paths.map((line, i) => ({ index: i, line, sourceIndex: i, routeId: -1 }));
  return geo.roadBearings.map((deg, i) => {
    const [x, y] = azimuthToVec(deg);
    return {
      line: [
        [0, 0],
        [x * half, y * half]
      ] as Point[],
      index: i,
      sourceIndex: i,
      routeId: -1
    };
  });
}

/** The first outline hit walking inward from the road's outer end. */
function firstBorderHit(
  line: Point[],
  borders: BorderLoop[]
): { point: Point; borderIndex: number; at: number } | null {
  for (let i = line.length - 1; i > 0; i--) {
    const a = line[i],
      b = line[i - 1];
    let best: { point: Point; borderIndex: number; t: number } | null = null;
    borders.forEach((border, borderIndex) => {
      const pts = border.points;
      for (let j = 0; j < pts.length; j++) {
        const hit = segmentSegmentHit(a, b, pts[j], pts[(j + 1) % pts.length]);
        if (hit && (!best || hit.t < best.t)) best = { point: hit.point, borderIndex, t: hit.t };
      }
    });
    const found = best as { point: Point; borderIndex: number } | null;
    if (found) return { point: found.point, borderIndex: found.borderIndex, at: i };
  }
  return null;
}

/** §3.2: one corridor per road, from the outer end to the outline. */
export function buildApproachCorridors(
  geo: CityGeography,
  borders: BorderLoop[],
  half: number,
  blockSizeMeters: number
): ApproachCorridor[] {
  if (!borders.length) return [];
  const halfWidthMeters = Math.max(12, blockSizeMeters * 0.5);
  const corridors: ApproachCorridor[] = [];
  for (const { index, line, sourceIndex, routeId } of roadLines(geo, half)) {
    const outer = line.at(-1)!;
    const bearingDeg = vecToAzimuth(outer[0], outer[1]);
    const hit = firstBorderHit(line, borders);
    let centerline: Point[];
    let arrival: Point;
    if (hit) {
      centerline = [...line.slice(hit.at).reverse(), hit.point];
      arrival = hit.point;
    } else {
      // The road never meets the outline (it starts outside the town): aim at
      // the outline vertex nearest its inner end.
      const inner = line[0];
      arrival = borders
        .flatMap(b => b.points)
        .reduce((p, q) =>
          Math.hypot(q[0] - inner[0], q[1] - inner[1]) < Math.hypot(p[0] - inner[0], p[1] - inner[1]) ? q : p
        );
      centerline = [...[...line].reverse(), arrival];
    }
    corridors.push({ index, sourceIndex, routeId, bearingDeg, centerline, halfWidthMeters, arrival });
  }
  return corridors;
}

/** Walk `radius` metres along a closed loop both ways from `from`, sampling. */
function arcSamples(points: Point[], from: Point, radius: number, step = 4): Point[] {
  const n = points.length;
  let seg = 0,
    bestDist = Infinity;
  for (let j = 0; j < n; j++) {
    const d = nearestOnPolyline(from, [points[j], points[(j + 1) % n]]).dist;
    if (d < bestDist) {
      bestDist = d;
      seg = j;
    }
  }
  const out: Point[] = [from];
  for (const dir of [1, -1]) {
    let at: Point = from;
    let left = radius;
    let j = dir === 1 ? (seg + 1) % n : seg;
    for (let guard = 0; guard < n && left > 0; guard++) {
      const next = points[j];
      const len = Math.hypot(next[0] - at[0], next[1] - at[1]);
      const take = Math.min(len, left);
      for (let s = step; s < take; s += step)
        out.push([at[0] + ((next[0] - at[0]) * s) / len, at[1] + ((next[1] - at[1]) * s) / len]);
      if (take < len) {
        out.push([at[0] + ((next[0] - at[0]) * take) / len, at[1] + ((next[1] - at[1]) * take) / len]);
        break;
      }
      out.push(next);
      left -= len;
      at = next;
      j = (j + dir + n) % n;
    }
  }
  return out;
}

/** §3.3 step 1: the outline arc each road's gate owns. */
export function planGateSectors(
  corridors: ApproachCorridor[],
  borders: BorderLoop[],
  blockSizeMeters: number,
  /** Leave outline for an edge castle. Calibrated on Senia/Dmitlitsk (571 m
   * outline, four roads): the nominal ±1.5 blocks covered 67% of the outline
   * and left no edge castle site, so all arcs together are capped at half of
   * the outline, keeping a gate-sized minimum. */
  roomForCastle = false
): GateSector[] {
  const nominal = Math.max(1.5 * blockSizeMeters, 25);
  const perimeter = borders.reduce((sum, b) => sum + polylineLength([...b.points, b.points[0]]), 0);
  const radiusMeters = roomForCastle
    ? Math.max(15, Math.min(nominal, perimeter / (4 * Math.max(1, corridors.length))))
    : nominal;
  return corridors.map(corridor => {
    let borderIndex = 0,
      best = Infinity;
    borders.forEach((border, i) => {
      const d = nearestOnPolyline(corridor.arrival, [...border.points, border.points[0]]).dist;
      if (d < best) {
        best = d;
        borderIndex = i;
      }
    });
    return {
      index: corridor.index,
      borderIndex,
      arrival: corridor.arrival,
      radiusMeters,
      samples: arcSamples(borders[borderIndex].points, corridor.arrival, radiusMeters)
    };
  });
}

function ringDistance(p: Point, ring: Point[]): number {
  if (insideRing(p, ring)) return 0;
  return nearestOnPolyline(p, [...ring, ring[0]]).dist;
}

function polylineRingDistance(line: Point[], ring: Point[]): number {
  for (let i = 1; i < line.length; i++)
    for (let j = 0; j < ring.length; j++)
      if (segmentSegmentHit(line[i - 1], line[i], ring[j], ring[(j + 1) % ring.length])) return 0;
  if (line.some(p => insideRing(p, ring))) return 0;
  const closed = [...ring, ring[0]];
  return Math.min(
    ...line.map(p => nearestOnPolyline(p, closed).dist),
    ...ring.map(q => nearestOnPolyline(q, line).dist)
  );
}

function faceAt(mesh: Mesh, p: Point): Id | null {
  for (const face of Object.values(mesh.faces)) if (insideRing(p, facePoints(mesh, face))) return face.id;
  return null;
}

interface FaceGraphArgs {
  mesh: Mesh;
  passable: (id: Id) => boolean;
  edgeOpen: (a: Point, b: Point) => boolean;
}

function reachable({ mesh, passable, edgeOpen }: FaceGraphArgs, start: Id, goal: (id: Id) => boolean): boolean {
  if (!passable(start)) return false;
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    if (goal(id)) return true;
    for (const ref of mesh.faces[id].boundary) {
      const e = mesh.edges[ref.edgeId];
      const other = e.leftFace === id ? e.rightFace : e.leftFace;
      if (!other || seen.has(other) || !passable(other)) continue;
      if (!edgeOpen(mesh.vertices[e.a].point, mesh.vertices[e.b].point)) continue;
      seen.add(other);
      queue.push(other);
    }
  }
  return false;
}

/**
 * Builds the C1–C4 judge for one placement call. Baselines (reach without any
 * castle) are measured on the untouched document so a corridor already cut by
 * the sea or a river does not fail every candidate.
 */
export function makeCastleJudge(
  document: CityDocument,
  urban: Set<Id>,
  water: Set<Id>,
  constraints: CastleSitingConstraints
): (
  working: CityDocument,
  castleId: Id,
  castle: Point[],
  installed?: CityDocument
) => { condition: CastleCondition; corridor: number } | null {
  const { corridors, sectors, clearanceMeters, streetLinks: checkStreets } = constraints;
  const urbanRings = [...urban].flatMap(id =>
    document.mesh.faces[id] ? [facePoints(document.mesh, document.mesh.faces[id])] : []
  );
  const waterRings = [...water].flatMap(id =>
    document.mesh.faces[id] ? [facePoints(document.mesh, document.mesh.faces[id])] : []
  );
  // Split faces get fresh ids; classify by centroid against the original sets.
  const classify = (mesh: Mesh) => {
    const cache = new Map<Id, "urban" | "water" | "land">();
    return (id: Id) => {
      let kind = cache.get(id);
      if (!kind) {
        const c = polygonCentroid(facePoints(mesh, mesh.faces[id]));
        kind =
          water.has(id) || waterRings.some(r => insideRing(c, r))
            ? "water"
            : urban.has(id) || urbanRings.some(r => insideRing(c, r))
              ? "urban"
              : "land";
        cache.set(id, kind);
      }
      return kind;
    };
  };
  const touchesSector = (mesh: Mesh, id: Id, sector: GateSector) => {
    const ring = facePoints(mesh, mesh.faces[id]);
    return sector.samples.some(p => ringDistance(p, ring) < 1);
  };

  const outsideReach = (mesh: Mesh, castleId: Id | null, castle: Point[] | null) => {
    const kind = classify(mesh);
    const graph: FaceGraphArgs = {
      mesh,
      passable: id => id !== castleId && kind(id) === "land",
      edgeOpen: (a, b) => !castle || ringDistance([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], castle) >= clearanceMeters
    };
    return corridors.map(corridor => {
      const sector = sectors.find(s => s.index === corridor.index);
      const start = faceAt(mesh, corridor.centerline[0]);
      if (!sector || !start) return null;
      if (start === castleId) return false;
      if (kind(start) !== "land") return null;
      return reachable(graph, start, id => touchesSector(mesh, id, sector));
    });
  };
  const innerLinks = (mesh: Mesh, castleId: Id | null) => {
    const kind = classify(mesh);
    const graph: FaceGraphArgs = {
      mesh,
      passable: id => id !== castleId && kind(id) === "urban",
      edgeOpen: () => true
    };
    const anchors = sectors.map(s =>
      Object.keys(mesh.faces).find(id => graph.passable(id) && touchesSector(mesh, id, s))
    );
    const links: boolean[][] = sectors.map(() => []);
    for (let i = 0; i < sectors.length; i++)
      for (let j = i + 1; j < sectors.length; j++) {
        const a = anchors[i],
          b = anchors[j];
        links[i][j] = !!a && !!b && reachable(graph, a, id => id === b);
      }
    return links;
  };
  // The face graph above lets two urban cells "connect" through a corner no
  // street can use: the router keeps streets off the town rim (except at a
  // gate) and off the castle walls (castleRoadEdgeAllowed). Breistattlin, a
  // walled village of ten cells, kept face links around a central keep while
  // no gate street could get past it. Repeat the check on mesh edges.
  // clearanceMeters is (road width + 3 m wall) / 2 + 0.5 m.
  const roadWidth = (clearanceMeters - 0.5) * 2 - 3;
  const streetLinks = (mesh: Mesh, castleId: Id | null, castle: Point[] | null, installed?: CityDocument) => {
    const kind = classify(mesh);
    const open = (id: Id | null | undefined) => !!id && id !== castleId && kind(id) === "urban";
    const adjacent = new Map<Id, Id[]>();
    const rim = new Set<Id>();
    for (const e of Object.values(mesh.edges)) {
      const left = open(e.leftFace),
        right = open(e.rightFace);
      if (left !== right) {
        rim.add(e.a);
        rim.add(e.b);
      }
      if (!left || !right) continue;
      if (installed) {
        if (!castleRoadEdgeAllowed(installed, e.id, roadWidth)) continue;
      } else if (castle) {
        const a = mesh.vertices[e.a].point,
          b = mesh.vertices[e.b].point;
        const near = [0, 0.25, 0.5, 0.75, 1].some(
          t => ringDistance([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], castle) < clearanceMeters
        );
        if (near) continue;
      }
      adjacent.set(e.a, [...(adjacent.get(e.a) ?? []), e.b]);
      adjacent.set(e.b, [...(adjacent.get(e.b) ?? []), e.a]);
    }
    const anchors = sectors.map(
      s =>
        new Set(
          [...rim].filter(id => {
            const p = mesh.vertices[id].point;
            return s.samples.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.5);
          })
        )
    );
    const links: boolean[][] = sectors.map(() => []);
    for (let i = 0; i < sectors.length; i++) {
      const seen = new Set(anchors[i]);
      const queue = [...anchors[i]];
      while (queue.length)
        for (const next of adjacent.get(queue.shift()!) ?? [])
          if (!seen.has(next)) {
            seen.add(next);
            if (!rim.has(next)) queue.push(next);
          }
      for (let j = i + 1; j < sectors.length; j++) links[i][j] = [...anchors[j]].some(id => seen.has(id));
    }
    return links;
  };
  const baseReach = outsideReach(document.mesh, null, null);
  const baseLinks = innerLinks(document.mesh, null);
  const baseStreets = checkStreets ? streetLinks(document.mesh, null, null) : [];

  return (working, castleId, castle, installed) => {
    for (const corridor of corridors) {
      if (polylineRingDistance(corridor.centerline, castle) < Math.max(corridor.halfWidthMeters, clearanceMeters))
        return { condition: "C1", corridor: corridor.index };
    }
    for (const sector of sectors) {
      if (sector.samples.some(p => ringDistance(p, castle) < 1)) return { condition: "C2", corridor: sector.index };
    }
    const reach = outsideReach(working.mesh, castleId, castle);
    for (let i = 0; i < corridors.length; i++) {
      if (baseReach[i] && reach[i] === false) return { condition: "C3", corridor: corridors[i].index };
    }
    const links = innerLinks(working.mesh, castleId);
    for (let i = 0; i < sectors.length; i++)
      for (let j = i + 1; j < sectors.length; j++)
        if (baseLinks[i][j] && !links[i][j]) return { condition: "C4", corridor: sectors[i].index };
    if (!checkStreets) return null;
    const streets = installed
      ? streetLinks(installed.mesh, castleId, castle, installed)
      : streetLinks(working.mesh, castleId, castle);
    for (let i = 0; i < sectors.length; i++)
      for (let j = i + 1; j < sectors.length; j++)
        if (baseStreets[i][j] && !streets[i][j]) return { condition: "C4", corridor: sectors[i].index };
    return null;
  };
}
