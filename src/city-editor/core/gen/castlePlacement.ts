import { boundaryEdges, insideRing } from "../fortifications";
import { clone, faceNeighbors, facePoints, insertEdgeVertex, mergeFaces, splitFace } from "../mesh";
import type { CastleSettings, CityDocument, Id, Mesh, Point } from "../types";
import { polygonHitsDocumentWater } from "../waterGeometry";
import { layoutCastle } from "./castleLayout";
import { nearestOnPolyline, polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";
import { makeRng } from "./prng";
import { townExtentMeters } from "./settlementExtent";
import type { BurgSiteTerrain } from "./site/burgSiteDescriptor";

export const DEFAULT_CASTLE_SETTINGS: CastleSettings = {
  position: "auto",
  relationship: "auto",
  form: "auto",
  size: "auto"
};
export interface CastleSite {
  seed: string;
  mesh: Mesh;
  faceId: Id;
  position: "edge" | "central";
  relationship: "integrated" | "detached";
  form: "keep-bailey" | "courtyard";
}

/** A straight local cut modifies real shared mesh edges, not just an SVG outline. */
function cutFace(
  document: CityDocument,
  id: Id,
  normal: Point,
  offset: number,
  snap: boolean
): { document: CityDocument; faceId: Id } | null {
  let next = document;
  const value = (p: Point) => p[0] * normal[0] + p[1] * normal[1] - offset;
  const polygon = facePoints(next.mesh, next.mesh.faces[id]);
  if (polygon.every(p => value(p) <= 0.01)) return { document: next, faceId: id };
  if (polygon.every(p => value(p) >= -0.01)) return null;
  const hits: Id[] = [];
  for (const ref of [...next.mesh.faces[id].boundary]) {
    const edge = next.mesh.edges[ref.edgeId];
    const a = next.mesh.vertices[edge.a].point,
      b = next.mesh.vertices[edge.b].point;
    const va = value(a),
      vb = value(b);
    if (Math.abs(va) < 0.01) hits.push(edge.a);
    if (snap && Math.abs(vb) <= 0.01) hits.push(edge.b);
    if (va * vb >= 0) continue;
    const t = va / (va - vb);
    // A cut that merely grazes a corner uses that vertex. The strict pass keeps
    // the old rejection so towns that already placed a castle stay put.
    if (t < 0.02 || t > 0.98) {
      if (!snap) return null;
      hits.push(t < 0.02 ? edge.a : edge.b);
      continue;
    }
    const inserted = insertEdgeVertex(next, edge.id, t);
    if (!inserted) return null;
    next = inserted.document;
    hits.push(inserted.vertexId);
  }
  const vertices = [...new Set(hits)];
  if (vertices.length !== 2) return null;
  const before = new Set(Object.keys(next.mesh.faces));
  const split = splitFace(next, id, vertices[0], vertices[1]);
  if (!split) return null;
  const child = Object.keys(split.mesh.faces).find(fid => !before.has(fid))!;
  const kept = [id, child].find(fid => value(polygonCentroid(facePoints(split.mesh, split.mesh.faces[fid]))) <= 0);
  return kept ? { document: split, faceId: kept } : null;
}

/** Axis-aligned or rotated square kept inside one face. `span` is the half-side. */
function reserveBox(
  document: CityDocument,
  faceId: Id,
  center: Point,
  span: number,
  angle: number,
  snap: boolean
): { document: CityDocument; faceId: Id } | null {
  const u: Point = [Math.cos(angle), Math.sin(angle)];
  const v: Point = [-u[1], u[0]];
  let working = document;
  let id = faceId;
  for (const normal of [u, [-u[0], -u[1]] as Point, v, [-v[0], -v[1]] as Point]) {
    const offset = center[0] * normal[0] + center[1] * normal[1] + span;
    const cut = cutFace(working, id, normal, offset, snap);
    if (!cut) return null;
    working = cut.document;
    id = cut.faceId;
  }
  return { document: working, faceId: id };
}

export function terrainHeight(terrain: BurgSiteTerrain | undefined, p: Point): number | null {
  const field = terrain?.heightfield;
  if (!field || field.size < 2 || field.elevationsMeters.length !== field.size ** 2) return null;
  const origin = ((field.size - 1) * field.spacingMeters) / 2;
  const x = Math.max(0, Math.min(field.size - 1, (p[0] + origin) / field.spacingMeters));
  const y = Math.max(0, Math.min(field.size - 1, (p[1] + origin) / field.spacingMeters));
  const ix = Math.min(field.size - 2, Math.floor(x)),
    iy = Math.min(field.size - 2, Math.floor(y));
  const tx = x - ix,
    ty = y - iy,
    v = field.elevationsMeters;
  return (
    (v[iy * field.size + ix] * (1 - tx) + v[iy * field.size + ix + 1] * tx) * (1 - ty) +
    (v[(iy + 1) * field.size + ix] * (1 - tx) + v[(iy + 1) * field.size + ix + 1] * tx) * ty
  );
}

function acceptReservedCastle(
  working: CityDocument,
  id: Id,
  args: {
    position: "edge" | "central";
    relationship: "integrated" | "detached";
    water: Set<Id>;
    urban: Set<Id>;
    rivers: Array<{ points: Point[]; width: number }>;
    boundary: ReturnType<typeof boundaryEdges>;
    minArea: number;
    seed: string;
    form: CastleSettings["form"];
    edgeClearance?: number;
    layoutMin?: number;
  }
): CastleSite | null {
  const { position, relationship, water, urban, rivers, boundary, minArea, seed } = args;
  const edgeClearance = args.edgeClearance ?? 5;
  const points = facePoints(working.mesh, working.mesh.faces[id]);
  const area = Math.abs(polygonArea(points));
  if (
    area < minArea ||
    area > 30000 ||
    polygonHitsDocumentWater(working, points) ||
    rivers.some(
      r =>
        points.some(p => nearestOnPolyline(p, r.points).dist < r.width / 2 + 5) ||
        r.points.some(p => insideRing(p, points)) ||
        r.points
          .slice(1)
          .some((p, i) => points.some((q, j) => segmentSegmentHit(r.points[i], p, q, points[(j + 1) % points.length])))
    )
  )
    return null;
  if (
    relationship === "detached" &&
    points.some(p =>
      boundary.some(ref => {
        const edge = working.mesh.edges[ref.edgeId];
        if (!edge) return false;
        return (
          nearestOnPolyline(p, [working.mesh.vertices[edge.a].point, working.mesh.vertices[edge.b].point]).dist <
          edgeClearance
        );
      })
    )
  )
    return null;
  if (!insideRing(polygonCentroid(points), points)) return null;
  const form =
    args.form === "auto" ? (makeRng(`${seed}:castle:shape`)() < 0.6 ? "keep-bailey" : "courtyard") : args.form;
  const trial = clone(working);
  trial.defenseCircuits = [
    {
      id: "trial-circuit",
      scope: "castle",
      ownerCastleId: "trial",
      areaFaceIds: [id],
      wallGroupIds: [],
      naturalBarriers: [],
      locked: false
    }
  ];
  const capable = trial.mesh.faces[id].boundary.some(ref => {
    const e = trial.mesh.edges[ref.edgeId];
    const other = e.leftFace === id ? e.rightFace : e.leftFace;
    if (!other || water.has(other) || (relationship === "integrated" && !urban.has(other))) return false;
    const a = trial.mesh.vertices[e.a].point,
      b = trial.mesh.vertices[e.b].point;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 14) return false;
    trial.mesh.vertices["trial-gate"] = {
      id: "trial-gate",
      point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      locked: false
    };
    trial.gates = [{ id: "trial-gate", vertexId: "trial-gate", ownerCastleId: "trial", locked: false }];
    return !!layoutCastle(
      trial,
      {
        id: "trial",
        version: 1,
        seed,
        position,
        relationship,
        form,
        circuitId: "trial-circuit",
        parts: [],
        courtyards: [],
        accesses: [],
        provenance: "generated",
        locked: false
      },
      args.layoutMin ?? 13
    );
  });
  if (!capable) return null;
  return { seed, mesh: working.mesh, faceId: id, position, relationship, form };
}

