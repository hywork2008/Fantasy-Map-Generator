import { installCastle } from "../castles";
import { boundaryEdges, insideRing } from "../fortifications";
import { clone, faceNeighbors, facePoints, insertEdgeVertex, mergeFaces, splitFace } from "../mesh";
import type { CastleSettings, CityDocument, Id, Mesh, Point } from "../types";
import { polygonHitsDocumentWater } from "../waterGeometry";
import { type CastleSitingConstraints, emptySitingReport, makeCastleJudge } from "./approachCorridors";
import { layoutCastle } from "./castleLayout";
import { azimuthToVec, nearestOnPolyline, polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";
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
  style?: import("../../render/castlePatterns").CastleStyle;
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
    style?: CastleSettings["style"];
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
  return {
    seed,
    mesh: working.mesh,
    faceId: id,
    position,
    relationship,
    form,
    ...(args.style && args.style !== "auto" ? { style: args.style } : {})
  };
}

/** `tiny` is never chosen up front: it is the last auto step for a hamlet or
 * fort town whose whole urban area is only a few times a small castle. */
type CastleSize = "tiny" | "small" | "standard" | "large";
type CastleJudge = ReturnType<typeof makeCastleJudge>;

/**
 * Reserve one compact, metrically bounded precinct before street routing.
 *
 * With `constraints`, every candidate must leave the road corridors, gate
 * sectors, outside reach and gate-to-gate links intact (C1–C4 in
 * castle-road-siting-order.md §3.4); those are hard filters, not penalties.
 * Fallback order: smaller size, then detached, then no castle.
 */
export function placeCastleRegion(
  document: CityDocument,
  urban: Set<Id>,
  water: Set<Id>,
  reserved: Set<Id>,
  rivers: Array<{ points: Point[]; width: number }>,
  seed: string,
  options: Partial<CastleSettings> = {},
  terrain?: BurgSiteTerrain,
  constraints?: CastleSitingConstraints
): CastleSite | null {
  const settings = { ...DEFAULT_CASTLE_SETTINGS, ...options };
  if (settings.position === "central" && settings.relationship === "integrated") return null;
  const hasWalls = document.featureGroups.some(g => g.kind === "wall");
  if (settings.relationship === "integrated" && !hasWalls) return null;
  const size: CastleSize =
    settings.size === "auto"
      ? townExtentMeters(document.frame) <= 600 || document.frame.cityRadiusMeters <= 120
        ? "small"
        : "standard"
      : settings.size;
  // Step down one size only for an auto size under road constraints; an
  // explicit size is the user's choice and falls through to detached instead.
  const sizes: CastleSize[] =
    settings.size !== "auto" ? [size] : size === "standard" ? ["standard", "small", "tiny"] : [size, "tiny"];
  const relationships: CastleSettings["relationship"][] =
    settings.relationship === "auto" && hasWalls ? ["auto", "detached"] : [settings.relationship];
  if (constraints && !constraints.report) constraints.report = emptySitingReport();
  const judge = constraints?.corridors.length ? makeCastleJudge(document, urban, water, constraints) : undefined;
  // A small unwalled town (Akros, Pitrorinthe: ~200 people) has too little
  // room for a castle on its own cells, and one that does fit tends to cut an
  // FMG road off (Nyirnya). The inward search there was slow and failed into
  // a whole retry; try the cells just outside first, inward after.
  const outwardModes =
    constraints &&
    !constraints.outward &&
    !hasWalls &&
    urbanLandArea(document, urban, water) <= OUTWARD_FIRST_URBAN_RATIO * castleTargetArea(size)
      ? [true, false]
      : [!!constraints?.outward];
  for (const outward of outwardModes)
    for (const relationship of relationships)
      for (const [i, sz] of sizes.entries()) {
        if (i > 0 && !judge) break;
        for (const relaxed of [false, true]) {
          const site = placeCastlePass(
            document,
            urban,
            water,
            reserved,
            rivers,
            seed,
            { ...settings, relationship },
            sz,
            terrain,
            relaxed,
            constraints && { ...constraints, outward },
            judge
          );
          if (site) return site;
        }
      }
  return null;
}

/** Urban land at or below this many castle footprints sites the castle outside first. */
const OUTWARD_FIRST_URBAN_RATIO = 12;

function castleTargetArea(size: CastleSize): number {
  return size === "tiny" ? 1800 : size === "small" ? 4000 : size === "large" ? 18000 : 9000;
}

function urbanLandArea(document: CityDocument, urban: Set<Id>, water: Set<Id>): number {
  let area = 0;
  for (const id of urban) {
    const face = document.mesh.faces[id];
    if (face && !water.has(id)) area += Math.abs(polygonArea(facePoints(document.mesh, face)));
  }
  return area;
}