/** Reserve one compact, metrically bounded precinct before street routing. */
export function placeCastleRegion(
  document: CityDocument,
  urban: Set<Id>,
  water: Set<Id>,
  reserved: Set<Id>,
  rivers: Array<{ points: Point[]; width: number }>,
  seed: string,
  options: Partial<CastleSettings> = {},
  terrain?: BurgSiteTerrain,
  relaxed = false,
  allowRetry = true
): CastleSite | null {
  const settings = { ...DEFAULT_CASTLE_SETTINGS, ...options };
  if (settings.position === "central" && settings.relationship === "integrated") return null;
  const hasWalls = document.featureGroups.some(g => g.kind === "wall");
  if (settings.relationship === "integrated" && !hasWalls) return null;
  const rng = makeRng(`${seed}:castle:placement`);
  const preferred = settings.position === "auto" ? (rng() < 0.85 ? "edge" : "central") : settings.position;
  const positions =
    settings.position === "auto" ? ([preferred, preferred === "edge" ? "central" : "edge"] as const) : [preferred];
  const cityCenter = polygonCentroid([...urban].flatMap(id => facePoints(document.mesh, document.mesh.faces[id])));
  const boundary = boundaryEdges(document.mesh, urban);
  const border = new Set(
    boundary.flatMap(ref => {
      const e = document.mesh.edges[ref.edgeId];
      return [e.leftFace, e.rightFace].filter((id): id is Id => !!id);
    })
  );
  const size =
    settings.size === "auto"
      ? townExtentMeters(document.frame) <= 600 || document.frame.cityRadiusMeters <= 120
        ? "small"
        : "standard"
      : settings.size;
  const minArea = size === "small" ? 2500 : size === "large" ? 10000 : 5000;
  const target = size === "small" ? 4000 : size === "large" ? 18000 : 9000;
  for (const position of positions) {
    const relationship =
      position === "edge" && hasWalls && settings.relationship !== "detached" ? "integrated" : "detached";
    const interiorUrban = Object.values(document.mesh.faces).some(
      face => urban.has(face.id) && !border.has(face.id) && !water.has(face.id)
    );
    const candidates = Object.values(document.mesh.faces).filter(face => {
      if (
        water.has(face.id) ||
        reserved.has(face.id) ||
        face.properties.locked ||
        face.boundary.some(ref => document.mesh.edges[ref.edgeId].locked)
      )
        return false;
      if (Math.abs(polygonArea(facePoints(document.mesh, face))) < minArea * 0.15) return false;
      if (relationship === "integrated") return !urban.has(face.id) && border.has(face.id);
      // A tiny evolution town can be all edge cells. The strict pass keeps the
      // old interior-only central rule; the retry may cut a box out of the
      // cell nearest the middle.
      if (position === "central" && (!relaxed || interiorUrban)) return urban.has(face.id) && !border.has(face.id);
      return urban.has(face.id);
    });
    candidates.sort((a, b) => {
      const rate = (id: Id) => {
        const pts = facePoints(document.mesh, document.mesh.faces[id]),
          center = polygonCentroid(pts);
        const d = Math.hypot(center[0] - cityCenter[0], center[1] - cityCenter[1]);
        const height = terrainHeight(terrain, center) ?? 0;
        return (
          height * 2 +
          (position === "edge" ? d * 0.05 : -d * 0.2) -
          Math.abs(Math.abs(polygonArea(pts)) - target) * 0.001
        );
      };
      return rate(b.id) - rate(a.id) || a.id.localeCompare(b.id);
    });
    for (const candidate of candidates.slice(0, 40)) {
      let working = clone(document),
        id = candidate.id;
      let points = facePoints(working.mesh, working.mesh.faces[id]);
      // Grow a compact connected compound across small macro cells.
      while (Math.abs(polygonArea(points)) < minArea) {
        const neighbors = faceNeighbors(working.mesh, id).filter(
          fid =>
            !water.has(fid) &&
            !reserved.has(fid) &&
            !working.mesh.faces[fid].properties.locked &&
            (relationship === "integrated" ? !urban.has(fid) : urban.has(fid))
        );
        neighbors.sort((a, b) => {
          const c = polygonCentroid(points);
          const distance = (fid: Id) => {
            const p = polygonCentroid(facePoints(working.mesh, working.mesh.faces[fid]));
            return Math.hypot(p[0] - c[0], p[1] - c[1]);
          };
          return distance(a) - distance(b);
        });
        let merged: CityDocument | null = null;
        for (const neighbor of neighbors) {
          merged = mergeFaces(working, id, neighbor);
          if (merged) break;
        }
        if (!merged) break;
        working = merged;
        points = facePoints(working.mesh, working.mesh.faces[id]);
      }

      const center = polygonCentroid(points);
      // Detach within a large cell; four shared-edge cuts reserve a real polygon.
      // On a small unwalled town the first box sits on the urban rim. A later
      // pass slides it toward the burg and tries a slightly smaller square.
      if (relationship === "detached") {
        const span0 = Math.sqrt(target) / 2;
        const dx = cityCenter[0] - center[0];
        const dy = cityCenter[1] - center[1];
        const len = Math.hypot(dx, dy) || 1;
        const shifts = relaxed ? [0, 12, 28, 48] : [0];
        const scales = relaxed ? [1, 0.82, 0.68] : [1];
        const angles = relaxed ? [0, Math.PI / 6] : [0];
        const fitMin = relaxed ? Math.min(minArea, 1800) : minArea;
        const edgeClearance = relaxed ? 1 : 5;
        let placed: CastleSite | null = null;
        for (const shift of shifts) {
          const at: Point = [center[0] + (dx / len) * shift, center[1] + (dy / len) * shift];
          if (shift > 0 && !insideRing(at, points)) continue;
          for (const scale of scales) {
            for (const angle of angles) {
              const box = reserveBox(working, id, at, span0 * scale, angle, relaxed);
              if (!box) continue;
              placed = acceptReservedCastle(box.document, box.faceId, {
                position,
                relationship,
                water,
                urban,
                rivers,
                boundary,
                minArea: fitMin,
                seed,
                form: settings.form,
                edgeClearance,
                layoutMin: relaxed ? 8 : 13
              });
              if (placed) return placed;
            }
          }
        }
        continue;
      } else if (Math.abs(polygonArea(points)) > target * 1.5) {
        const interfaceRef = working.mesh.faces[id].boundary.find(ref => {
          const e = working.mesh.edges[ref.edgeId];
          return urban.has(e.leftFace ?? "") || urban.has(e.rightFace ?? "");
        });
        if (!interfaceRef) continue;
        const e = working.mesh.edges[interfaceRef.edgeId],
          a = working.mesh.vertices[e.a].point,
          b = working.mesh.vertices[e.b].point;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let n: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
        if ((center[0] - a[0]) * n[0] + (center[1] - a[1]) * n[1] < 0) n = [-n[0], -n[1]];
        const span = Math.sqrt(target) / 2,
          tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        const middle = ((a[0] + b[0]) * tangent[0]) / 2 + ((a[1] + b[1]) * tangent[1]) / 2;
        for (const [normal, offset] of [
          [n, a[0] * n[0] + a[1] * n[1] + span * 2],
          [tangent, middle + span],
          [[-tangent[0], -tangent[1]], -middle + span]
        ] as [Point, number][]) {
          const cut = cutFace(working, id, normal, offset, false);
          if (!cut) {
            id = "";
            break;
          }
          working = cut.document;
          id = cut.faceId;
        }
      }
      if (!id) continue;
      const site = acceptReservedCastle(working, id, {
        position,
        relationship,
        water,
        urban,
        rivers,
        boundary,
        minArea,
        seed,
        form: settings.form
      });
      if (site) return site;
    }
  }
  if (settings.relationship === "auto" && hasWalls) {
    const detached = placeCastleRegion(
      document,
      urban,
      water,
      reserved,
      rivers,
      seed,
      { ...options, relationship: "detached" },
      terrain,
      relaxed,
      false
    );
    if (detached) return detached;
  }
  if (allowRetry && !relaxed) {
    return placeCastleRegion(document, urban, water, reserved, rivers, seed, options, terrain, true, false);
  }
  return null;
}