function placeCastlePass(
  document: CityDocument,
  urban: Set<Id>,
  water: Set<Id>,
  reserved: Set<Id>,
  rivers: Array<{ points: Point[]; width: number }>,
  seed: string,
  settings: CastleSettings,
  size: CastleSize,
  terrain: BurgSiteTerrain | undefined,
  relaxed: boolean,
  constraints: CastleSitingConstraints | undefined,
  judge: CastleJudge | undefined
): CastleSite | null {
  const hasWalls = document.featureGroups.some(g => g.kind === "wall");
  const rng = makeRng(`${seed}:castle:placement`);
  // A detached castle on a tiny town's own cells can cover the middle and cut
  // an FMG road off (Kesztvarvarke); the retry pushes it onto the rim instead.
  const outward = !!constraints?.outward;
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
  const minArea = size === "tiny" ? 1200 : size === "small" ? 2500 : size === "large" ? 10000 : 5000;
  const target = castleTargetArea(size);
  const block = document.frame.blockSizeMeters;
  const corridors = constraints?.corridors ?? [];
  // H2/H4: the land front is where the roads come from; the castle backs away
  // from it (toward water when there is any).
  const roadMean = corridors.reduce<Point>(
    (sum, c) => {
      const v = azimuthToVec(c.bearingDeg);
      return [sum[0] + v[0], sum[1] + v[1]];
    },
    [0, 0]
  );
  const roadMeanLen = Math.hypot(...roadMean);
  // Convex corners of the town outline (H4): turning angle at each boundary vertex.
  const cornerTurn = new Map<Id, number>();
  {
    const around = new Map<Id, Id[]>();
    for (const ref of boundary) {
      const e = document.mesh.edges[ref.edgeId];
      around.set(e.a, [...(around.get(e.a) ?? []), e.b]);
      around.set(e.b, [...(around.get(e.b) ?? []), e.a]);
    }
    const urbanRings = [...urban].map(id => facePoints(document.mesh, document.mesh.faces[id]));
    for (const [v, nbrs] of around) {
      if (nbrs.length !== 2) continue;
      const p = document.mesh.vertices[v].point,
        a = document.mesh.vertices[nbrs[0]].point,
        b = document.mesh.vertices[nbrs[1]].point;
      const u: Point = [a[0] - p[0], a[1] - p[1]],
        w: Point = [b[0] - p[0], b[1] - p[1]];
      const interior = Math.acos(
        Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w) || 1)))
      );
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (urbanRings.some(r => insideRing(mid, r))) cornerTurn.set(v, Math.PI - interior);
    }
  }
  const touchesWater = (id: Id) => faceNeighbors(document.mesh, id).some(fid => water.has(fid));
  const accept = (working: CityDocument, id: Id, args: Parameters<typeof acceptReservedCastle>[2]) => {
    const site = acceptReservedCastle(working, id, args);
    if (!site) return null;
    // The trial layout ignores the gate's exterior access arm, which
    // installCastle needs later; a site without one fails after streets.
    const installed = installCastle(working, site, id, seed);
    if (!installed) return null;
    if (!judge) return site;
    const verdict = judge(working, id, facePoints(working.mesh, working.mesh.faces[id]), installed);
    if (!verdict) return site;
    const report = constraints!.report!;
    report.rejected[verdict.condition]++;
    report.corridors.add(verdict.corridor);
    return null;
  };
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
      if (relationship === "integrated" || outward) return !urban.has(face.id) && border.has(face.id);
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
        const areaFit = -Math.abs(Math.abs(polygonArea(pts)) - target) * 0.001;
        if (position === "central") return height * 2 - d * 0.2 + areaFit;
        if (!corridors.length) return height * 2 + d * 0.05 + areaFit;
        // S_landFront replaces the old "farther is better" term, which pulled
        // the castle toward wherever the roads arrive.
        const dir: Point = [(center[0] - cityCenter[0]) / (d || 1), (center[1] - cityCenter[1]) / (d || 1)];
        const landFront =
          (roadMeanLen > 0.2 ? -((dir[0] * roadMean[0] + dir[1] * roadMean[1]) / roadMeanLen) * 10 : 0) +
          (touchesWater(id) ? 6 : 0);
        const corner =
          Math.max(
            0,
            ...document.mesh.faces[id].boundary.map(ref => {
              const e = document.mesh.edges[ref.edgeId];
              return Math.max(cornerTurn.get(e.a) ?? 0, cornerTurn.get(e.b) ?? 0);
            })
          ) * 4;
        const reach = Math.min(...corridors.map(c => nearestOnPolyline(center, c.centerline).dist));
        const command =
          reach < block
            ? (6 * reach) / block
            : reach <= 3 * block
              ? 6
              : 6 * Math.max(0, 1 - (reach - 3 * block) / (3 * block));
        return height * 2 + landFront + corner + command + areaFit;
      };
      return rate(b.id) - rate(a.id) || a.id.localeCompare(b.id);
    });
    for (const candidate of candidates.slice(0, 40)) {
      let working = clone(document),
        id = candidate.id;
      let points = facePoints(working.mesh, working.mesh.faces[id]);
      // Grow a compact connected compound across small macro cells. A tiny
      // town's cells are smaller than the castle box itself, so that step
      // grows until the box (and its clearance) can be cut from the compound.
      const grow = size === "tiny" ? target * 1.6 : minArea;
      while (Math.abs(polygonArea(points)) < grow) {
        const neighbors = faceNeighbors(working.mesh, id).filter(
          fid =>
            !water.has(fid) &&
            !reserved.has(fid) &&
            !working.mesh.faces[fid].properties.locked &&
            (relationship === "integrated" || outward ? !urban.has(fid) : urban.has(fid))
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
              placed = accept(box.document, box.faceId, {
                position,
                relationship,
                water,
                urban,
                rivers,
                boundary,
                minArea: fitMin,
                seed,
                form: settings.form,
                style: settings.style,
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
      const site = accept(working, id, {
        position,
        relationship,
        water,
        urban,
        rivers,
        boundary,
        minArea,
        seed,
        form: settings.form,
        style: settings.style
      });
      if (site) return site;
    }
  }
  return null;
}
